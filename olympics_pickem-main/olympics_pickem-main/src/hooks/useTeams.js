import { useState, useEffect, useMemo } from 'react';

// Static teams data loaded directly from public folder
// This avoids an API call since team data rarely changes
const TEAMS_URL = '/data/teams.json';
const CACHE_KEY = 'olympics-teams-cache';

/**
 * Hook for accessing team data
 * Loads static team data directly from the frontend without API calls
 *
 * @returns {Object} Teams data and helper functions
 */
export function useTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTeams() {
      // Try cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          setTeams(data.teams || []);
          setLoading(false);
          return;
        }
      } catch (e) {
        // Cache miss or error, continue to fetch
      }

      try {
        const response = await fetch(TEAMS_URL);
        if (!response.ok) throw new Error('Failed to load teams');

        const data = await response.json();
        setTeams(data.teams || []);

        // Cache for future use
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (e) {
          // Ignore cache write errors
        }
      } catch (err) {
        console.error('Error loading teams:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadTeams();
  }, []);

  // Create lookup maps for quick access
  const teamsById = useMemo(() => {
    const map = new Map();
    teams.forEach(team => map.set(team.id, team));
    return map;
  }, [teams]);

  const teamsByAbbreviation = useMemo(() => {
    const map = new Map();
    teams.forEach(team => map.set(team.abbreviation, team));
    return map;
  }, [teams]);

  const teamsByName = useMemo(() => {
    const map = new Map();
    teams.forEach(team => {
      map.set(team.name.toLowerCase(), team);
      map.set(team.displayName.toLowerCase(), team);
    });
    return map;
  }, [teams]);

  /**
   * Get team by ID
   * @param {string} id - Team ID
   * @returns {Object|null} Team data or null
   */
  const getTeamById = (id) => teamsById.get(id) || null;

  /**
   * Get team by abbreviation (e.g., "USA", "CAN")
   * @param {string} abbr - Team abbreviation
   * @returns {Object|null} Team data or null
   */
  const getTeamByAbbreviation = (abbr) => teamsByAbbreviation.get(abbr?.toUpperCase()) || null;

  /**
   * Get team by name (case-insensitive)
   * @param {string} name - Team name
   * @returns {Object|null} Team data or null
   */
  const getTeamByName = (name) => teamsByName.get(name?.toLowerCase()) || null;

  /**
   * Get team logo URL
   * @param {string} identifier - Team ID, abbreviation, or name
   * @returns {string|null} Logo URL or null
   */
  const getTeamLogo = (identifier) => {
    const team = getTeamById(identifier)
      || getTeamByAbbreviation(identifier)
      || getTeamByName(identifier);
    return team?.logo || null;
  };

  /**
   * Get team color (primary)
   * @param {string} identifier - Team ID, abbreviation, or name
   * @returns {string|null} Color hex code or null
   */
  const getTeamColor = (identifier) => {
    const team = getTeamById(identifier)
      || getTeamByAbbreviation(identifier)
      || getTeamByName(identifier);
    return team?.color ? `#${team.color}` : null;
  };

  return {
    teams,
    loading,
    error,
    getTeamById,
    getTeamByAbbreviation,
    getTeamByName,
    getTeamLogo,
    getTeamColor,
  };
}

export default useTeams;
