/**
 * POI Discovery — configurable constants.
 *
 * All magic numbers for the nearby-places feature live here.
 * Change values here rather than hunting across the codebase.
 */

/** Radius (metres) of the circular POI search area around the user's position. */
export const POI_SEARCH_RADIUS_METERS = 500;

/**
 * A new Overpass fetch cycle is triggered only when the user has moved at least
 * this fraction of the search radius from the last fetch location.
 * Default 0.65 ensures successive search circles overlap by ~35%, avoiding gaps.
 */
export const POI_FETCH_THRESHOLD_RATIO = 0.65;

/**
 * Minimum milliseconds between fetch cycles, even if the distance threshold
 * is already crossed.  Absorbs GPS jitter.
 */
export const POI_DEBOUNCE_MS = 9_000; // 9 seconds

/**
 * Geohash precision used for spatial bucketing of cache entries.
 * Precision 6 ≈ 1.2 km × 0.6 km cells.
 */
export const POI_GEOHASH_PRECISION = 6;

/**
 * Default Time-to-Live (seconds) stored per cache row.
 * 172 800 s = 2 days.  Adjust after real usage data is available.
 */
export const POI_CACHE_TTL_SECONDS = 172_800;

/**
 * OSM tag filters for the Overpass query.
 * Entries are passed verbatim into Overpass QL `node[...]` filters.
 * Treat as a curated list — do not query the full OSM tag universe.
 */
export const POI_OSM_TAGS = [
  'tourism',
  'historic',
  'leisure=park',
  'amenity=cafe',
  'amenity=restaurant',
];

/**
 * Category → display colour mapping for POI markers on the map.
 * Colours are chosen to stand out on the dark CartoDB basemap.
 */
export const POI_CATEGORY_COLORS = {
  tourism:    '#f59e0b', // amber
  historic:   '#a78bfa', // purple
  park:       '#34d399', // emerald
  cafe:       '#fb923c', // orange
  restaurant: '#f87171', // red
  default:    '#60a5fa', // blue
};
