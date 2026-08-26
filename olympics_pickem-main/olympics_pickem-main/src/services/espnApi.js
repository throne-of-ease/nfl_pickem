import { getActiveTournamentKey, getTournamentConfig } from '../config/tournamentConfig';

/**
 * Load game overrides from JSON file for local testing
 * @returns {Promise<Object>} Game overrides config
 */
async function loadGameOverrides() {
  try {
    const response = await fetch('/data/game-overrides.json');
    if (!response.ok) {
      return { enabled: false, overrides: {} };
    }
    const data = await response.json();
    if (data.enabled) {
      console.log('Loaded game overrides:', Object.keys(data.overrides || {}).length, 'games');
    }
    return data;
  } catch (error) {
    console.warn('Failed to load game overrides:', error.message);
    return { enabled: false, overrides: {} };
  }
}

/**
 * Apply game overrides if enabled (for local testing)
 * @param {Array} games - Array of game objects
 * @param {Object} overridesConfig - Overrides configuration
 * @returns {Array} Games with overrides applied
 */
function applyGameOverrides(games, overridesConfig) {
  if (!overridesConfig.enabled || !overridesConfig.overrides) {
    return games;
  }

  console.log('Applying game overrides for testing');

  return games.map(game => {
    const override = overridesConfig.overrides[game.espnEventId];
    if (!override) return game;

    console.log(`Override applied to game ${game.espnEventId}: ${override.scoreA}-${override.scoreB} (${override.status})`);

    return {
      ...game,
      scores: {
        teamA: override.scoreA,
        teamB: override.scoreB,
      },
      status: { state: override.status || 'final' },
    };
  });
}

function parseScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const rawValue = typeof value === 'object'
    ? (value.value ?? value.displayValue ?? value.text)
    : value;
  const parsed = parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Fetch game schedule from ESPN scoreboard API
 * @param {string} dateRange - Date range in format 'YYYYMMDD-YYYYMMDD'
 * @returns {Promise<Array>} Array of game objects
 */
export async function fetchSchedule(dateRange) {
  const tournamentKey = getActiveTournamentKey();
  const { espnBaseUrl, dateRange: defaultRange } = getTournamentConfig(tournamentKey);
  const range = dateRange || defaultRange;
  const url = `${espnBaseUrl}/scoreboard?dates=${range}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    let games = parseScheduleResponse(data);

    // Apply any game overrides for local testing
    const overrides = await loadGameOverrides();
    games = applyGameOverrides(games, overrides);

    return games;
  } catch (error) {
    console.error('Failed to fetch schedule:', error);
    throw error;
  }
}

/**
 * Parse ESPN schedule response into normalized game objects
 */
function parseScheduleResponse(data) {
  const games = [];

  if (!data.events) return games;

  for (const event of data.events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const competitors = competition.competitors || [];
    const homeTeam = competitors.find(c => c.homeAway === 'home');
    const awayTeam = competitors.find(c => c.homeAway === 'away');

    games.push({
      espnEventId: event.id,
      name: event.name,
      shortName: event.shortName,
      scheduledAt: event.date,
      status: parseGameStatus(competition.status),
      roundType: parseRoundType(event.season?.type?.name, event.name, event.date),
      venue: competition.venue?.fullName,
      teamA: awayTeam ? parseTeam(awayTeam) : null,
      teamB: homeTeam ? parseTeam(homeTeam) : null,
      scores: {
        teamA: parseScore(awayTeam?.score),
        teamB: parseScore(homeTeam?.score),
      },
    });
  }

  return games;
}

/**
 * Parse team data from ESPN competitor object
 */
function parseTeam(competitor) {
  const team = competitor.team || {};
  return {
    espnId: team.id,
    name: team.displayName || team.name,
    abbreviation: team.abbreviation,
    logo: team.logo,
    color: team.color,
    alternateColor: team.alternateColor,
  };
}

/**
 * Parse game status into normalized format
 */
function parseGameStatus(status) {
  if (!status) return { state: 'unknown' };

  const typeIdRaw = status.type?.id;
  const typeId = typeIdRaw !== null && typeIdRaw !== undefined ? Number(typeIdRaw) : null;
  const typeName = status.type?.name?.toLowerCase();
  const typeState = status.type?.state?.toLowerCase();
  const statusState = status.state?.toLowerCase();
  const detail = status.type?.shortDetail
    || status.type?.detail
    || status.type?.description
    || status.shortDetail
    || status.detail;

  if (typeId === 1) {
    return { state: 'scheduled', detail };
  }
  if (typeId === 2) {
    return {
      state: 'in_progress',
      period: status.period,
      clock: status.displayClock || status.clock,
      detail,
    };
  }
  if (typeId === 3) {
    return { state: 'final', detail };
  }

  const normalizedState = typeState || statusState || typeName || '';
  if (normalizedState === 'pre' || normalizedState === 'scheduled') {
    return { state: 'scheduled', detail };
  }
  if (normalizedState === 'in' || normalizedState === 'live' || normalizedState === 'in_progress' || normalizedState === 'in progress') {
    return {
      state: 'in_progress',
      period: status.period,
      clock: status.displayClock || status.clock,
      detail,
    };
  }
  if (normalizedState === 'post' || normalizedState === 'final') {
    return { state: 'final', detail };
  }

  if (normalizedState.includes('scheduled') || normalizedState.includes('pre')) {
    return { state: 'scheduled', detail };
  }
  if (normalizedState.includes('in progress') || normalizedState.includes('in_progress') || normalizedState.includes('live')) {
    return {
      state: 'in_progress',
      period: status.period,
      clock: status.displayClock || status.clock,
      detail,
    };
  }
  if (normalizedState.includes('final') || normalizedState.includes('post')) {
    return { state: 'final', detail };
  }

  return { state: normalizedState || 'unknown', detail };
}

/**
 * Determine round type from season type, event name, or date
 * @param {string} seasonTypeName - Season type name from ESPN
 * @param {string} eventName - Event name from ESPN
 * @param {string} scheduledDate - ISO date string of the game
 * @returns {'groupStage' | 'knockoutRound' | 'medalRound'}
 */
function parseRoundType(seasonTypeName, eventName, scheduledDate) {
  const name = (seasonTypeName || eventName || '').toLowerCase();

  // Medal keywords (highest priority)
  if (name.includes('gold') || name.includes('bronze')) {
    return 'medalRound';
  }

  // Explicit knockout keywords
  if (name.includes('semifinal') || name.includes('quarterfinal') || name.includes('knockout')) {
    return 'knockoutRound';
  }

  // Explicit group stage keywords
  if (name.includes('group')) {
    return 'groupStage';
  }

  // Date-based fallback: games after Feb 15, 2026 are knockout rounds
  if (scheduledDate) {
    const gameDate = new Date(scheduledDate);
    const knockoutStart = new Date('2026-02-16T00:00:00Z');
    if (gameDate >= knockoutStart) {
      return 'knockoutRound';
    }
  }

  return 'groupStage';
}

/**
 * Fetch detailed game summary for a specific event
 * @param {string} eventId - ESPN event ID
 * @returns {Promise<Object>} Detailed game summary
 */
export async function fetchGameSummary(eventId) {
  const tournamentKey = getActiveTournamentKey();
  const { espnBaseUrl } = getTournamentConfig(tournamentKey);
  const url = `${espnBaseUrl}/summary?event=${eventId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    return parseGameSummary(data, eventId);
  } catch (error) {
    console.error(`Failed to fetch game summary for ${eventId}:`, error);
    throw error;
  }
}

/**
 * Parse game summary response
 */
function parseGameSummary(data, eventId) {
  const boxscore = data.boxscore || {};
  const teams = boxscore.teams || [];

  return {
    espnEventId: eventId,
    teams: teams.map(t => ({
      espnId: t.team?.id,
      name: t.team?.displayName,
      abbreviation: t.team?.abbreviation,
      statistics: t.statistics,
    })),
    scoring: data.scoringPlays || [],
    header: data.header,
  };
}

/**
 * Fetch all teams
 * @returns {Promise<Array>} Array of team objects
 */
export async function fetchTeams() {
  const tournamentKey = getActiveTournamentKey();
  const { espnBaseUrl } = getTournamentConfig(tournamentKey);
  const url = `${espnBaseUrl}/teams`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    return parseTeamsResponse(data);
  } catch (error) {
    console.error('Failed to fetch teams:', error);
    throw error;
  }
}

/**
 * Parse teams response
 */
function parseTeamsResponse(data) {
  const teams = [];

  const sportTeams = data.sports?.[0]?.leagues?.[0]?.teams || [];

  for (const item of sportTeams) {
    const team = item.team || item;
    teams.push({
      espnId: team.id,
      name: team.displayName || team.name,
      abbreviation: team.abbreviation,
      logo: team.logos?.[0]?.href || team.logo,
      color: team.color,
      alternateColor: team.alternateColor,
    });
  }

  return teams;
}

/**
 * Fetch tournament standings
 * @returns {Promise<Array>} Array of standing objects
 */
export async function fetchStandings() {
  const tournamentKey = getActiveTournamentKey();
  const { espnBaseUrl } = getTournamentConfig(tournamentKey);
  const url = `${espnBaseUrl}/standings`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    return parseStandingsResponse(data);
  } catch (error) {
    console.error('Failed to fetch standings:', error);
    throw error;
  }
}

/**
 * Parse standings response
 */
function parseStandingsResponse(data) {
  const standings = [];

  const groups = data.children || [];

  for (const group of groups) {
    const groupName = group.name || group.abbreviation;
    const groupStandings = group.standings?.entries || [];

    for (const entry of groupStandings) {
      const team = entry.team || {};
      const stats = {};

      for (const stat of entry.stats || []) {
        stats[stat.name] = stat.value;
      }

      standings.push({
        group: groupName,
        team: {
          espnId: team.id,
          name: team.displayName || team.name,
          abbreviation: team.abbreviation,
          logo: team.logos?.[0]?.href,
        },
        stats: {
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          ties: stats.ties || stats.otLosses || 0,
          points: stats.points || 0,
          gamesPlayed: stats.gamesPlayed || 0,
          goalsFor: stats.pointsFor || 0,
          goalsAgainst: stats.pointsAgainst || 0,
          goalDifferential: stats.differential || stats.pointDifferential || 0,
        },
      });
    }
  }

  return standings;
}

export default {
  fetchSchedule,
  fetchGameSummary,
  fetchTeams,
  fetchStandings,
};
