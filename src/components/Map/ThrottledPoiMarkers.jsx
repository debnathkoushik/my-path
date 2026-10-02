import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { POI_CATEGORY_COLORS, POI_THROTTLE_INTERVAL_MS } from '../../poi/poiConstants.js';
import { useThrottledPois } from '../../hooks/useThrottledPois.js';

/**
 * Returns a Leaflet divIcon for a single POI marker.
 * The category colour is applied via a CSS custom property so the
 * hover glow in CSS always matches the dot fill.
 * @param {{ name: string, category: string }} poi
 * @returns {L.DivIcon}
 */
function makePOIIcon(poi) {
  const color = POI_CATEGORY_COLORS[poi.category] ?? POI_CATEGORY_COLORS.default;
  return L.divIcon({
    html: `
      <div class="poi-marker" style="--poi-color: ${color}">
        <div class="poi-marker-dot"></div>
        <span class="poi-marker-label">${poi.name.replace(/</g, '&lt;')}</span>
      </div>
    `,
    className: 'custom-leaflet-poi-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Visual POI pin dots component that throttles marker updates using 9s leading + trailing edge logic.
 *
 * @param {{ pois: Array<import('../../poi/poiTypes.js').NormalizedPoi>, intervalMs?: number, interactive?: boolean }} props
 */
export function ThrottledPoiMarkers({
  pois = [],
  intervalMs = POI_THROTTLE_INTERVAL_MS,
  interactive = true,
}) {
  const throttledPois = useThrottledPois(pois, intervalMs);

  if (!interactive || !throttledPois.length) {
    return null;
  }

  return (
    <>
      {throttledPois.map((poi) => (
        <Marker
          key={poi.id}
          position={[poi.lat, poi.lng]}
          icon={makePOIIcon(poi)}
        />
      ))}
    </>
  );
}

export default ThrottledPoiMarkers;
