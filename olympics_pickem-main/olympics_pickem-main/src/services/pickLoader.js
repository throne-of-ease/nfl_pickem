import Papa from 'papaparse';

/**
 * Load players manifest from static JSON file
 * @returns {Promise<Array>} Array of player objects
 */
export async function loadPlayers() {
  const response = await fetch('/data/picks/players.json');
  if (!response.ok) {
    throw new Error(`Failed to load players manifest: ${response.status}`);
  }
  const data = await response.json();
  return data.players || [];
}

/**
 * Load picks for a single player from their CSV file
 * @param {Object} player - Player object with id property
 * @returns {Promise<Array>} Array of pick objects
 */
export async function loadPlayerPicks(player) {
  const fileName = player.id.toLowerCase().replace(/[^a-z0-9]/g, '');
  const response = await fetch(`/data/picks/${fileName}.csv`);

  if (!response.ok) {
    console.warn(`No picks file found for player ${player.name}`);
    return [];
  }

  const csvText = await response.text();
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
    transform: (value) => value.trim(),
  });

  return result.data.map(row => parsePickRow(row, player.id));
}

/**
 * Parse a single pick row from CSV
 */
function parsePickRow(row, playerId) {
  const gameId = row.game_id || row.gameid || row.event_id;
  const teamAScore = parseInt(row.team_a_score || row.teama_score, 10);
  const teamBScore = parseInt(row.team_b_score || row.teamb_score, 10);

  return {
    playerId,
    gameId: gameId?.toString(),
    teamA: row.team_a || row.teama,
    teamAScore: isNaN(teamAScore) ? 0 : teamAScore,
    teamB: row.team_b || row.teamb,
    teamBScore: isNaN(teamBScore) ? 0 : teamBScore,
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
 * Load all players and their picks
 * @returns {Promise<Array>} Array of player objects with picks attached
 */
export async function loadAllPlayerPicks() {
  const players = await loadPlayers();

  const playersWithPicks = await Promise.all(
    players.map(async (player) => {
      const picks = await loadPlayerPicks(player);
      return { ...player, picks };
    })
  );

  return playersWithPicks;
}

export default {
  loadPlayers,
  loadPlayerPicks,
  loadAllPlayerPicks,
};
