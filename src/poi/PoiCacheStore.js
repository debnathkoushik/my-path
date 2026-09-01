/**
 * PoiCacheStore — storage-agnostic interface (JSDoc contract).
 *
 * The POI-fetching orchestration and UI code must depend ONLY on this
 * interface.  Swapping the backend (e.g. Supabase → Redis) requires only
 * replacing the concrete adapter, not touching any other file.
 *
 * Concrete implementations:
 *   - SupabasePoiCacheStore  (src/poi/SupabasePoiCacheStore.js)
 *
 * @interface PoiCacheStore
 */

/**
 * @typedef {import('./poiTypes.js').NormalizedPoi}  NormalizedPoi
 * @typedef {import('./poiTypes.js').CachedPoiEntry} CachedPoiEntry
 */

/**
 * Returns a fresh (non-expired) cache entry for the given geohash, or null.
 * Callers that only want guaranteed-fresh data should use this method.
 *
 * @function
 * @name PoiCacheStore#get
 * @param {string} geohash
 * @returns {Promise<CachedPoiEntry | null>}
 */

/**
 * Returns a cache entry regardless of freshness (expired or not), or null if
 * no row exists at all.  Used by stale-while-revalidate callers that want to
 * serve data immediately even when it's expired.
 *
 * @function
 * @name PoiCacheStore#getStaleOrFresh
 * @param {string} geohash
 * @returns {Promise<CachedPoiEntry | null>}
 */

/**
 * Batch variant of getStaleOrFresh for reading multiple geohash cells in one
 * round-trip (current cell + 8 neighbors = up to 9 reads).
 *
 * @function
 * @name PoiCacheStore#getManyStaleOrFresh
 * @param {string[]} geohashes
 * @returns {Promise<Map<string, CachedPoiEntry>>}
 */

/**
 * Writes (upserts) a cache entry.
 * NOTE: In the Supabase adapter this is NOT called from client code.
 *       The Edge Function uses the service role key to call Supabase directly.
 *       This method is part of the interface for completeness (e.g. testing,
 *       or a future Redis adapter running server-side).
 *
 * @function
 * @name PoiCacheStore#set
 * @param {string}         geohash
 * @param {NormalizedPoi[]} pois
 * @param {number}         ttlSeconds
 * @returns {Promise<void>}
 */

// This file is intentionally not a class — it is a pure JSDoc interface.
// Concrete adapters implement the four methods listed above.
