/**
 * POI Discovery — configurable constants.
 *
 * All magic numbers for the nearby-places feature live here.
 * Change values here rather than hunting across the codebase.
 */

/** Radius (metres) of the circular POI search area around the user's position. */
export const POI_SEARCH_RADIUS_METERS = 500;

/**
 * A new POI fetch cycle is triggered only when the user has moved at least
 * this fraction of the search radius from the last fetch location.
 * Default 0.65 ensures successive search circles overlap by ~35%, avoiding gaps.
 */
export const POI_FETCH_THRESHOLD_RATIO = 0.65;

/**
 * Minimum milliseconds between POI fetch cycles (throttle window).
 * Uses leading + trailing edge throttle: the first qualifying trigger fires
 * immediately, then a cooldown blocks further calls for this interval.
 * When the cooldown expires, if any trigger was suppressed, one final
 * trailing-edge fetch fires with the most recent suppressed position.
 */
export const POI_THROTTLE_INTERVAL_MS = 9_000; // 9 seconds

/** Marker updates are throttled separately so fresh data is shown promptly. */
export const POI_RENDER_THROTTLE_INTERVAL_MS = 3_000;

/**
 * Geohash precision used for spatial cache buckets.
 * Precision 6 is approximately 1.2 km × 0.6 km cells.
 */
export const POI_GEOHASH_PRECISION = 6;

/** Default two-day time-to-live stored per POI cache row. */
export const POI_CACHE_TTL_SECONDS = 172_800;

/** Curated OSM tag filters mirrored by the Overpass Edge Function. */
export const POI_OSM_TAGS = [
  'tourism',
  'historic',
  'leisure=park',
  'amenity=cafe',
  'amenity=restaurant',
];

/**
 * Category → display colour mapping for POI markers on the map.
 * Colours are chosen to stand out on the dark-filtered OpenStreetMap tiles.
 */
export const POI_CATEGORY_COLORS = {
  tourism:    '#f59e0b', // amber
  historic:   '#a78bfa', // purple
  park:       '#34d399', // emerald
  cafe:       '#fb923c', // orange
  restaurant: '#f87171', // red
  default:    '#60a5fa', // blue
};
