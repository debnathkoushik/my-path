/**
 * Calculates the geodesic distance between two points on the earth's surface
 * using the Haversine formula.
 * @param {number} lat1 - Latitude of first point in degrees
 * @param {number} lon1 - Longitude of first point in degrees
 * @param {number} lat2 - Latitude of second point in degrees
 * @param {number} lon2 - Longitude of second point in degrees
 * @returns {number} Distance in meters
 */
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

/**
 * Calculates the total cumulative distance of a path.
 * @param {Array<{lat: number, lng: number}>} path - Array of coordinates
 * @returns {number} Total distance in meters
 */
export function getPathDistance(path) {
  if (!path || path.length < 2) return 0;
  let totalDistance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    totalDistance += getDistance(
      path[i].lat,
      path[i].lng,
      path[i + 1].lat,
      path[i + 1].lng
    );
  }
  return totalDistance;
}
