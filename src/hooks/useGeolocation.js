import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../utils/haversine';

/**
 * A custom hook to interface with the browser's Geolocation API.
 * Handles permission requesting, high-accuracy watchPosition tracking, noise filtering, and simulator mode.
 */
export function useGeolocation() {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [path, setPath] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isMockEnabled, setIsMockEnabled] = useState(false);

  const watchIdRef = useRef(null);
  const mockIntervalRef = useRef(null);
  const mockPosRef = useRef(null);
  const lastSavedLocationRef = useRef(null);

  const toggleMockMode = () => {
    setIsMockEnabled((prev) => {
      const nextMode = !prev;
      // If we turn off mock mode, clear active recording/simulation and reset
      if (!nextMode) {
        if (mockIntervalRef.current !== null) {
          clearInterval(mockIntervalRef.current);
          mockIntervalRef.current = null;
        }
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        setIsRecording(false);
        setPath([]);
        setCurrentLocation(null);
        lastSavedLocationRef.current = null;
        mockPosRef.current = null;
      } else {
        const mockStart = { lat: 37.7749, lng: -122.4194, accuracy: 5 };
        setCurrentLocation(mockStart);
        lastSavedLocationRef.current = mockStart;
        mockPosRef.current = mockStart;
        setPermissionGranted(true);
        setError(null);
      }
      return nextMode;
    });
  };

  // Request permission and center initial position
  const initLocation = () => {
    return new Promise((resolve, reject) => {
      if (isMockEnabled) {
        const mockStart = { lat: 37.7749, lng: -122.4194, accuracy: 5 };
        setCurrentLocation(mockStart);
        lastSavedLocationRef.current = mockStart;
        mockPosRef.current = mockStart;
        setPermissionGranted(true);
        setError(null);
        resolve(mockStart);
        return;
      }

      if (!navigator.geolocation) {
        setError('Geolocation is not supported by your browser');
        reject('Not supported');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const loc = { lat: latitude, lng: longitude, accuracy };
          setCurrentLocation(loc);
          lastSavedLocationRef.current = loc;
          setPermissionGranted(true);
          setError(null);
          resolve(loc);
        },
        (err) => {
          setError(err.message);
          setPermissionGranted(false);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const startRecording = () => {
    setError(null);

    if (isMockEnabled) {
      // Seed starting point if not present
      const startPoint = mockPosRef.current || { lat: 37.7749, lng: -122.4194, accuracy: 5 };
      mockPosRef.current = startPoint;
      setCurrentLocation(startPoint);
      lastSavedLocationRef.current = startPoint;

      const startTimestamp = Date.now();
      const firstPoint = { lat: startPoint.lat, lng: startPoint.lng, timestamp: startTimestamp };
      setPath([firstPoint]);
      setIsRecording(true);

      mockIntervalRef.current = setInterval(() => {
        mockPosRef.current = {
          lat: mockPosRef.current.lat + 0.00008,
          lng: mockPosRef.current.lng + 0.00008,
          accuracy: 5
        };
        const currentMockPoint = mockPosRef.current;
        const timestamp = Date.now();

        setCurrentLocation(currentMockPoint);
        lastSavedLocationRef.current = currentMockPoint;
        setPath((prevPath) => [...prevPath, { lat: currentMockPoint.lat, lng: currentMockPoint.lng, timestamp }]);
      }, 2000);

      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    // Seed path with initial point if available
    setPath(currentLocation ? [{ lat: currentLocation.lat, lng: currentLocation.lng, timestamp: Date.now() }] : []);
    setIsRecording(true);

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = position.timestamp || Date.now();
        const newPoint = { lat: latitude, lng: longitude };

        // Apply noise filters
        if (accuracy > 50) {
          console.warn(`Filtered coordinate due to low accuracy: ${accuracy}m`);
          return; // Skip noisy points
        }

        // Avoid spamming state if coordinates haven't changed by at least 1 meter
        if (lastSavedLocationRef.current) {
          const distanceMoved = getDistance(
            lastSavedLocationRef.current.lat,
            lastSavedLocationRef.current.lng,
            latitude,
            longitude
          );
          if (distanceMoved < 1) {
            return; // Skip update to prevent re-renders when stationary
          }
        }

        const updatedLoc = { lat: latitude, lng: longitude, accuracy };
        setCurrentLocation(updatedLoc);
        lastSavedLocationRef.current = updatedLoc;
        setPermissionGranted(true);

        setPath((prevPath) => {
          if (prevPath.length > 0) {
            const lastPoint = prevPath[prevPath.length - 1];
            const distanceMoved = getDistance(
              lastPoint.lat,
              lastPoint.lng,
              latitude,
              longitude
            );

            // Ignore points if they haven't moved at least 3 meters (stationary noise filter)
            if (distanceMoved < 3) {
              return prevPath;
            }
          }

          return [...prevPath, { ...newPoint, timestamp }];
        });
      },
      (err) => {
        setError(err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (mockIntervalRef.current !== null) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
  };

  // Clean up watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (mockIntervalRef.current !== null) {
        clearInterval(mockIntervalRef.current);
      }
    };
  }, []);

  return {
    currentLocation,
    path,
    isRecording,
    error,
    permissionGranted,
    isMockEnabled,
    toggleMockMode,
    initLocation,
    startRecording,
    stopRecording,
    setPath
  };
}
