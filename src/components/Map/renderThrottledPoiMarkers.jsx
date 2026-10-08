import ThrottledPoiMarkers from './ThrottledPoiMarkers.jsx';
import { POI_RENDER_THROTTLE_INTERVAL_MS } from '../../poi/poiConstants.js';

/**
 * Function that renders visual POI markers using the render throttle.
 *
 * @param {Array<import('../../poi/poiTypes.js').NormalizedPoi>} pois - Discovered POIs to render
 * @param {{ intervalMs?: number, interactive?: boolean }} [options] - Render configuration
 * @returns {React.ReactElement} React element tree of throttled Marker pin dots
 */
export function renderThrottledPoiMarkers(pois = [], options = {}) {
  const { intervalMs = POI_RENDER_THROTTLE_INTERVAL_MS, interactive = true } = options;
  return (
    <ThrottledPoiMarkers
      pois={pois}
      intervalMs={intervalMs}
      interactive={interactive}
    />
  );
}

export default renderThrottledPoiMarkers;
