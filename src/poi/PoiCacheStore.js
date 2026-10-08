/**
 * PoiCacheStore — storage-agnostic interface (JSDoc contract).
 *
 * @interface PoiCacheStore
 */

/**
 * @typedef {import('./poiTypes.js').NormalizedPoi} NormalizedPoi
 * @typedef {import('./poiTypes.js').CachedPoiEntry} CachedPoiEntry
 */

/**
 * @function
 * @name PoiCacheStore#get
 * @param {string} geohash
 * @returns {Promise<CachedPoiEntry | null>}
 */

/**
 * @function
 * @name PoiCacheStore#getStaleOrFresh
 * @param {string} geohash
 * @returns {Promise<CachedPoiEntry | null>}
 */

/**
 * @function
 * @name PoiCacheStore#getManyStaleOrFresh
 * @param {string[]} geohashes
 * @returns {Promise<Map<string, CachedPoiEntry>>}
 */

/**
 * @function
 * @name PoiCacheStore#set
 * @param {string} geohash
 * @param {NormalizedPoi[]} pois
 * @param {number} ttlSeconds
 * @returns {Promise<void>}
 */