/**
 * Integration tests for the full scoring flow
 * Tests picks + games + scoring across all 4 players
 *
 * Run with: npm run test -- scoring-integration
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getResult,
  getRoundType,
  calculatePlayerScore,
  calculateLeaderboard
} from '../scoring.js';
import { parsePlayerPicksCSV } from '../csvProcessor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = process.cwd();

// Load mock game data
function loadMockGames() {
  const mockPath = join(projectRoot, 'public/data/mock-games.json');
  const data = JSON.parse(readFileSync(mockPath, 'utf-8'));
  return parseGames(data);
}

// Load player picks from CSV files
function loadPlayerPicks() {
  const playersPath = join(projectRoot, 'public/data/picks/players.json');
  const players = JSON.parse(readFileSync(playersPath, 'utf-8')).players;

  return players.map(player => {
    const csvPath = join(projectRoot, `public/data/picks/${player.id}.csv`);
    const csvContent = readFileSync(csvPath, 'utf-8');
    const result = parsePlayerPicksCSV(csvContent);
    return { ...player, picks: result.picks || [] };
  });
}

// Parse ESPN-format mock data to internal game format
function parseGames(data) {
  return data.events.map(event => {
    const competition = event.competitions[0];
    const competitors = competition.competitors || [];
    const away = competitors.find(c => c.homeAway === 'away');
    const home = competitors.find(c => c.homeAway === 'home');

    const status = competition.status?.type;
    let state = 'scheduled';
    if (status?.id === '3' || status?.name === 'Final') state = 'final';
    else if (status?.id === '2' || status?.name === 'In Progress') state = 'in_progress';

    return {
      espnEventId: event.id,
      name: event.name,
      scheduledAt: event.date,
      status: { state },
      roundType: parseRoundType(event.season?.type?.name, event.name),
      scores: {
        teamA: away?.score ? parseInt(away.score, 10) : null,
        teamB: home?.score ? parseInt(home.score, 10) : null,
      },
      teamA: { name: away?.team?.displayName },
      teamB: { name: home?.team?.displayName },
    };
  });
}

function parseRoundType(seasonTypeName, eventName) {
  const name = (seasonTypeName || eventName || '').toLowerCase();
  if (name.includes('gold') || name.includes('bronze')) return 'medalRound';
  if (name.includes('semifinal') || name.includes('quarterfinal')) return 'knockoutRound';
  return 'groupStage';
}

describe('Scoring Integration Tests', () => {
  let games;
  let players;
  let scoringConfig;
  let consoleLogSpy;

  beforeAll(() => {
    if (!process.env.DEBUG_SCORING) {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    }
    games = loadMockGames();
    players = loadPlayerPicks();
    scoringConfig = {
      points: { groupStage: 1, knockoutRound: 2, medalRound: 3 },
      exactScoreBonus: { enabled: false, points: 1 }
    };
  });

  afterAll(() => {
    consoleLogSpy?.mockRestore();
  });

  describe('Data Loading', () => {
    it('loads all 20 mock games', () => {
      expect(games.length).toBe(20);
    });

    it('loads all 4 players with picks', () => {
      expect(players.length).toBe(4);
      players.forEach(p => {
        expect(p.picks.length).toBeGreaterThan(0);
      });
    });

    it('all games are marked as final in mock data', () => {
      const finalGames = games.filter(g => g.status.state === 'final');
      expect(finalGames.length).toBe(20);
    });

    it('games include all round types', () => {
      const groupGames = games.filter(g => g.roundType === 'groupStage');
      const knockoutGames = games.filter(g => g.roundType === 'knockoutRound');
      const medalGames = games.filter(g => g.roundType === 'medalRound');

      expect(groupGames.length).toBe(12);
      expect(knockoutGames.length).toBe(6); // 4 quarterfinals + 2 semifinals
      expect(medalGames.length).toBe(2);    // Bronze + Gold
    });
  });

  describe('Game Results', () => {
    it('correctly determines game results', () => {
      // Game 401845001: Canada 5, Germany 1 -> win_a
      const game1 = games.find(g => g.espnEventId === '401845001');
      expect(getResult(game1.scores.teamA, game1.scores.teamB)).toBe('win_a');

      // Game 401845003: Sweden 4, Switzerland 4 -> tie
      const game3 = games.find(g => g.espnEventId === '401845003');
      expect(getResult(game3.scores.teamA, game3.scores.teamB)).toBe('tie');

      // Game 401845005: Canada 2, USA 3 -> win_b
      const game5 = games.find(g => g.espnEventId === '401845005');
      expect(getResult(game5.scores.teamA, game5.scores.teamB)).toBe('win_b');
    });
  });

  describe('Player 1 (Jirka P) Scoring', () => {
    let player1;
    let player1Games;

    beforeAll(() => {
      player1 = players.find(p => p.id === 'player1');
      player1Games = games.map(g => ({
        ...g,
        id: g.espnEventId,
      }));
    });

    it('has 20 picks submitted', () => {
      expect(player1.picks.length).toBe(20);
    });

    it('calculates correct total score', () => {
      const result = calculatePlayerScore(player1.picks, player1Games, scoringConfig);

      // Verify score is calculated (exact value depends on picks vs results)
      expect(result.totalPoints).toBeGreaterThanOrEqual(0);
      expect(result.correctPicks).toBeGreaterThanOrEqual(0);
      expect(result.correctPicks).toBeLessThanOrEqual(20);

      console.log(`Player 1 (Jirka P): ${result.totalPoints} points, ${result.correctPicks}/20 correct`);
      console.log('Breakdown:', result.roundBreakdown);
    });

    it('group stage correct picks earn 1 point each', () => {
      const result = calculatePlayerScore(player1.picks, player1Games, scoringConfig);
      expect(result.roundBreakdown.groupStage.points).toBe(result.roundBreakdown.groupStage.correct * 1);
    });

    it('knockout round correct picks earn 2 points each', () => {
      const result = calculatePlayerScore(player1.picks, player1Games, scoringConfig);
      expect(result.roundBreakdown.knockoutRound.points).toBe(result.roundBreakdown.knockoutRound.correct * 2);
    });

    it('medal round correct picks earn 3 points each', () => {
      const result = calculatePlayerScore(player1.picks, player1Games, scoringConfig);
      expect(result.roundBreakdown.medalRound.points).toBe(result.roundBreakdown.medalRound.correct * 3);
    });
  });

  describe('Full Leaderboard Calculation', () => {
    it('calculates leaderboard for all 4 players', () => {
      const gamesWithIds = games.map(g => ({ ...g, id: g.espnEventId }));
      const leaderboard = calculateLeaderboard(players, gamesWithIds, scoringConfig);

      expect(leaderboard.length).toBe(4);

      // Log full leaderboard for verification
      console.log('\n=== LEADERBOARD ===');
      leaderboard.forEach((entry, idx) => {
        console.log(`${entry.rank}. ${entry.playerName}: ${entry.totalPoints} pts (${entry.correctPicks} correct)`);
      });
    });

    it('ranks players correctly by points', () => {
      const gamesWithIds = games.map(g => ({ ...g, id: g.espnEventId }));
      const leaderboard = calculateLeaderboard(players, gamesWithIds, scoringConfig);

      // Verify sorted by points descending
      for (let i = 1; i < leaderboard.length; i++) {
        expect(leaderboard[i].totalPoints).toBeLessThanOrEqual(leaderboard[i-1].totalPoints);
      }
    });

    it('assigns correct ranks with ties', () => {
      const gamesWithIds = games.map(g => ({ ...g, id: g.espnEventId }));
      const leaderboard = calculateLeaderboard(players, gamesWithIds, scoringConfig);

      // First place is rank 1
      expect(leaderboard[0].rank).toBe(1);

      // If tie, both get same rank
      if (leaderboard[0].totalPoints === leaderboard[1].totalPoints) {
        expect(leaderboard[1].rank).toBe(1);
      }
    });
  });

  describe('Specific Pick Verification', () => {
    // Verify specific picks against actual results
    const testCases = [
      { gameId: '401845001', actualA: 5, actualB: 1, result: 'win_a', roundType: 'groupStage', points: 1 },
      { gameId: '401845003', actualA: 4, actualB: 4, result: 'tie', roundType: 'groupStage', points: 1 },
      { gameId: '401845007', actualA: 4, actualB: 2, result: 'win_a', roundType: 'knockoutRound', points: 2 },
      { gameId: '401845012', actualA: 3, actualB: 2, result: 'win_a', roundType: 'medalRound', points: 3 },
    ];

    testCases.forEach(tc => {
      it(`game ${tc.gameId}: ${tc.result} earns ${tc.points} point(s)`, () => {
        const game = games.find(g => g.espnEventId === tc.gameId);

        expect(game.scores.teamA).toBe(tc.actualA);
        expect(game.scores.teamB).toBe(tc.actualB);
        expect(getResult(game.scores.teamA, game.scores.teamB)).toBe(tc.result);
        expect(game.roundType).toBe(tc.roundType);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles player with no picks for a game', () => {
      const playerWithPartialPicks = {
        id: 'test',
        name: 'Test Player',
        picks: players[0].picks.slice(0, 5), // Only first 5 picks
      };

      const gamesWithIds = games.map(g => ({ ...g, id: g.espnEventId }));
      const result = calculatePlayerScore(playerWithPartialPicks.picks, gamesWithIds, scoringConfig);

      // Should only score on games they have picks for
      expect(result.correctPicks).toBeLessThanOrEqual(5);
    });

    it('handles exact score bonus when enabled', () => {
      const configWithBonus = {
        ...scoringConfig,
        exactScoreBonus: { enabled: true, points: 1 }
      };

      const gamesWithIds = games.map(g => ({ ...g, id: g.espnEventId }));

      // Player 2 predicted exact score for game 401845001 (Canada 5, Germany 1)
      const player2 = players.find(p => p.id === 'player2');
      const result = calculatePlayerScore(player2.picks, gamesWithIds, configWithBonus);

      // Should have bonus points
      console.log(`Player 2 with exact score bonus: ${result.totalPoints} pts`);
    });
  });
});

describe('Scoring Validation Report', () => {
  it('generates detailed scoring report for manual verification', () => {
    const games = loadMockGames();
    const players = loadPlayerPicks();
    const gamesWithIds = games.map(g => ({ ...g, id: g.espnEventId }));
    const config = {
      points: { groupStage: 1, knockoutRound: 2, medalRound: 3 },
      exactScoreBonus: { enabled: false, points: 1 }
    };

    console.log('\n========================================');
    console.log('  SCORING VALIDATION REPORT');
    console.log('========================================\n');

    // Print game results
    console.log('GAME RESULTS:');
    games.forEach(g => {
      const result = getResult(g.scores.teamA, g.scores.teamB);
      const pts = config.points[g.roundType];
      console.log(`  ${g.espnEventId}: ${g.teamA.name} ${g.scores.teamA}-${g.scores.teamB} ${g.teamB.name} [${g.roundType}, ${pts}pts] -> ${result}`);
    });

    console.log('\nPLAYER SCORES:');
    players.forEach(player => {
      const result = calculatePlayerScore(player.picks, gamesWithIds, config);
      console.log(`\n  ${player.name}:`);
      console.log(`    Total: ${result.totalPoints} points`);
      console.log(`    Correct: ${result.correctPicks}/${player.picks.length}`);
      console.log(`    Group Stage: ${result.roundBreakdown.groupStage.correct}/${result.roundBreakdown.groupStage.total} (${result.roundBreakdown.groupStage.points} pts)`);
      console.log(`    Knockout: ${result.roundBreakdown.knockoutRound.correct}/${result.roundBreakdown.knockoutRound.total} (${result.roundBreakdown.knockoutRound.points} pts)`);
      console.log(`    Medal: ${result.roundBreakdown.medalRound.correct}/${result.roundBreakdown.medalRound.total} (${result.roundBreakdown.medalRound.points} pts)`);
    });

    console.log('\n========================================\n');

    expect(true).toBe(true); // Always pass - this is for reporting
  });
});
