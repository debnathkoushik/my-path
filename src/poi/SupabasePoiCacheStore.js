import { supabase } from '../services/supabaseClient.js';
import { isCacheEntryFresh } from './poiTypes.js';

/**
 * SupabasePoiCacheStore
 *
 * Concrete implementation of the PoiCacheStore interface backed by Supabase.
 *
 * ─── IMPORTANT ISOLATION RULE ───────────────────────────────────────────────
 * ALL Supabase client calls in the POI feature are contained within this file.
 * No other POI-feature file may import or call `supabase` directly.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Read policy:  open to anon clients (no auth required).
 * Write policy: service_role only — writes happen inside the Edge Function.
 *               This adapter intentionally has NO `set()` implementation that
 *               calls Supabase from the client; doing so would be rejected by RLS.
 */
export class SupabasePoiCacheStore {
  /** @type {string} */
  #tableName = 'poi_cache';

  /**
   * Returns a FRESH (non-expired) entry, or null.
   * @param {string} geohash
   * @returns {Promise<import('./poiTypes.js').CachedPoiEntry | null>}
   */
  async get(geohash) {
    const entry = await this.getStaleOrFresh(geohash);
    if (!entry) return null;
    return isCacheEntryFresh(entry) ? entry : null;
  }

  /**
   * Returns an entry regardless of staleness, or null if the row is absent.
   * @param {string} geohash
   * @returns {Promise<import('./poiTypes.js').CachedPoiEntry | null>}
   */
  async getStaleOrFresh(geohash) {
    const { data, error } = await supabase
      .from(this.#tableName)
      .select('pois, fetched_at, ttl_seconds')
      .eq('geohash', geohash)
      .maybeSingle();

    if (error) {
      console.warn('[SupabasePoiCacheStore] getStaleOrFresh error:', error.message);
      return null;
    }
    if (!data) return null;

    return this.#rowToEntry(data);
  }

  /**
   * Batch read — returns a Map<geohash, CachedPoiEntry> for all found rows.
   * Missing geohashes simply won't appear in the map.
   * @param {string[]} geohashes
   * @returns {Promise<Map<string, import('./poiTypes.js').CachedPoiEntry>>}
   */
  async getManyStaleOrFresh(geohashes) {
    if (!geohashes.length) return new Map();

    const { data, error } = await supabase
      .from(this.#tableName)
      .select('geohash, pois, fetched_at, ttl_seconds')
      .in('geohash', geohashes);

    if (error) {
      console.warn('[SupabasePoiCacheStore] getManyStaleOrFresh error:', error.message);
      return new Map();
    }

    const result = new Map();
    for (const row of data ?? []) {
      result.set(row.geohash, this.#rowToEntry(row));
    }
    return result;
  }

  /**
   * Not implemented on the client — writes must go through the Edge Function.
   * This stub exists to satisfy the interface contract and will throw clearly
   * if accidentally called from client code.
   */
  async set(_geohash, _pois, _ttlSeconds) {
    throw new Error(
      '[SupabasePoiCacheStore] set() must not be called from the client. ' +
      'POI cache writes are handled exclusively by the fetch-pois Edge Function.'
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Converts a raw Supabase row into a CachedPoiEntry.
   * @param {{ pois: any, fetched_at: string, ttl_seconds: number }} row
   * @returns {import('./poiTypes.js').CachedPoiEntry}
   */
  #rowToEntry(row) {
    return {
      pois:       row.pois ?? [],
      fetchedAt:  new Date(row.fetched_at).getTime(),
      ttlSeconds: row.ttl_seconds,
    };
  }
}
