import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getActiveTournamentKey } from '../config/tournamentConfig';
import { calculateLeaderboard, calculatePickScore } from '../services/scoring.js';
import scoringConfig from '../../config/scoring.json';

const AppContext = createContext(null);

const TOURNAMENT_KEY = getActiveTournamentKey();

// Cache configuration
const CACHE_KEY = `olympics-pickem-cache-${TOURNAMENT_KEY}`;
const CACHE_TTL = 60000; // 1 minute cache TTL
const SETTINGS_KEY = `olympics-pickem-settings-${TOURNAMENT_KEY}`;

/**
 * Get cached data from localStorage if still valid
 */
function getCachedData() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        console.log('Using cached tournament data');
        return data;
      }
    }
  } catch (error) {
    console.warn('Failed to read cache:', error);
  }
  return null;
}

/**
 * Save data to localStorage cache
 */
function setCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.warn('Failed to write cache:', error);
  }
}

/**
 * Clear the cache (useful for forced refresh)
 */
function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
}

/**
 * Get user settings from localStorage
 */
function getSettings() {
  try {
    const settings = localStorage.getItem(SETTINGS_KEY);
    return settings ? JSON.parse(settings) : {};
  } catch (error) {
    console.warn('Failed to read settings:', error);
    return {};
  }
}

/**
 * Save user settings to localStorage
 */
function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save settings:', error);
  }
}

/**
 * Compute leaderboard and per-game pick scores client-side.
 * When includeLiveGames=false, uses server's pre-calculated leaderboard.
 * When includeLiveGames=true, recalculates to include in-progress games.
 */
function computeClientData(serverLeaderboard, enrichedGames, rawGames, players, includeLiveGames) {
  if (!includeLiveGames) {
    return { computedLeaderboard: serverLeaderboard, computedGames: enrichedGames };
  }

  // Client-side leaderboard with live games included
  const computedLeaderboard = calculateLeaderboard(players, rawGames, scoringConfig);

  // Also score picks for in-progress games in the enriched games list
  const rawGameMap = new Map(rawGames.map(g => [g.espnEventId, g]));
  const computedGames = enrichedGames.map(game => {
    if (game.status !== 'in_progress' || !game.picks || !game.picksVisible) {
      return game;
    }

    const rawGame = rawGameMap.get(game.id || game.espn_event_id);
    if (!rawGame) return game;

    const updatedPicks = game.picks.map(pick => {
      // Skip picks that already have scoring (shouldn't happen for in-progress, but guard)
      if (pick.pointsEarned && pick.pointsEarned !== 0) return pick;

      const pickScoreResult = calculatePickScore(
        {
          gameId: rawGame.espnEventId,
          teamAScore: pick.predictedScoreA,
          teamBScore: pick.predictedScoreB,
          predictedResult: pick.predictedResult,
          confidence: pick.confidence,
        },
        { ...rawGame, id: rawGame.espnEventId },
        scoringConfig
      );

      return {
        ...pick,
        isCorrect: pickScoreResult.isCorrect,
        pointsEarned: pickScoreResult.totalPoints,
        isProvisional: true,
      };
    });

    return { ...game, picks: updatedPicks };
  });

  return { computedLeaderboard, computedGames };
}

export function AppProvider({ children }) {
  const [games, setGames] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [players, setPlayers] = useState([]);
  const [tournamentProgress, setTournamentProgress] = useState(null);
  const [loading, setLoading] = useState({ games: false, leaderboard: false });
  const [error, setError] = useState({ games: null, leaderboard: null });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [includeLiveGames, setIncludeLiveGames] = useState(() => {
    const settings = getSettings();
    return settings.includeLiveGames ?? true;
  });

  /**
   * Fetch all tournament data client-side
   * - ESPN games directly (no function invocation)
   * - Supabase picks via RLS (visible picks only)
   * - Calculate leaderboard locally
   */
  const fetchTournamentData = useCallback(async (skipCache = false) => {
    // Check cache first (unless forced refresh)
    if (!skipCache) {
      const cached = getCachedData();
      if (cached) {
        // Restore refs from cache
        rawGamesRef.current = cached.rawGames || [];
        playersRef.current = cached.players || [];
        serverLeaderboardRef.current = cached.leaderboard || [];
        enrichedGamesRef.current = cached.games || [];

        const { computedLeaderboard, computedGames } = computeClientData(
          cached.leaderboard || [],
          cached.games || [],
          cached.rawGames || [],
          cached.players || [],
          includeLiveGames
        );

        setGames(computedGames);
        setLeaderboard(computedLeaderboard);
        setTournamentProgress(cached.tournamentProgress);
        setPlayers(computedLeaderboard.map(p => ({
          id: p.playerId,
          name: p.playerName,
        })));
        setLastUpdated(new Date(cached.timestamp));
        return;
      }
    }

    setLoading({ games: true, leaderboard: true });
    setError({ games: null, leaderboard: null });

    try {
      const url = skipCache
        ? `/.netlify/functions/tournament-data?_t=${Date.now()}`
        : '/.netlify/functions/tournament-data';
      const response = await fetch(url, skipCache ? { cache: 'no-store' } : undefined);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();

      console.log('Fetched tournament data from API:', {
        games: data.games?.length,
        leaderboard: data.leaderboard?.length,
      });

      // Store raw data in refs for client-side recalculation
      rawGamesRef.current = data.rawGames || [];
      playersRef.current = data.players || [];
      serverLeaderboardRef.current = data.leaderboard || [];
      enrichedGamesRef.current = data.games || [];

      // Compute leaderboard and pick scores based on includeLiveGames
      const { computedLeaderboard, computedGames } = computeClientData(
        data.leaderboard || [],
        data.games || [],
        data.rawGames || [],
        data.players || [],
        includeLiveGames
      );

      // Update state
      setGames(computedGames);
      setLeaderboard(computedLeaderboard);
      setTournamentProgress(data.tournamentProgress);
      setPlayers((computedLeaderboard).map(p => ({
        id: p.playerId,
        name: p.playerName,
      })));
      setLastUpdated(new Date());

      // Cache the response (cache raw server data, recompute on load)
      setCachedData({
        games: data.games || [],
        leaderboard: data.leaderboard || [],
        rawGames: data.rawGames || [],
        players: data.players || [],
        tournamentProgress: data.tournamentProgress,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err.name === 'AbortError' ? 'Request timed out' : err.message;
      console.error('Error fetching tournament data:', message);
      setError({ games: message, leaderboard: message });

      // Try to use stale cache on error
      if (!skipCache) {
        const staleCache = getCachedData();
        if (staleCache) {
          console.log('Using stale cache due to fetch error');
          setGames(staleCache.games || []);
          setLeaderboard(staleCache.leaderboard || []);
          setTournamentProgress(staleCache.tournamentProgress);
        }
      }
    } finally {
      setLoading({ games: false, leaderboard: false });
    }
  }, [includeLiveGames]);

  /**
   * Legacy fetchGames for backwards compatibility
   * Now uses the combined client-side fetch internally
   */
  const fetchGames = useCallback(async () => {
    await fetchTournamentData();
  }, [fetchTournamentData]);

  /**
   * Legacy fetchLeaderboard for backwards compatibility
   * Now uses the combined client-side fetch internally
   */
  const fetchLeaderboard = useCallback(async () => {
    await fetchTournamentData();
  }, [fetchTournamentData]);

  /**
   * Refresh all data, optionally bypassing cache
   */
  const refreshAll = useCallback(async (skipCache = false) => {
    if (skipCache) {
      clearCache();
    }
    await fetchTournamentData(skipCache);
  }, [fetchTournamentData]);

  /**
   * Force refresh (bypasses cache)
   */
  const forceRefresh = useCallback(async () => {
    await refreshAll(true);
  }, [refreshAll]);

  /**
   * Toggle live games inclusion in scoring
   */
  const toggleIncludeLiveGames = useCallback((value) => {
    const newValue = value ?? !includeLiveGames;
    setIncludeLiveGames(newValue);
    saveSettings({ ...getSettings(), includeLiveGames: newValue });

    // Recalculate from cached refs immediately (no API call needed)
    if (rawGamesRef.current.length > 0) {
      const { computedLeaderboard, computedGames } = computeClientData(
        serverLeaderboardRef.current,
        enrichedGamesRef.current,
        rawGamesRef.current,
        playersRef.current,
        newValue
      );
      setLeaderboard(computedLeaderboard);
      setGames(computedGames);
      setPlayers(computedLeaderboard.map(p => ({
        id: p.playerId,
        name: p.playerName,
      })));
      // Clear cache so next fetch recalculates with new setting
      clearCache();
    }
  }, [includeLiveGames]);

  // Store raw server data for client-side recalculation (avoids refetch on toggle)
  const rawGamesRef = useRef([]);
  const playersRef = useRef([]);
  const serverLeaderboardRef = useRef([]);
  const enrichedGamesRef = useRef([]);

  // Initial fetch on mount only
  const hasFetched = useRef(false);
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchTournamentData(false);
    }
  }, [fetchTournamentData]);

  const value = {
    games,
    leaderboard,
    players,
    tournamentProgress,
    loading,
    error,
    lastUpdated,
    includeLiveGames,
    fetchGames,
    fetchLeaderboard,
    refreshAll,
    forceRefresh,
    clearCache,
    toggleIncludeLiveGames,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export default AppContext;
