/**
 * Combined endpoint for games + leaderboard data
 * Reduces function invocations by 50% (1 call instead of 2)
 *
 * GET /api/tournament-data
 * Returns: { games, leaderboard, tournamentProgress, timestamp }
 */

import { jsonResponse, errorResponse, corsHeaders } from './utils/response.js';
import { loadAllPlayerPicksFromSupabase, loadScoringConfig, loadGameOverrides, loadPickOverrides } from './utils/pickLoader.js';
import { getTournamentConfig, getActiveTournamentKey } from './utils/tournamentConfig.js';
import { calculatePickScore } from '../../src/services/scoring.js';

// Load scoring config once at module level
const scoringConfig = loadScoringConfig();

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const now = new Date();

    const tournamentKey = getActiveTournamentKey();

    // Fetch games from ESPN API (single call, used for both games and leaderboard)
    let games = await fetchGamesFromESPN(tournamentKey);

    // Apply any game overrides for testing
    games = applyGameOverrides(games);

    // Load all player picks from Supabase (falls back to static files if unavailable)
    const playersWithPicks = await loadAllPlayerPicksFromSupabase(tournamentKey);

    // Apply any pick overrides for testing
    applyPickOverrides(playersWithPicks);

    console.log('DEBUG tournament-data: Players loaded:', playersWithPicks.length);
    console.log('DEBUG tournament-data: Total picks across players:', playersWithPicks.reduce((sum, p) => sum + (p.picks?.length || 0), 0));

    // Build game lookup by ESPN event ID
    const gameMap = new Map(games.map(g => [g.espnEventId, g]));

    // Create a lookup of picks by game ID for games enrichment
    const picksByGame = {};
    for (const player of playersWithPicks) {
      for (const pick of player.picks || []) {
        if (!picksByGame[pick.gameId]) {
          picksByGame[pick.gameId] = [];
        }
        picksByGame[pick.gameId].push({
          ...pick,
          playerName: player.name,
        });
      }
    }

    console.log('DEBUG tournament-data: picksByGame keys:', Object.keys(picksByGame));
    console.log('DEBUG tournament-data: Game IDs from ESPN (first 5):', games.slice(0, 5).map(g => g.espnEventId));

    // === GAMES DATA ===
    const enrichedGames = games.map(game => {
      const isFinal = game.status?.state === 'final';
      const isInProgress = game.status?.state === 'in_progress';
      // Picks are visible if game has started OR if game is already final/in-progress (e.g., via overrides)
      const gameStarted = new Date(game.scheduledAt) <= now || isFinal || isInProgress;
      const gamePicks = picksByGame[game.espnEventId] || [];
      const actualResult = getResult(game.scores?.teamA, game.scores?.teamB);

      return {
        id: game.espnEventId,
        game_id: game.espnEventId,
        espn_event_id: game.espnEventId,
        name: game.name,
        short_name: game.shortName,
        scheduled_at: game.scheduledAt,
        status: game.status?.state || 'scheduled',
        status_detail: game.status?.detail,
        status_period: game.status?.period,
        status_clock: game.status?.clock,
        round_type: game.roundType,
        venue: game.venue,
        score_a: game.scores?.teamA,
        score_b: game.scores?.teamB,
        result: actualResult,
        team_a: game.teamA,
        team_b: game.teamB,
        picks: gameStarted
          ? gamePicks.map(p => {
              const pickScoreResult = isFinal
                ? calculatePickScore(
                    { ...p, gameId: game.espnEventId },
                    { ...game, id: game.espnEventId },
                    scoringConfig
                  )
                : null;
              const isCorrect = Boolean(pickScoreResult?.isCorrect);
              const pointsEarned = pickScoreResult ? pickScoreResult.totalPoints : 0;
              return {
                playerId: p.playerId,
                playerName: p.playerName,
                predictedScoreA: p.teamAScore,
                predictedScoreB: p.teamBScore,
                predictedResult: p.predictedResult,
                confidence: p.confidence,
                isCorrect,
                pointsEarned,
              };
            })
          : gamePicks.map(p => ({
              playerId: p.playerId,
              playerName: p.playerName,
              submitted: true,
            })),
        picksVisible: gameStarted,
        hasAllPicks: gamePicks.length > 0,
      };
    });

    // === LEADERBOARD DATA ===
    const leaderboard = playersWithPicks.map(player => {
      let totalPoints = 0;
      let correctPicks = 0;
      let scoredGames = 0;

      const roundBreakdown = {
        groupStage: { correct: 0, total: 0, points: 0 },
        knockoutRound: { correct: 0, total: 0, points: 0 },
        medalRound: { correct: 0, total: 0, points: 0 },
      };

      for (const pick of player.picks || []) {
        const game = gameMap.get(pick.gameId);
        if (!game || game.status?.state !== 'final') continue;

        scoredGames++;
        const roundType = game.roundType || 'groupStage';
        const pickScoreResult = calculatePickScore(
          { ...pick, gameId: game.espnEventId },
          { ...game, id: game.espnEventId },
          scoringConfig
        );
        const isCorrect = pickScoreResult.isCorrect;

        if (roundBreakdown[roundType]) {
          roundBreakdown[roundType].total++;
        }

        totalPoints += pickScoreResult.totalPoints;
        if (isCorrect) {
          correctPicks++;

          if (roundBreakdown[roundType]) {
            roundBreakdown[roundType].correct++;
          }
        }

        if (roundBreakdown[roundType]) {
          roundBreakdown[roundType].points += pickScoreResult.totalPoints;
        }
      }

      return {
        playerId: player.id,
        playerName: player.name,
        displayOrder: player.displayOrder,
        totalPoints,
        correctPicks,
        totalPicks: player.picks?.length || 0,
        scoredGames,
        accuracy: scoredGames > 0 ? ((correctPicks / scoredGames) * 100).toFixed(1) : '0.0',
        roundBreakdown,
      };
    });

    // Sort leaderboard by points, then correct picks, then name
    leaderboard.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctPicks !== a.correctPicks) return b.correctPicks - a.correctPicks;
      return a.playerName.localeCompare(b.playerName);
    });

    // Add ranks
    let currentRank = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      if (i > 0 && leaderboard[i].totalPoints < leaderboard[i - 1].totalPoints) {
        currentRank = i + 1;
      }
      leaderboard[i].rank = currentRank;
    }

    // === TOURNAMENT PROGRESS ===
    const totalGames = games.length;
    const completedGames = games.filter(g => g.status?.state === 'final').length;
    const inProgressGames = games.filter(g => g.status?.state === 'in_progress').length;

    const tournamentProgress = {
      totalGames,
      completedGames,
      inProgressGames,
      percentComplete: totalGames > 0 ? ((completedGames / totalGames) * 100).toFixed(1) : '0.0',
    };

    const responseData = {
      games: enrichedGames,
      leaderboard,
      tournamentProgress,
      timestamp: now.toISOString(),
      // Raw data for client-side scoring (live game toggle)
      players: playersWithPicks,
      rawGames: games,
    };

    // Add cache headers for better performance
    const maxAge = inProgressGames > 0 ? 30 : 60;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${maxAge}`,
        ...corsHeaders(),
      },
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    console.error('Error fetching tournament data:', error);
    return errorResponse(error.message);
  }
}

// Calculate game result from scores
function getResult(scoreA, scoreB) {
  if (scoreA === null || scoreA === undefined || scoreB === null || scoreB === undefined) return null;
  if (scoreA > scoreB) return 'win_a';
  if (scoreB > scoreA) return 'win_b';
  return 'tie';
}

// Apply pick overrides if enabled (for testing)
function applyPickOverrides(playersWithPicks) {
  const config = loadPickOverrides();
  if (!config.enabled || !config.overrides || config.overrides.length === 0) {
    return;
  }

  console.log('Applying pick overrides for testing');

  for (const override of config.overrides) {
    const playerName = override.player?.toLowerCase();
    if (!playerName || !override.gameId) continue;

    const player = playersWithPicks.find(p => p.name?.toLowerCase() === playerName);
    if (!player) {
      console.warn(`Pick override: player "${override.player}" not found`);
      continue;
    }

    const teamAScore = override.teamAScore ?? 0;
    const teamBScore = override.teamBScore ?? 0;
    const predictedResult = getResult(teamAScore, teamBScore);
    const gameId = override.gameId.toString();

    const existingIdx = player.picks.findIndex(p => p.gameId === gameId);
    if (existingIdx !== -1) {
      const existing = player.picks[existingIdx];
      player.picks[existingIdx] = {
        ...existing,
        teamAScore,
        teamBScore,
        confidence: override.confidence ?? existing.confidence,
        predictedResult,
      };
      console.log(`Pick override: replaced ${player.name}'s pick for game ${gameId}`);
    } else {
      player.picks.push({
        playerId: player.id,
        gameId,
        teamAScore,
        teamBScore,
        confidence: override.confidence ?? 0.5,
        predictedResult,
      });
      console.log(`Pick override: added new pick for ${player.name} on game ${gameId}`);
    }
  }
}

// Apply game overrides if enabled (for testing)
function applyGameOverrides(games) {
  const overrides = loadGameOverrides();
  if (!overrides.enabled || !overrides.overrides) {
    return games;
  }

  console.log('Applying game overrides for testing');

  return games.map(game => {
    const override = overrides.overrides[game.espnEventId];
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

async function fetchGamesFromESPN(tournamentKey) {
  try {
    const { espnBaseUrl, dateRange } = getTournamentConfig(tournamentKey);
    const url = `${espnBaseUrl}/scoreboard?dates=${dateRange}`;

    // Add timeout to avoid long waits when ESPN has no data
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`ESPN API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return parseScheduleResponse(data);
  } catch (error) {
    console.warn('ESPN API failed:', error.message);
    return [];
  }
}

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

function parseScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const rawValue = typeof value === 'object'
    ? (value.value ?? value.displayValue ?? value.text)
    : value;
  const parsed = parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

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

function parseRoundType(seasonTypeName, eventName, scheduledDate) {
  const name = (seasonTypeName || eventName || '').toLowerCase();

  if (name.includes('gold') || name.includes('bronze')) {
    return 'medalRound';
  }
  if (name.includes('semifinal') || name.includes('quarterfinal') || name.includes('knockout')) {
    return 'knockoutRound';
  }
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
