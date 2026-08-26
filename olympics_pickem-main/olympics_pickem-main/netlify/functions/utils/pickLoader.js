import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { createServiceRoleClient, getAllProfiles, getAllPicks } from './supabase.js';
import { getActiveTournamentKey } from './tournamentConfig.js';

// Get the base data directory (public/data)
// Note: Don't use import.meta.url - it's undefined after esbuild bundling
function getBaseDataDir() {
  const possiblePaths = [
    // Netlify functions run from /var/task
    '/var/task/public/data',
    join(process.cwd(), 'public', 'data'),
    join(process.cwd(), 'dist', 'data'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      console.log('Found data directory at:', path);
      return path;
    }
  }

  console.warn('No data directory found, tried:', possiblePaths);
  return join(process.cwd(), 'public', 'data');
}

// Get the picks data directory
function getDataDir() {
  return join(getBaseDataDir(), 'picks');
}

/**
 * Load players manifest from static JSON file
 * @returns {Array} Array of player objects
 */
export function loadPlayers() {
  const dataDir = getDataDir();
  const manifestPath = join(dataDir, 'players.json');

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(content);
    return data.players || [];
  } catch (error) {
    console.error('Failed to load players manifest:', error.message);
    return [];
  }
}

/**
 * Load picks for a single player from their CSV file
 * @param {Object} player - Player object with id property
 * @returns {Array} Array of pick objects
 */
export function loadPlayerPicks(player) {
  const dataDir = getDataDir();
  const fileName = player.id.toLowerCase().replace(/[^a-z0-9]/g, '') + '.csv';
  const filePath = join(dataDir, fileName);

  try {
    if (!existsSync(filePath)) {
      console.warn(`No picks file found for player ${player.name} at ${filePath}`);
      return [];
    }

    const csvText = readFileSync(filePath, 'utf-8');
    const result = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      transform: (value) => value.trim(),
    });

    return result.data.map(row => parsePickRow(row, player.id));
  } catch (error) {
    console.error(`Failed to load picks for ${player.name}:`, error.message);
    return [];
  }
}

/**
 * Parse a single pick row from CSV
 */
function parsePickRow(row, playerId) {
  const gameId = row.game_id || row.gameid || row.event_id;
  const rawScoreA = parseInt(row.team_a_score || row.teama_score, 10);
  const rawScoreB = parseInt(row.team_b_score || row.teamb_score, 10);
  const teamAScore = isNaN(rawScoreA) ? 0 : rawScoreA;
  const teamBScore = isNaN(rawScoreB) ? 0 : rawScoreB;
  
  // Parse confidence
  let confidence = parseFloat(row.confidence || row.probability || row.prob || '0.5');
  if (isNaN(confidence)) {
    confidence = 0.5;
  } else if (confidence >= 50 && confidence <= 100) {
    confidence = confidence / 100;
  } else if (confidence > 1 && confidence < 50) {
    confidence = 1.0;
  }
  confidence = Math.max(0.5, Math.min(1.0, confidence));

  return {
    playerId,
    gameId: gameId?.toString(),
    teamA: row.team_a || row.teama,
    teamAScore,
    teamB: row.team_b || row.teamb,
    teamBScore,
    confidence,
    predictedResult: getResult(teamAScore, teamBScore),
  };
}

/**
 * Determine the result from scores
 */
function getResult(scoreA, scoreB) {
  if (scoreA > scoreB) return 'win_a';
  if (scoreB > scoreA) return 'win_b';
  return 'tie';
}

/**
 * Load all players and their picks from static files
 * @returns {Array} Array of player objects with picks attached
 */
export function loadAllPlayerPicks() {
  const players = loadPlayers();

  return players.map((player) => {
    const picks = loadPlayerPicks(player);
    return { ...player, picks };
  });
}

/**
 * Load all players and their picks from Supabase
 * Falls back to static files if Supabase is not available
 * @returns {Promise<Array>} Array of player objects with picks attached
 */
export async function loadAllPlayerPicksFromSupabase(tournamentKey = getActiveTournamentKey()) {
  try {
    // Use service role client to bypass RLS and read all picks for leaderboard
    const supabase = createServiceRoleClient();
    if (!supabase) {
      console.warn('Supabase not configured, falling back to static files');
      return loadAllPlayerPicks();
    }
    console.log('DEBUG: Service role client created successfully');

    // Fetch profiles and picks from Supabase
    const [profiles, picks] = await Promise.all([
      getAllProfiles(supabase),
      getAllPicks(supabase, tournamentKey),
    ]);

    console.log('DEBUG: Profiles fetched:', profiles?.length || 0, profiles?.map(p => p.name));
    console.log('DEBUG: Picks fetched:', picks?.length || 0);
    if (picks?.length > 0) {
      console.log('DEBUG: Sample picks:', picks.slice(0, 3).map(p => ({ game_id: p.game_id, user_id: p.user_id })));
    }

    if (!profiles || profiles.length === 0) {
      console.warn('No profiles found in Supabase, falling back to static files');
      return loadAllPlayerPicks();
    }

    // Group picks by user_id
    const picksByUser = {};
    for (const pick of picks || []) {
      const userId = pick.user_id;
      if (!picksByUser[userId]) {
        picksByUser[userId] = [];
      }

      // Transform pick to match expected format
      const teamAScore = pick.team_a_score ?? 0;
      const teamBScore = pick.team_b_score ?? 0;

      picksByUser[userId].push({
        playerId: userId,
        gameId: pick.game_id,
        teamAScore,
        teamBScore,
        confidence: pick.confidence ?? 0.5,
        predictedResult: getResult(teamAScore, teamBScore),
      });
    }

    // Transform profiles to match expected format
    const playersWithPicks = profiles.map((profile, index) => ({
      id: profile.id,
      name: profile.name || profile.email || 'Unknown Player',
      displayOrder: index + 1,
      picks: picksByUser[profile.id] || [],
    }));

    console.log(`Loaded ${playersWithPicks.length} players from Supabase with ${picks?.length || 0} total picks`);
    return playersWithPicks;
  } catch (error) {
    console.error('Error loading from Supabase:', error.message);
    console.warn('Falling back to static files');
    return loadAllPlayerPicks();
  }
}

/**
 * Load mock games data from JSON file
 * @returns {Object|null} Mock games data or null if not found
 */
export function loadMockGamesData() {
  const baseDir = getBaseDataDir();
  const mockPath = join(baseDir, 'mock-games.json');

  console.log('Looking for mock games at:', mockPath);

  try {
    if (existsSync(mockPath)) {
      const content = readFileSync(mockPath, 'utf-8');
      console.log('Loaded mock games from:', mockPath);
      return JSON.parse(content);
    }
    console.warn('Mock games file not found at:', mockPath);
    return null;
  } catch (error) {
    console.error('Failed to load mock games:', error.message);
    return null;
  }
}

/**
 * Load game overrides from JSON file for testing
 * @returns {Object} Game overrides config
 */
export function loadGameOverrides() {
  const baseDir = getBaseDataDir();
  const overridesPath = join(baseDir, 'game-overrides.json');

  try {
    if (existsSync(overridesPath)) {
      const content = readFileSync(overridesPath, 'utf-8');
      const data = JSON.parse(content);

      if (!data.enabled) {
        return { enabled: false, overrides: {} };
      }

      console.log('Loaded game overrides:', Object.keys(data.overrides || {}).length, 'games');
      return data;
    }
    return { enabled: false, overrides: {} };
  } catch (error) {
    console.warn('Failed to load game overrides:', error.message);
    return { enabled: false, overrides: {} };
  }
}

/**
 * Load pick overrides from JSON file for testing
 * @returns {Object} Pick overrides config with { enabled, overrides[] }
 */
export function loadPickOverrides() {
  const baseDir = getBaseDataDir();
  const overridesPath = join(baseDir, 'pick-overrides.json');

  try {
    if (existsSync(overridesPath)) {
      const content = readFileSync(overridesPath, 'utf-8');
      const data = JSON.parse(content);

      if (!data.enabled) {
        return { enabled: false, overrides: [] };
      }

      console.log('Loaded pick overrides:', (data.overrides || []).length, 'picks');
      return { enabled: true, overrides: data.overrides || [] };
    }
    return { enabled: false, overrides: [] };
  } catch (error) {
    console.warn('Failed to load pick overrides:', error.message);
    return { enabled: false, overrides: [] };
  }
}

/**
 * Load scoring config from JSON file
 * @returns {Object} Scoring config with defaults
 */
export function loadScoringConfig() {
  const possiblePaths = [
    '/var/task/config/scoring.json',
    join(process.cwd(), 'config', 'scoring.json'),
  ];

  for (const configPath of possiblePaths) {
    try {
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, 'utf-8');
        console.log('Loaded scoring config from:', configPath);
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn('Failed to load config from', configPath, error.message);
    }
  }

  console.warn('Using default scoring config');
  return {
    points: { groupStage: 1, knockoutRound: 2, medalRound: 3 },
    exactScoreBonus: { enabled: false, points: 1 }
  };
}

export default {
  loadPlayers,
  loadPlayerPicks,
  loadAllPlayerPicks,
  loadAllPlayerPicksFromSupabase,
  loadMockGamesData,
  loadScoringConfig,
  loadGameOverrides,
  loadPickOverrides,
};
