import { supabase } from '../services/supabaseClient.js';
import { encodeGeohash, getGeohashNeighbors } from '../utils/geohash.js';
import { getDistance } from '../utils/haversine.js';
import { SupabasePoiCacheStore } from './SupabasePoiCacheStore.js';
import { isCacheEntryFresh } from './poiTypes.js';
import {
  POI_SEARCH_RADIUS_METERS,
  POI_FETCH_THRESHOLD_RATIO,
  POI_THROTTLE_INTERVAL_MS,
  POI_GEOHASH_PRECISION,
  POI_CACHE_TTL_SECONDS,
} from './poiConstants.js';

/**
 * PoiDiscoveryService
 *
 * Orchestrates nearby-places discovery for the active tracking session.
 * Owns: distance-gate, leading+trailing edge throttle, geohash cache reads,
 * stale-while-revalidate, OSM ID deduplication, and offline fallback.
 *
 * Throttle behaviour:
 *   - Leading edge:  first qualifying trigger fires immediately.
 *   - Cooldown:      subsequent triggers within 9s are suppressed but the
 *                    most recent position is saved.
 *   - Trailing edge: when the cooldown expires, if any trigger was suppressed,
 *                    one final fetch fires with the latest suppressed position.
 *
 * Usage:
 *   const service = new PoiDiscoveryService();
 *   const pois = service.onPositionUpdate(lat, lng);
 */
export class PoiDiscoveryService {
  /** @type {SupabasePoiCacheStore} */
  #store = new SupabasePoiCacheStore();

  /** @type {{ lat: number, lng: number } | null} */
  #lastFetchLocation = null;

  /** @type {number | null} — setTimeout handle for throttle cooldown */
  #throttleTimer = null;

  /**
   * The most recent position that was suppressed during a throttle cooldown.
   * Used by the trailing edge to fire one final fetch when the cooldown expires.
   * @type {{ lat: number, lng: number } | null}
   */
  #pendingTrailingPosition = null;

  /** @type {Set<string>} */
  #inFlightGeohashes = new Set();

  /**
    * Deduplicated POI store: OSM composite ID → NormalizedPoi.
   * @type {Map<string, import('./poiTypes.js').NormalizedPoi>}
   */
  #poiMap = new Map();

  /**
   * Offline fallback: the last successfully rendered POI array.
   * Survives momentary connectivity loss so markers don't disappear.
   * @type {import('./poiTypes.js').NormalizedPoi[]}
   */
  #lastKnownPois = [];

  /** @type {Set<(pois: import('./poiTypes.js').NormalizedPoi[]) => void>} */
  #listeners = new Set();

  #providerBackoffUntil = 0;
  #providerBackoffMs = 0;
  #sessionVersion = 0;

  static #MAX_POIS = 300;

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Must be called on every position update from useGeolocation.
   * Returns the current deduplicated POI list immediately (from the in-memory
   * map), and fires a fetch cycle via leading+trailing edge throttle if the
   * movement gate is crossed.
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
      if (this.#throttleTimer === null) {
        // ── Leading edge: no cooldown active → fire immediately ──────────
        this.#startCooldown();
        this.#runFetchCycle(lat, lng).catch((err) => {
          console.warn('[PoiDiscoveryService] fetch cycle error (non-fatal):', err);
        });
      } else {
        // ── Inside cooldown: save position for trailing edge ─────────────
        this.#pendingTrailingPosition = { lat, lng };
      }
    }

    // Return immediately from in-memory state (may be empty on first load)
    return this.#currentPois();
  }

  /** @param {(pois: import('./poiTypes.js').NormalizedPoi[]) => void} listener */
  onPoisUpdated(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #publishPois() {
    const pois = this.#currentPois();
    for (const listener of this.#listeners) {
      try {
        listener(pois);
      } catch (err) {
        console.warn('[PoiDiscoveryService] POI listener failed:', err);
      }
    }
  }

  #increaseProviderBackoff() {
    this.#providerBackoffMs = Math.min(this.#providerBackoffMs ? this.#providerBackoffMs * 2 : 9_000, 60_000);
    this.#providerBackoffUntil = Date.now() + this.#providerBackoffMs;
  }

  /**
   * Starts the throttle cooldown window.
   * When the cooldown expires, checks for a suppressed trailing-edge position
   * and fires one final fetch cycle if present.
   */
  #startCooldown() {
    this.#throttleTimer = setTimeout(() => {
      this.#throttleTimer = null;

      // ── Trailing edge: fire if any trigger was suppressed during cooldown
      if (this.#pendingTrailingPosition) {
        const { lat, lng } = this.#pendingTrailingPosition;
        this.#pendingTrailingPosition = null;
        this.#startCooldown(); // new cooldown for the trailing fire
        this.#runFetchCycle(lat, lng).catch((err) => {
          console.warn('[PoiDiscoveryService] fetch cycle error (non-fatal):', err);
        });
      }
    }, POI_THROTTLE_INTERVAL_MS);
  }

  /**
   * Resets state when the user stops a recording session.
   */
  reset() {
    this.#sessionVersion += 1;
    const offlinePois = this.#currentPois()
      .filter((poi) => /^(node|way|relation)\//.test(poi?.id ?? ''));
    if (this.#throttleTimer !== null) {
      clearTimeout(this.#throttleTimer);
      this.#throttleTimer = null;
    }
    this.#pendingTrailingPosition = null;
    this.#lastFetchLocation = null;
    this.#lastKnownPois = offlinePois;
    this.#mergePois(offlinePois);
    this.#inFlightGeohashes.clear();
    this.#providerBackoffUntil = 0;
    this.#providerBackoffMs = 0;
    this.#publishPois();
  }

  // ── Private methods ──────────────────────────────────────────────────────

  /**
  * Reads the center cell and eight neighbors, serving cached data immediately
  * and refreshing stale/missing entries through the Edge Function.
   * @param {number} lat
   * @param {number} lng
   */
  async #runFetchCycle(lat, lng) {
    const sessionVersion = this.#sessionVersion;
    this.#lastFetchLocation = { lat, lng };
    const centerHash = encodeGeohash(lat, lng, POI_GEOHASH_PRECISION);
    const allHashes = [centerHash, ...getGeohashNeighbors(centerHash)];

    let cacheMap;
    try {
      cacheMap = await this.#store.getManyStaleOrFresh(allHashes);
    } catch (err) {
      console.warn('[PoiDiscoveryService] cache read failed, using offline fallback:', err);
      return;
    }

    if (sessionVersion !== this.#sessionVersion) return;

    for (const geohash of allHashes) {
      const entry = cacheMap.get(geohash);
      if (entry) {
        this.#mergePois(entry.pois);
        if (!isCacheEntryFresh(entry)) {
          this.#fetchNearbyPois(geohash, lat, lng, sessionVersion).catch(() => {});
        }
      } else {
        await this.#fetchNearbyPois(geohash, lat, lng, sessionVersion);
        if (sessionVersion !== this.#sessionVersion) return;
      }
    }

    this.#lastKnownPois = this.#currentPois();
    this.#publishPois();
    this.#persistToIndexedDB(this.#lastKnownPois).catch(() => {/* non-fatal */});
  }

  /**
  * Performs one fresh provider lookup for the active geohash.
   * @param {string} geohash
   * @param {number} lat
   * @param {number} lng
   */
  async #fetchNearbyPois(geohash, lat, lng, sessionVersion) {
    if (this.#inFlightGeohashes.has(geohash)) return false;
    this.#inFlightGeohashes.add(geohash);

    try {
      const pois = await this.#callEdgeFunction(geohash, lat, lng);
      if (sessionVersion !== this.#sessionVersion || !Array.isArray(pois)) return false;
      this.#mergePois(pois);
      this.#lastKnownPois = this.#currentPois();
      this.#publishPois();
      this.#persistToIndexedDB(this.#lastKnownPois).catch(() => {/* non-fatal */});
      return true;
    } catch (err) {
      console.warn(`[PoiDiscoveryService] nearby lookup failed for ${geohash}:`, err);
      return false;
    } finally {
      if (sessionVersion === this.#sessionVersion) {
        this.#inFlightGeohashes.delete(geohash);
      }
    }
  }

  /**
   * Calls the `fetch-pois` Supabase Edge Function.
    * The Edge Function fetches Overpass and writes the result to poi_cache.
   * @param {string} geohash
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<import('./poiTypes.js').NormalizedPoi[] | null>}
   */
  async #callEdgeFunction(geohash, lat, lng) {
    if (Date.now() < this.#providerBackoffUntil) return null;

    let data;
    try {
      const result = await supabase.functions.invoke('fetch-pois', {
        body: {
          geohash,
          lat,
          lng,
          radiusMeters: POI_SEARCH_RADIUS_METERS,
          ttlSeconds: POI_CACHE_TTL_SECONDS,
        },
      });
      if (result.error) throw new Error(result.error.message);
      data = result.data;
    } catch (err) {
      this.#increaseProviderBackoff();
      throw err;
    }

    if (data?.error === 'PROVIDER_UNAVAILABLE') {
      this.#increaseProviderBackoff();
      return null;
    }

    this.#providerBackoffMs = 0;
    this.#providerBackoffUntil = 0;
    return Array.isArray(data?.pois) ? data.pois : [];
  }

  /**
   * Merges a POI array into the internal dedup map.
  * Keyed by provider id; repeated results refresh their position in the bounded map.
   * @param {import('./poiTypes.js').NormalizedPoi[]} pois
   */
  #mergePois(pois) {
    for (const poi of pois) {
      if (!poi?.id || !/^(node|way|relation)\//.test(poi.id)) continue;
      if (!this.#poiMap.has(poi.id)) this.#poiMap.set(poi.id, poi);
    }
    while (this.#poiMap.size > PoiDiscoveryService.#MAX_POIS) {
      this.#poiMap.delete(this.#poiMap.keys().next().value);
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
      const req = indexedDB.open(PoiDiscoveryService.#IDB_DB_NAME, 3);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(PoiDiscoveryService.#IDB_STORE_NAME)) {
          db.createObjectStore(PoiDiscoveryService.#IDB_STORE_NAME);
        } else {
          e.target.transaction.objectStore(PoiDiscoveryService.#IDB_STORE_NAME).clear();
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

      if (
        !Array.isArray(pois)
      ) {
        const tx = db.transaction(PoiDiscoveryService.#IDB_STORE_NAME, 'readwrite');
        tx.objectStore(PoiDiscoveryService.#IDB_STORE_NAME).delete(PoiDiscoveryService.#IDB_KEY);
        return;
      }

      const cachedPois = pois
        .filter((poi) => /^(node|way|relation)\//.test(poi?.id ?? ''));
      this.#lastKnownPois = cachedPois;
      this.#mergePois(cachedPois);
      this.#publishPois();
    } catch {
      // Non-fatal — IndexedDB may be unavailable in some browser contexts
    }
  }
}
