import { describe, it, expect, beforeAll } from 'vitest';
import { calculateLeaderboard } from '../scoring.js';

describe('Brier Scoring Integration', () => {
  const brierConfig = {
    mode: 'brier',
    points: {
      groupStage: 1,
      knockoutRound: 2,
      medalRound: 3,
    },
    brier: {
      base: 25,
      multiplier: 100
    }
  };

  const games = [
    {
      id: 'game1',
      status: { state: 'final' },
      scores: { teamA: 3, teamB: 1 },
      roundType: 'groupStage',
      teamA: { name: 'Canada' },
      teamB: { name: 'USA' }
    },
    {
      id: 'game2',
      status: { state: 'final' },
      scores: { teamA: 2, teamB: 2 },
      roundType: 'groupStage',
      teamA: { name: 'Finland' },
      teamB: { name: 'Sweden' }
    }
  ];

  const players = [
    {
      id: 'player1',
      name: 'Confident Alice',
      picks: [
        { gameId: 'game1', teamAScore: 3, teamBScore: 0, confidence: 1.0 }, // Correct, 100% = 25pts
        { gameId: 'game2', teamAScore: 1, teamBScore: 1, confidence: 1.0 }, // Correct, 100% = 25pts
      ]
    },
    {
      id: 'player2',
      name: 'Cautious Bob',
      picks: [
        { gameId: 'game1', teamAScore: 3, teamBScore: 0, confidence: 0.5 }, // Correct, 50% = 0pts
        { gameId: 'game2', teamAScore: 1, teamBScore: 1, confidence: 0.5 }, // Correct, 50% = 0pts
      ]
    },
    {
      id: 'player3',
      name: 'Wrongly Confident Charlie',
      picks: [
        { gameId: 'game1', teamAScore: 0, teamBScore: 3, confidence: 1.0 }, // Wrong, 100% = -75pts
        { gameId: 'game2', teamAScore: 2, teamBScore: 0, confidence: 1.0 }, // Wrong, 100% = -75pts
      ]
    }
  ];

  it('calculates leaderboard correctly with Brier scores', () => {
    const leaderboard = calculateLeaderboard(players, games, brierConfig);

    expect(leaderboard[0].playerName).toBe('Confident Alice');
    expect(leaderboard[0].totalPoints).toBe(50);
    
    expect(leaderboard[1].playerName).toBe('Cautious Bob');
    expect(leaderboard[1].totalPoints).toBe(0);
    
    expect(leaderboard[2].playerName).toBe('Wrongly Confident Charlie');
    expect(leaderboard[2].totalPoints).toBe(-150);
  });

  it('handles mixed confidence levels correctly', () => {
    const mixedPlayer = {
      id: 'player4',
      name: 'Mixed Dave',
      picks: [
        { gameId: 'game1', teamAScore: 3, teamBScore: 0, confidence: 0.8 }, // Correct, 80%: 1*(25 - 100*(1-0.8)^2) = 25 - 4 = 21pts
        { gameId: 'game2', teamAScore: 2, teamBScore: 0, confidence: 0.6 }, // Wrong, 60%: 1*(25 - 100*(0-0.6)^2) = 25 - 36 = -11pts
      ]
    };
    
    const leaderboard = calculateLeaderboard([...players, mixedPlayer], games, brierConfig);
    const dave = leaderboard.find(p => p.playerName === 'Mixed Dave');
    expect(dave.totalPoints).toBe(10); // 21 - 11 = 10
  });
});
