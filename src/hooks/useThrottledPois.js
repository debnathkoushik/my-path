import { useState, useEffect, useRef, useMemo } from 'react';
import { POI_RENDER_THROTTLE_INTERVAL_MS } from '../poi/poiConstants.js';

/**
 * Compares two lists of POIs by length and ID to avoid unnecessary re-renders.
 * @param {Array<{id: string | number}>} a
 * @param {Array<{id: string | number}>} b
 * @returns {boolean}
 */
export function arePoisEqual(a = [], b = []) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const aIds = new Set(a.map((poi) => poi?.id));
  const bIds = new Set(b.map((poi) => poi?.id));
  return aIds.size === bIds.size && [...aIds].every((id) => bIds.has(id));
}

/**
 * Custom React hook that throttles POI updates for visual map pin rendering.
 *
 * Throttle Behavior:
 *  - Leading Edge: The initial batch of POIs is immediately passed to the renderer.
 *  - Cooldown Window: For 3 seconds (`intervalMs`), incoming POIs are buffered instead
 *    of triggering map re-renders.
 *  - Trailing Edge: When the cooldown expires, if new POIs were buffered, they are flushed
 *    to trigger a single synchronized re-render, and a new cooldown window begins.
 *  - Immediate Reset: When pois is empty or tracking stops, state resets immediately.
 *
 * @param {Array<import('../poi/poiTypes.js').NormalizedPoi>} pois - The raw POI stream
 * @param {number} [intervalMs=POI_RENDER_THROTTLE_INTERVAL_MS] - Render throttle interval in milliseconds
 * @returns {Array<import('../poi/poiTypes.js').NormalizedPoi>} The throttled POI list to display
 */
export function useThrottledPois(pois = [], intervalMs = POI_RENDER_THROTTLE_INTERVAL_MS) {
  const safePois = useMemo(() => (!pois || pois.length === 0 ? [] : pois), [pois]);
  const [renderedPois, setRenderedPois] = useState(safePois);
  const throttleTimerRef = useRef(null);
  const pendingPoisRef = useRef(null);
  const lastRenderedRef = useRef(safePois);

  useEffect(() => {
    lastRenderedRef.current = renderedPois;
  }, [renderedPois]);

  useEffect(() => {
    if (safePois.length === 0) {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      pendingPoisRef.current = null;
      queueMicrotask(() => {
        setRenderedPois([]);
      });
      return;
    }

    if (arePoisEqual(lastRenderedRef.current, safePois)) {
      return;
    }

    if (throttleTimerRef.current === null) {
      // ── Leading edge: Render immediately ──
      queueMicrotask(() => {
        setRenderedPois(safePois);
      });

      const startCooldown = () => {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;

          // ── Trailing edge: Flush latest buffered POIs ──
          if (pendingPoisRef.current) {
            const nextPois = pendingPoisRef.current;
            pendingPoisRef.current = null;

            if (!arePoisEqual(lastRenderedRef.current, nextPois)) {
              setRenderedPois(nextPois);
              startCooldown(); // Repeat cooldown for trailing update
            }
          }
        }, intervalMs);
      };

      startCooldown();
    } else {
      // ── Inside cooldown: buffer latest POIs ──
      pendingPoisRef.current = safePois;
    }
  }, [safePois, intervalMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  return safePois.length === 0 ? [] : renderedPois;
}
