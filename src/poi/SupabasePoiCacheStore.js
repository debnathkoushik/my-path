import { supabase } from '../services/supabaseClient.js';
import { isCacheEntryFresh } from './poiTypes.js';

/** Read-only client adapter for the Edge Function-owned poi_cache table. */
export class SupabasePoiCacheStore {
  #tableName = 'poi_cache';

  /** @param {string} geohash */
  async get(geohash) {
    const entry = await this.getStaleOrFresh(geohash);
    return entry && isCacheEntryFresh(entry) ? entry : null;
  }

  /** @param {string} geohash */
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
    return data ? this.#rowToEntry(data) : null;
  }

  /** @param {string[]} geohashes */
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

    return new Map((data ?? []).map((row) => [row.geohash, this.#rowToEntry(row)]));
  }

  async set() {
    throw new Error('POI cache writes are handled exclusively by the fetch-pois Edge Function.');
  }

  #rowToEntry(row) {
    return {
      pois: row.pois ?? [],
      fetchedAt: new Date(row.fetched_at).getTime(),
      ttlSeconds: row.ttl_seconds,
    };
  }
}