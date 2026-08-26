import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Calculate optimal polling interval based on tournament state
 * @param {Object} tournamentProgress - Tournament progress from API
 * @returns {number|null} Interval in ms, or null to disable polling
 */
export function getSmartPollingInterval(tournamentProgress) {
  if (!tournamentProgress) return 60000; // Default 1 minute

  const { completedGames, totalGames, inProgressGames } = tournamentProgress;

  // Tournament hasn't started yet - poll infrequently
  if (completedGames === 0 && inProgressGames === 0) {
    return 3600000; // 1 hour
  }

  // Tournament is complete - no need to poll
  if (completedGames === totalGames && totalGames > 0) {
    return null; // Disable polling
  }

  // Games currently in progress - poll every 5 minutes
  if (inProgressGames > 0) {
    return 300000; // 5 minutes
  }

  // Between games - poll infrequently
  return 3600000; // 1 hour
}

/**
 * Hook for polling data at regular intervals with smart features
 * - Automatically adjusts interval based on tournament state
 * - Pauses when browser tab is hidden
 * - Supports manual interval override
 *
 * @param {Function} fetchFn - Function to call for fetching data
 * @param {Object} options - Polling options
 * @param {number} options.interval - Base polling interval in milliseconds (default: 60000)
 * @param {boolean} options.enabled - Whether polling is enabled (default: true)
 * @param {Object} options.tournamentProgress - Tournament progress for smart polling
 * @param {boolean} options.smartPolling - Enable smart polling based on tournament state (default: true)
 * @param {boolean} options.pauseOnHidden - Pause polling when tab is hidden (default: true)
 */
export function usePolling(fetchFn, options = {}) {
  // Support legacy API: usePolling(fn, interval, enabled)
  const normalizedOptions = typeof options === 'number'
    ? { interval: options, enabled: arguments[2] ?? true }
    : options;

  const {
    interval: baseInterval = 60000,
    enabled = true,
    tournamentProgress = null,
    smartPolling = true,
    pauseOnHidden = true,
  } = normalizedOptions;

  const savedCallback = useRef(fetchFn);
  const intervalRef = useRef(null);
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [isPaused, setIsPaused] = useState(false);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = fetchFn;
  }, [fetchFn]);

  // Calculate effective interval
  const effectiveInterval = smartPolling && tournamentProgress
    ? getSmartPollingInterval(tournamentProgress)
    : baseInterval;

  // Handle visibility change
  useEffect(() => {
    if (!pauseOnHidden) return;

    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsVisible(visible);

      if (visible && isPaused) {
        // Tab became visible again - fetch immediately and resume polling
        savedCallback.current?.();
        setIsPaused(false);
      } else if (!visible) {
        setIsPaused(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pauseOnHidden, isPaused]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (effectiveInterval === null) {
      // Polling disabled (e.g., tournament complete)
      return;
    }

    intervalRef.current = setInterval(() => {
      // Skip if tab is hidden and pauseOnHidden is enabled
      if (pauseOnHidden && document.hidden) {
        return;
      }
      savedCallback.current?.();
    }, effectiveInterval);
  }, [effectiveInterval, pauseOnHidden]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Restart polling when interval or enabled state changes
  useEffect(() => {
    if (enabled && isVisible && effectiveInterval !== null) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [enabled, isVisible, effectiveInterval, startPolling, stopPolling]);

  return {
    startPolling,
    stopPolling,
    isPolling: !!intervalRef.current,
    isPaused,
    effectiveInterval,
  };
}

export default usePolling;
