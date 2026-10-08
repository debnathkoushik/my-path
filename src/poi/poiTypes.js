/**
 * POI Discovery — shared type definitions (JSDoc).
 *
 * These are not runtime objects; they exist purely for IDE type-checking
 * and self-documenting code.
 */

/**
 * @typedef {Object} NormalizedPoi
 * @property {string}  id        - OSM composite ID, e.g. "node/12345"
 * @property {string}  osmId     - Raw OSM element ID
 * @property {string}  osmType   - "node" | "way" | "relation"
 * @property {number}  lat       - Centroid latitude
 * @property {number}  lng       - Centroid longitude
 * @property {string}  name      - Display name (fallback to category if missing)
 * @property {string}  category  - Derived category: "tourism" | "historic" | "park" | "cafe" | "restaurant" | "default"
 * @property {Object}  tags      - Raw OSM tags object
 */

/**
 * @typedef {Object} CachedPoiEntry
 * @property {NormalizedPoi[]} pois
 * @property {number} fetchedAt
 * @property {number} ttlSeconds
 */

/** @param {CachedPoiEntry} entry */
export function isCacheEntryFresh(entry) {
	if (!entry) return false;
	return Date.now() - entry.fetchedAt < entry.ttlSeconds * 1000;
}

/** @param {Object} tags */
export function derivePOICategory(tags) {
	if (tags.amenity === 'cafe') return 'cafe';
	if (tags.amenity === 'restaurant') return 'restaurant';
	if (tags.leisure === 'park') return 'park';
	if (tags.historic) return 'historic';
	if (tags.tourism) return 'tourism';
	return 'default';
}
