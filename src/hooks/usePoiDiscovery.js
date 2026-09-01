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
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState(null);

  // Keep a stable service instance across renders
  const serviceRef = useRef(null);
  if (!serviceRef.current) {
    serviceRef.current = new PoiDiscoveryService();
  }

  // Pre-populate from IndexedDB on first mount (offline resilience)
  useEffect(() => {
    serviceRef.current.loadFromIndexedDB().catch(() => {/* non-fatal */});
  }, []);

  // Drive the service on every position update, but only while recording
  useEffect(() => {
    if (!isRecording || !currentLocation) return;

    const service = serviceRef.current;
    setIsLoading(true);
    setError(null);

    try {
      // onPositionUpdate is synchronous — it returns the current in-memory POI
      // list immediately and schedules an async fetch cycle internally.
      const snapshot = service.onPositionUpdate(currentLocation.lat, currentLocation.lng);
      setPois(snapshot);
    } catch (err) {
      console.error('[usePoiDiscovery] unexpected error:', err);
      setError('Could not load nearby places.');
    } finally {
      setIsLoading(false);
    }
  }, [currentLocation, isRecording]);

  // Reset when recording stops
  useEffect(() => {
    if (!isRecording) {
      serviceRef.current.reset();
      setPois([]);
      setError(null);
    }
  }, [isRecording]);

  return { pois, isLoading, error };
}
