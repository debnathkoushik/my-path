import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../utils/haversine';

/**
 * A custom hook to interface with the browser's Geolocation API.
 * Handles permission requesting, high-accuracy watchPosition tracking, and noise filtering.
 */
export function useGeolocation() {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [path, setPath] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const watchIdRef = useRef(null);

  // Request permission and center initial position
  const initLocation = () => {
    return new Promise((resolve, reject) => {
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
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setPath([]);
    setIsRecording(true);
    setError(null);

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = position.timestamp || Date.now();
        const newPoint = { lat: latitude, lng: longitude };

        setCurrentLocation({ lat: latitude, lng: longitude, accuracy });
        setPermissionGranted(true);

        // Apply noise filters
        if (accuracy > 50) {
          console.warn(`Filtered coordinate due to low accuracy: ${accuracy}m`);
          return; // Skip noisy points
        }

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
  };

  // Clean up watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    currentLocation,
    path,
    isRecording,
    error,
    permissionGranted,
    initLocation,
    startRecording,
    stopRecording,
    setPath
  };
}
