import { supabase } from '../services/supabaseClient.js';
import { encodeGeohash, getGeohashNeighbors } from '../utils/geohash.js';
import { getDistance } from '../utils/haversine.js';
import { SupabasePoiCacheStore } from './SupabasePoiCacheStore.js';
import { isCacheEntryFresh, derivePOICategory } from './poiTypes.js';
import {
  POI_SEARCH_RADIUS_METERS,
  POI_FETCH_THRESHOLD_RATIO,
  POI_DEBOUNCE_MS,
  POI_GEOHASH_PRECISION,
  POI_CACHE_TTL_SECONDS,
} from './poiConstants.js';

/**
 * PoiDiscoveryService
 *
 * Orchestrates nearby-places discovery for the active tracking session.
 * Owns: distance-gate, debounce, cache reads via PoiCacheStore, SWR,
 * deduplication by OSM id, concurrent-revalidation guard, and offline fallback.
 *
 * Usage:
 *   const service = new PoiDiscoveryService();
 *   const pois = await service.onPositionUpdate(lat, lng);
 */
export class PoiDiscoveryService {
  /** @type {SupabasePoiCacheStore} */
  #store = new SupabasePoiCacheStore();

  /** @type {{ lat: number, lng: number } | null} */
  #lastFetchLocation = null;

  /** @type {number | null} — setTimeout handle for debounce */
  #debounceTimer = null;

  /**
   * Guard: geohashes whose revalidation is currently in-flight.
   * Prevents duplicate concurrent Overpass calls for the same cell.
   * @type {Set<string>}
   */
  #inFlightGeohashes = new Set();

  /**
   * Deduplicated POI store: OSM composite id → NormalizedPoi.
   * @type {Map<string, import('./poiTypes.js').NormalizedPoi>}
   */
  #poiMap = new Map();

  /**
   * Offline fallback: the last successfully rendered POI array.
   * Survives momentary connectivity loss so markers don't disappear.
   * @type {import('./poiTypes.js').NormalizedPoi[]}
   */
  #lastKnownPois = [];

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Must be called on every position update from useGeolocation.
   * Returns the current deduplicated POI list immediately (from the in-memory
   * map), and schedules a fetch cycle if the movement + debounce gate passes.
   *
   * @param {number} lat
   * @param {number} lng
   * @returns {import('./poiTypes.js').NormalizedPoi[]}
   */
  onPositionUpdate(lat, lng) {
    const thresholdMeters = POI_SEARCH_RADIUS_METERS * POI_FETCH_THRESHOLD_RATIO;

    const shouldTrigger =
      !this.#lastFetchLocation ||
      getDistance(
        this.#lastFetchLocation.lat,
        this.#lastFetchLocation.lng,
        lat,
        lng
      ) >= thresholdMeters;

    if (shouldTrigger) {
      // Clear any pending debounce and start a new one
      if (this.#debounceTimer !== null) {
        clearTimeout(this.#debounceTimer);
      }

      this.#debounceTimer = setTimeout(() => {
        this.#debounceTimer = null;
        // Run asynchronously — never blocks the caller
        this.#runFetchCycle(lat, lng).catch((err) => {
          console.warn('[PoiDiscoveryService] fetch cycle error (non-fatal):', err);
        });
      }, POI_DEBOUNCE_MS);
    }

    // Return immediately from in-memory state (may be empty on first load)
    return this.#currentPois();
  }

  /**
   * Resets state when the user stops a recording session.
   */
  reset() {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    this.#lastFetchLocation = null;
    this.#poiMap.clear();
    this.#inFlightGeohashes.clear();
  }

  // ── Private methods ──────────────────────────────────────────────────────

  /**
   * Main fetch cycle: reads from the cache (current cell + 8 neighbors),
   * merges fresh POIs into the dedup map, and triggers background SWR
   * revalidation for stale cells.
   * @param {number} lat
   * @param {number} lng
   */
  async #runFetchCycle(lat, lng) {
    this.#lastFetchLocation = { lat, lng };

    const centerHash = encodeGeohash(lat, lng, POI_GEOHASH_PRECISION);
    const neighborHashes = getGeohashNeighbors(centerHash);
    const allHashes = [centerHash, ...neighborHashes];

    let cacheMap;
    try {
      cacheMap = await this.#store.getManyStaleOrFresh(allHashes);
    } catch (err) {
      console.warn('[PoiDiscoveryService] cache read failed, using offline fallback:', err);
      // Fail gracefully — don't touch the existing poiMap, just return
      return;
    }

    for (const hash of allHashes) {
      const entry = cacheMap.get(hash);

      if (!entry) {
        // Complete cache miss — fetch immediately (await so caller gets fresh data)
        await this.#revalidateCell(hash, lat, lng);
      } else {
        // Merge whatever we have (fresh or stale) into the dedup map right away
        this.#mergePois(entry.pois);

        if (!isCacheEntryFresh(entry)) {
          // Stale-while-revalidate: fire background refresh, do NOT await
          this.#revalidateCellBackground(hash, lat, lng);
        }
      }
    }

    // Persist last-known POIs for offline fallback
    this.#lastKnownPois = this.#currentPois();

    // Persist to IndexedDB for deeper offline resilience (fire-and-forget)
    this.#persistToIndexedDB(this.#lastKnownPois).catch(() => {/* non-fatal */});
  }

  /**
   * Awaited revalidation — used for cache misses where we want fresh data now.
   * @param {string} geohash
   * @param {number} lat
   * @param {number} lng
   */
  async #revalidateCell(geohash, lat, lng) {
    if (this.#inFlightGeohashes.has(geohash)) return;
    this.#inFlightGeohashes.add(geohash);

    try {
      const pois = await this.#callEdgeFunction(geohash, lat, lng);
      this.#mergePois(pois);
      this.#lastKnownPois = this.#currentPois();
    } catch (err) {
      console.warn(`[PoiDiscoveryService] revalidateCell failed for ${geohash}:`, err);
    } finally {
      this.#inFlightGeohashes.delete(geohash);
    }
  }

  /**
   * Fire-and-forget revalidation for stale-while-revalidate.
   * Updates the cache row in the background; updates the in-memory map
   * when the response arrives.
   * @param {string} geohash
   * @param {number} lat
   * @param {number} lng
   */
  #revalidateCellBackground(geohash, lat, lng) {
    if (this.#inFlightGeohashes.has(geohash)) return;
    this.#inFlightGeohashes.add(geohash);

    this.#callEdgeFunction(geohash, lat, lng)
      .then((pois) => {
        this.#mergePois(pois);
        this.#lastKnownPois = this.#currentPois();
      })
      .catch((err) => {
        console.warn(`[PoiDiscoveryService] background revalidation failed for ${geohash}:`, err);
      })
      .finally(() => {
        this.#inFlightGeohashes.delete(geohash);
      });
  }

  /**
   * Calls the `fetch-pois` Supabase Edge Function.
   * The Edge Function fetches Overpass and writes to poi_cache via service role.
   * @param {string} geohash
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<import('./poiTypes.js').NormalizedPoi[]>}
   */
  async #callEdgeFunction(geohash, lat, lng) {
    const { data, error } = await supabase.functions.invoke('fetch-pois', {
      body: {
        geohash,
        lat,
        lng,
        radiusMeters: POI_SEARCH_RADIUS_METERS,
        ttlSeconds:   POI_CACHE_TTL_SECONDS,
      },
    });

    if (error) throw new Error(error.message);
    return Array.isArray(data?.pois) ? data.pois : [];
  }

  /**
   * Merges a POI array into the internal dedup map.
   * Keyed by "<osmType>/<osmId>" — duplicate entries are silently skipped.
   * @param {import('./poiTypes.js').NormalizedPoi[]} pois
   */
  #mergePois(pois) {
    for (const poi of pois) {
      if (!this.#poiMap.has(poi.id)) {
        this.#poiMap.set(poi.id, poi);
      }
    }
  }

  /**
   * Returns the current deduplicated POI array.
   * Falls back to the last-known array if the map is empty (offline scenario).
   * @returns {import('./poiTypes.js').NormalizedPoi[]}
   */
  #currentPois() {
    if (this.#poiMap.size > 0) {
      return Array.from(this.#poiMap.values());
    }
    return this.#lastKnownPois;
  }

  // ── IndexedDB offline mirror ─────────────────────────────────────────────

  static #IDB_DB_NAME    = 'pathfinder-poi-cache';
  static #IDB_STORE_NAME = 'lastKnownPois';
  static #IDB_KEY        = 'pois';

  /** @param {import('./poiTypes.js').NormalizedPoi[]} pois */
  async #persistToIndexedDB(pois) {
    const db = await this.#openIDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(PoiDiscoveryService.#IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PoiDiscoveryService.#IDB_STORE_NAME);
      store.put(pois, PoiDiscoveryService.#IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  /** @returns {Promise<IDBDatabase>} */
  #openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(PoiDiscoveryService.#IDB_DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(PoiDiscoveryService.#IDB_STORE_NAME)) {
          db.createObjectStore(PoiDiscoveryService.#IDB_STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Loads previously persisted POIs from IndexedDB.
   * Call this on service initialization to pre-populate the offline fallback.
   * @returns {Promise<void>}
   */
  async loadFromIndexedDB() {
    try {
      const db   = await this.#openIDB();
      const pois = await new Promise((resolve, reject) => {
        const tx    = db.transaction(PoiDiscoveryService.#IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(PoiDiscoveryService.#IDB_STORE_NAME);
        const req   = store.get(PoiDiscoveryService.#IDB_KEY);
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror   = () => reject(req.error);
      });
      if (Array.isArray(pois)) {
        this.#lastKnownPois = pois;
        this.#mergePois(pois);
      }
    } catch {
      // Non-fatal — IndexedDB may be unavailable in some browser contexts
    }
  }
}
