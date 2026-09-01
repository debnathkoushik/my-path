/**
 * POI Discovery — shared type definitions (JSDoc).
 *
 * These are not runtime objects; they exist purely for IDE type-checking
 * and self-documenting code.
 */

/**
 * @typedef {Object} NormalizedPoi
 * @property {string}  id        - Unique identifier: "<type>/<osmId>" e.g. "node/12345"
 * @property {string}  osmId     - Raw OSM element id
 * @property {string}  osmType   - "node" | "way" | "relation"
 * @property {number}  lat       - Centroid latitude
 * @property {number}  lng       - Centroid longitude
 * @property {string}  name      - Display name (fallback to category if missing)
 * @property {string}  category  - Derived category: "tourism" | "historic" | "park" | "cafe" | "restaurant" | "default"
 * @property {Object}  tags      - Raw OSM tags object
 */

/**
 * @typedef {Object} CachedPoiEntry
 * @property {NormalizedPoi[]} pois        - The cached POI array for this geohash cell
 * @property {number}          fetchedAt   - Unix epoch ms when this entry was last fetched
 * @property {number}          ttlSeconds  - Time-to-live in seconds (stored per row, not global)
 */

/**
 * Checks whether a cached entry is still fresh (within its TTL).
 * @param {CachedPoiEntry} entry
 * @returns {boolean}
 */
export function isCacheEntryFresh(entry) {
  if (!entry) return false;
  const ageMs = Date.now() - entry.fetchedAt;
  return ageMs < entry.ttlSeconds * 1000;
}

/**
 * Derives a display category string from raw OSM tags.
 * @param {Object} tags - Raw OSM tags from Overpass
 * @returns {string}
 */
export function derivePOICategory(tags) {
  if (tags.amenity === 'cafe')        return 'cafe';
  if (tags.amenity === 'restaurant')  return 'restaurant';
  if (tags.leisure === 'park')        return 'park';
  if (tags.historic)                  return 'historic';
  if (tags.tourism)                   return 'tourism';
  return 'default';
}
