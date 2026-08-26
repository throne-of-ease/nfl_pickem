import {
  calculatePickScore,
  calculatePlayerScore,
  calculateLeaderboard as calculateFullLeaderboard,
  getResult,
} from './scoring.js';
import scoringConfig from '../../config/scoring.json';

/**
 * Client-side leaderboard calculation
 * Calculates player scores from games and picks data
 */

/**
 * Calculate leaderboard from games and picks data
 * @param {Array} games - Array of game objects from ESPN
 * @param {Array} picks - Array of pick objects from Supabase (getAllVisible)
 * @param {Array} profiles - Array of profile objects from Supabase
 * @param {Object} options - Optional calculation options
 * @param {boolean} options.includeLiveGames - Include in-progress games in scoring (default: false)
 * @returns {Array} Sorted leaderboard with player rankings
 */
export function calculateLeaderboard(games, picks, profiles, options = {}) {
  const { includeLiveGames = false } = options;

  // Transform raw picks into a format usable by calculatePlayerScore
  const transformedPlayers = profiles.map(profile => {
    const userPicks = picks.filter(p => p.user_id === profile.id).map(p => ({
      gameId: p.game_id,
      teamAScore: p.team_a_score,
      teamBScore: p.team_b_score,
      confidence: p.confidence,
      predictedResult: getResult(p.team_a_score, p.team_b_score),
    }));
    return {
      id: profile.id,
      name: profile.name,
      displayOrder: profile.display_order,
      picks: userPicks,
    };
  });

  // Filter games based on includeLiveGames
  const scoreableGames = games.filter(game => {
    const isFinal = game?.status?.state === 'final';
    const isInProgress = game?.status?.state === 'in_progress';
    return isFinal || (includeLiveGames && isInProgress);
  });

  // Use the main calculateLeaderboard function from scoring.js
  return calculateFullLeaderboard(transformedPlayers, scoreableGames, scoringConfig);
}

/**
 * Enrich games with pick information for display
 * @param {Array} games - Array of game objects from ESPN
 * @param {Array} picks - Array of pick objects from Supabase (getAllVisible)
 * @param {Array} profiles - Array of profile objects from Supabase
 * @param {Object} options - Optional enrichment options
 * @param {boolean} options.includeLiveGames - Include in-progress games in scoring (default: false)
 * @returns {Array} Games enriched with pick information
 */
export function enrichGamesWithPicks(games, picks, profiles = [], options = {}) {
  const { includeLiveGames = false } = options;
  // Build profile lookup by user ID
  const profileMap = new Map(profiles.map(p => [p.id, p]));

  // Create a lookup of picks by game ID and player for quick access
  const picksByGameAndPlayer = {};
  for (const pick of picks) {
    const gameId = pick.game_id;
    const userId = pick.user_id;
    if (!picksByGameAndPlayer[gameId]) {
      picksByGameAndPlayer[gameId] = {};
    }
    picksByGameAndPlayer[gameId][userId] = {
      teamAScore: pick.team_a_score ?? 0,
      teamBScore: pick.team_b_score ?? 0,
      confidence: pick.confidence ?? 0.5,
      predictedResult: getResult(pick.team_a_score, pick.team_b_score),
    };
  }

  const now = new Date();

  return games.map(game => {
    const gameId = game.espnEventId || game.id;
    const isFinal = game.status?.state === 'final';
    const isInProgress = game.status?.state === 'in_progress';
    const gameStarted = new Date(game.scheduledAt) <= now || isFinal || isInProgress;
    const gamePicks = picksByGameAndPlayer[gameId] || {};
    const actualResult = getResult(game.scores?.teamA, game.scores?.teamB);

    const enrichedPicks = [];
    // Iterate through all profiles to ensure all players are represented,
    // even if they didn't pick for this specific game
    profiles.forEach(profile => {
      const pickForPlayer = gamePicks[profile.id];
      if (pickForPlayer) {
        // If a pick exists, calculate its score using calculatePickScore
        const pickScoreResult = calculatePickScore(
          { ...pickForPlayer, gameId: gameId }, // Ensure pick has gameId
          { ...game, id: gameId }, // Ensure game has id
          scoringConfig // Pass the global scoring config
        );

        enrichedPicks.push({
          playerId: profile.id,
          playerName: profile.name,
          predictedScoreA: pickForPlayer.teamAScore,
          predictedScoreB: pickForPlayer.teamBScore,
          predictedResult: pickForPlayer.predictedResult,
          confidence: pickForPlayer.confidence,
          isCorrect: pickScoreResult.isCorrect,
          isProvisional: includeLiveGames && isInProgress && !isFinal,
          pointsEarned: pickScoreResult.totalPoints,
        });
      } else if (gameStarted) {
        // If game started but no pick, show submitted status
        enrichedPicks.push({
          playerId: profile.id,
          playerName: profile.name,
          submitted: false,
          isProvisional: includeLiveGames && isInProgress && !isFinal,
          pointsEarned: 0,
        });
      }
    });

    return {
      id: gameId,
      game_id: gameId,
      espn_event_id: gameId,
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
      picks: gameStarted ? enrichedPicks : [], // Only show picks if game has started
      picksVisible: gameStarted,
      hasAllPicks: Object.keys(gamePicks).length > 0,
    };
  });
}

export default {
  calculateLeaderboard,
  enrichGamesWithPicks,
};
