/**
 * Pure-JS geohash encode and neighbor utilities.
 * No external dependency — implements the standard base-32 geohash algorithm.
 *
 * References:
 *   https://en.wikipedia.org/wiki/Geohash
 *   http://geohash.org/
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encodes a lat/lng pair into a geohash string.
 * @param {number} lat
 * @param {number} lng
 * @param {number} precision - Number of characters (default 6 ≈ 1.2km × 0.6km)
 * @returns {string}
 */
export function encodeGeohash(lat, lng, precision = 6) {
  let idx = 0;       // index into BASE32
  let bit = 0;       // current bit within the 5-bit group
  let evenBit = true;
  let geohash = '';

  let latMin = -90,  latMax = 90;
  let lngMin = -180, lngMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      // Bisect longitude range
      const lngMid = (lngMin + lngMax) / 2;
      if (lng >= lngMid) {
        idx = idx * 2 + 1;
        lngMin = lngMid;
      } else {
        idx = idx * 2;
        lngMax = lngMid;
      }
    } else {
      // Bisect latitude range
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        idx = idx * 2 + 1;
        latMin = latMid;
      } else {
        idx = idx * 2;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Decodes a geohash string into a bounding box.
 * @param {string} geohash
 * @returns {{ latMin: number, latMax: number, lngMin: number, lngMax: number, lat: number, lng: number }}
 */
export function decodeGeohash(geohash) {
  let evenBit = true;
  let latMin = -90,  latMax = 90;
  let lngMin = -180, lngMax = 180;

  for (const char of geohash) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) throw new Error(`Invalid geohash character: ${char}`);

    for (let bits = 4; bits >= 0; bits--) {
      const bitN = (idx >> bits) & 1;
      if (evenBit) {
        const lngMid = (lngMin + lngMax) / 2;
        if (bitN === 1) lngMin = lngMid; else lngMax = lngMid;
      } else {
        const latMid = (latMin + latMax) / 2;
        if (bitN === 1) latMin = latMid; else latMax = latMid;
      }
      evenBit = !evenBit;
    }
  }

  return {
    latMin,
    latMax,
    lngMin,
    lngMax,
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2
  };
}

/**
 * Returns the 8 neighboring geohash cells of a given geohash.
 * The returned array contains exactly 8 hashes (N, NE, E, SE, S, SW, W, NW),
 * covering all adjacent cells so boundary POIs are never missed.
 * @param {string} geohash
 * @returns {string[]}
 */
export function getGeohashNeighbors(geohash) {
  const { lat, lng, latMin, latMax, lngMin, lngMax } = decodeGeohash(geohash);
  const precision = geohash.length;

  // Step size: width/height of the cell
  const latStep = latMax - latMin;
  const lngStep = lngMax - lngMin;

  const offsets = [
    [  latStep,  0        ], // N
    [  latStep,  lngStep  ], // NE
    [  0,        lngStep  ], // E
    [ -latStep,  lngStep  ], // SE
    [ -latStep,  0        ], // S
    [ -latStep, -lngStep  ], // SW
    [  0,       -lngStep  ], // W
    [  latStep, -lngStep  ], // NW
  ];

  return offsets.map(([dLat, dLng]) => {
    // Clamp to valid ranges
    const nLat = Math.max(-90,  Math.min(90,  lat + dLat));
    const nLng = Math.max(-180, Math.min(180, lng + dLng));
    return encodeGeohash(nLat, nLng, precision);
  });
}
