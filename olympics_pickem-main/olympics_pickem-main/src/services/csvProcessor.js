import Papa from 'papaparse';

/**
 * Parse a CSV string containing player picks
 * @param {string} csvData - Raw CSV content
 * @returns {Object} Parsed picks and any errors
 */
export function parsePlayerPicksCSV(csvData) {
  const result = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
    transform: (value) => value.trim(),
  });

  const picks = [];
  const errors = [];

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i];
    const rowNum = i + 2; // Account for header row and 0-indexing

    const pick = parsePickRow(row, rowNum);

    if (pick.error) {
      errors.push(pick.error);
    } else {
      picks.push(pick.data);
    }
  }

  // Add any parsing errors from Papa Parse
  for (const error of result.errors) {
    errors.push({
      row: error.row + 2,
      message: error.message,
      type: 'parse_error',
    });
  }

  return { picks, errors };
}

/**
 * Parse a single row from the CSV
 */
function parsePickRow(row, rowNum) {
  // Check required fields
  const gameId = row.game_id || row.gameid || row.event_id || row.eventid;
  const teamA = row.team_a || row.teama || row.away_team || row.awayteam;
  const teamAScore = row.team_a_score || row.teama_score || row.away_score || row.awayscore;
  const teamB = row.team_b || row.teamb || row.home_team || row.hometeam;
  const teamBScore = row.team_b_score || row.teamb_score || row.home_score || row.homescore;
  const rawConfidence = row.confidence || row.probability || row.prob || '0.5';

  if (!gameId) {
    return { error: { row: rowNum, message: 'Missing game_id', type: 'missing_field' } };
  }

  if (!teamA || !teamB) {
    return { error: { row: rowNum, message: 'Missing team name(s)', type: 'missing_field' } };
  }

  const scoreA = parseInt(teamAScore, 10);
  const scoreB = parseInt(teamBScore, 10);

  if (isNaN(scoreA) || isNaN(scoreB)) {
    return { error: { row: rowNum, message: 'Invalid score value(s)', type: 'invalid_score' } };
  }

  if (scoreA < 0 || scoreB < 0) {
    return { error: { row: rowNum, message: 'Scores cannot be negative', type: 'invalid_score' } };
  }

  // Parse confidence: handle both 0-1 and 50-100 ranges
  let confidence = parseFloat(rawConfidence);
  if (isNaN(confidence)) {
    confidence = 0.5;
  } else if (confidence >= 50 && confidence <= 100) {
    // Interpret values like 75 as 75% -> 0.75
    confidence = confidence / 100;
  } else if (confidence > 1 && confidence < 50) {
    // Values like 1.5 or 30 are ambiguous edge cases
    // Treat as out-of-range and will be clamped below
  }

  // Ensure it's in the 0.5 to 1.0 range (minimum 50% confidence)
  confidence = Math.max(0.5, Math.min(1.0, confidence));

  return {
    data: {
      gameId: gameId.toString(),
      teamA: teamA,
      teamAScore: scoreA,
      teamB: teamB,
      teamBScore: scoreB,
      confidence: confidence,
      predictedResult: getResult(scoreA, scoreB),
    },
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
 * Validate picks against game schedule and teams
 * @param {Array} picks - Parsed picks
 * @param {Array} games - Game schedule from ESPN
 * @param {Array} teams - Team list from ESPN
 * @returns {Object} Validation results
 */
export function validatePicks(picks, games, teams) {
  const validPicks = [];
  const warnings = [];
  const errors = [];

  const gameMap = new Map(games.map(g => [g.espnEventId, g]));
  const teamNames = new Set(teams.map(t => t.name.toLowerCase()));
  const teamAbbrevs = new Set(teams.map(t => t.abbreviation?.toLowerCase()).filter(Boolean));

  for (const pick of picks) {
    const game = gameMap.get(pick.gameId);

    // Check if game exists
    if (!game) {
      errors.push({
        gameId: pick.gameId,
        message: `Game ID ${pick.gameId} not found in schedule`,
        type: 'unknown_game',
      });
      continue;
    }

    // Validate team names
    const teamAValid = isValidTeam(pick.teamA, teamNames, teamAbbrevs);
    const teamBValid = isValidTeam(pick.teamB, teamNames, teamAbbrevs);

    if (!teamAValid) {
      warnings.push({
        gameId: pick.gameId,
        message: `Team "${pick.teamA}" may not match ESPN data`,
        type: 'team_mismatch',
      });
    }

    if (!teamBValid) {
      warnings.push({
        gameId: pick.gameId,
        message: `Team "${pick.teamB}" may not match ESPN data`,
        type: 'team_mismatch',
      });
    }

    // Check for duplicate picks
    const duplicate = validPicks.find(p => p.gameId === pick.gameId);
    if (duplicate) {
      warnings.push({
        gameId: pick.gameId,
        message: `Duplicate pick for game ${pick.gameId}, using latest`,
        type: 'duplicate_pick',
      });
      // Replace with newer pick
      const idx = validPicks.indexOf(duplicate);
      validPicks[idx] = pick;
    } else {
      validPicks.push(pick);
    }
  }

  // Check for missing games
  for (const game of games) {
    const hasPick = validPicks.some(p => p.gameId === game.espnEventId);
    if (!hasPick) {
      warnings.push({
        gameId: game.espnEventId,
        message: `No pick submitted for ${game.name}`,
        type: 'missing_pick',
      });
    }
  }

  return {
    validPicks,
    warnings,
    errors,
    summary: {
      total: picks.length,
      valid: validPicks.length,
      warnings: warnings.length,
      errors: errors.length,
      coverage: games.length > 0 ? (validPicks.length / games.length * 100).toFixed(1) : 0,
    },
  };
}

/**
 * Check if a team name/abbrev is valid
 */
function isValidTeam(teamName, validNames, validAbbrevs) {
  const lower = teamName.toLowerCase();
  return validNames.has(lower) || validAbbrevs.has(lower);
}

/**
 * Transform validated picks for database storage
 * @param {Array} picks - Validated picks
 * @param {string} playerId - Player ID
 * @param {Array} games - Game schedule for additional metadata
 * @returns {Array} Database-ready pick objects
 */
export function transformPicksToDatabase(picks, playerId, games) {
  const gameMap = new Map(games.map(g => [g.espnEventId, g]));

  return picks.map(pick => {
    const game = gameMap.get(pick.gameId);

    return {
      player_id: playerId,
      game_espn_id: pick.gameId,
      predicted_team_a_score: pick.teamAScore,
      predicted_team_b_score: pick.teamBScore,
      predicted_result: pick.predictedResult,
      confidence: pick.confidence || 0.5,
      submitted_team_a_name: pick.teamA,
      submitted_team_b_name: pick.teamB,
      game_round_type: game?.roundType || 'groupStage',
    };
  });
}

/**
 * Generate CSV template for player picks
 * @param {Array} games - Game schedule
 * @returns {string} CSV template content
 */
export function generatePicksTemplate(games) {
  const headers = ['game_id', 'team_a', 'team_a_score', 'team_b', 'team_b_score', 'confidence'];
  const rows = [headers.join(',')];

  for (const game of games) {
    const teamAName = game.teamA?.name || 'Team A';
    const teamBName = game.teamB?.name || 'Team B';
    rows.push(`${game.espnEventId},${teamAName},,${teamBName},,0.5`);
  }

  return rows.join('\n');
}

export default {
  parsePlayerPicksCSV,
  validatePicks,
  transformPicksToDatabase,
  generatePicksTemplate,
};
