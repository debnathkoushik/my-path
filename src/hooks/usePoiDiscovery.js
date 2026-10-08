import { useState, useEffect, useRef } from 'react';
import { PoiDiscoveryService } from '../poi/PoiDiscoveryService.js';

/**
 * usePoiDiscovery
 *
 * Thin React wrapper around PoiDiscoveryService.
 * Translates position updates into a reactive `pois` state array.
 *
 * Rules:
 *  - Only active while `isRecording === true`
 *  - Resets POI state when recording stops
 *  - Never throws — errors are captured and exposed via `error`
 *
 * @param {{ currentLocation: { lat: number, lng: number } | null, isRecording: boolean }} params
 * @returns {{ pois: import('../poi/poiTypes.js').NormalizedPoi[], isLoading: boolean, error: string | null }}
 */
export function usePoiDiscovery({ currentLocation, isRecording }) {
  const [pois,      setPois]      = useState([]);
  const [error,     setError]     = useState(null);
  const isLoading = false;

  // Keep a stable service instance across renders
  const serviceRef = useRef(null);
  if (serviceRef.current == null) {
    serviceRef.current = new PoiDiscoveryService();
  }

  // Pre-populate from IndexedDB on first mount (offline resilience)
  useEffect(() => {
    const service = serviceRef.current;
    const unsubscribe = service.onPoisUpdated((updatedPois) => {
      setPois(updatedPois);
      setError(null);
    });
    service.loadFromIndexedDB().catch(() => {/* non-fatal */});
    return unsubscribe;
  }, []);

  // Drive the service on every position update, but only while recording
  useEffect(() => {
    if (!isRecording || !currentLocation) return;

    const service = serviceRef.current;

    try {
      // onPositionUpdate is synchronous — it returns the current in-memory POI
      // list immediately and schedules an async fetch cycle internally.
      const snapshot = service.onPositionUpdate(currentLocation.lat, currentLocation.lng);
      setPois(snapshot);
    } catch (err) {
      console.error('[usePoiDiscovery] unexpected error:', err);
      queueMicrotask(() => setError('Could not load nearby places.'));
    }
  }, [currentLocation, isRecording]);

  // Reset when recording stops
  useEffect(() => {
    if (!isRecording) {
      serviceRef.current.reset();
    }
  }, [isRecording]);

  return {
    pois: isRecording ? pois : [],
    isLoading,
    error: isRecording ? error : null,
  };
}
