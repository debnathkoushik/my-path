import { useState, useEffect, useRef } from 'react';

/**
 * A custom hook to track elapsed time in seconds.
 * Returns timer state, start, stop, and reset functions.
 */
export function useTimer() {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const startTimer = () => {
    if (isActive) return;
    setIsActive(true);
    startTimeRef.current = Date.now() - elapsedTime * 1000;
  };

  const stopTimer = () => {
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const resetTimer = () => {
    setIsActive(false);
    setElapsedTime(0);
    startTimeRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  return {
    elapsedTime,
    isActive,
    startTimer,
    stopTimer,
    resetTimer,
    setElapsedTime
  };
}
