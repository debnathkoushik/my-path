import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { POI_CATEGORY_COLORS, POI_RENDER_THROTTLE_INTERVAL_MS } from '../../poi/poiConstants.js';
import { useThrottledPois } from '../../hooks/useThrottledPois.js';

function makePOIIcon(poi) {
  const color = POI_CATEGORY_COLORS[poi.category] ?? POI_CATEGORY_COLORS.default;
  return L.divIcon({
    html: `<div class="poi-marker" style="--poi-color: ${color}"><div class="poi-marker-dot"></div><span class="poi-marker-label">${poi.name.replace(/</g, '&lt;')}</span></div>`,
    className: 'custom-leaflet-poi-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Visual POI markers with leading + trailing edge render throttling.
 *
 * @param {{ pois: Array<import('../../poi/poiTypes.js').NormalizedPoi>, intervalMs?: number, interactive?: boolean }} props
 */
export function ThrottledPoiMarkers({
  pois = [],
  intervalMs = POI_RENDER_THROTTLE_INTERVAL_MS,
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
