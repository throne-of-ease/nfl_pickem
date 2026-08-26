import { describe, it, expect } from 'vitest';
import {
  getResult,
  compareResults,
  compareExactScores,
  getRoundType,
  getPointsForRound,
  calculatePickScore,
  calculatePlayerScore,
  calculateLeaderboard,
} from '../scoring.js';

describe('scoring.js', () => {
  describe('getResult', () => {
    it('returns win_a when team A score is higher', () => {
      expect(getResult(4, 2)).toBe('win_a');
      expect(getResult(1, 0)).toBe('win_a');
      expect(getResult(10, 9)).toBe('win_a');
    });

    it('returns win_b when team B score is higher', () => {
      expect(getResult(2, 4)).toBe('win_b');
      expect(getResult(0, 1)).toBe('win_b');
      expect(getResult(3, 5)).toBe('win_b');
    });

    it('returns tie when scores are equal', () => {
      expect(getResult(2, 2)).toBe('tie');
      expect(getResult(0, 0)).toBe('tie');
      expect(getResult(5, 5)).toBe('tie');
    });
  });

  describe('compareResults', () => {
    it('returns true when results match', () => {
      expect(compareResults('win_a', 'win_a')).toBe(true);
      expect(compareResults('win_b', 'win_b')).toBe(true);
      expect(compareResults('tie', 'tie')).toBe(true);
    });

    it('returns false when results do not match', () => {
      expect(compareResults('win_a', 'win_b')).toBe(false);
      expect(compareResults('win_a', 'tie')).toBe(false);
      expect(compareResults('tie', 'win_b')).toBe(false);
    });
  });

  describe('compareExactScores', () => {
    it('returns true when scores match exactly', () => {
      expect(compareExactScores({ teamA: 3, teamB: 2 }, { teamA: 3, teamB: 2 })).toBe(true);
      expect(compareExactScores({ teamA: 0, teamB: 0 }, { teamA: 0, teamB: 0 })).toBe(true);
    });

    it('returns false when scores do not match', () => {
      expect(compareExactScores({ teamA: 3, teamB: 2 }, { teamA: 2, teamB: 3 })).toBe(false);
      expect(compareExactScores({ teamA: 3, teamB: 2 }, { teamA: 3, teamB: 1 })).toBe(false);
      expect(compareExactScores({ teamA: 3, teamB: 2 }, { teamA: 4, teamB: 2 })).toBe(false);
    });
  });

  describe('getRoundType', () => {
    it('returns existing roundType if valid', () => {
      expect(getRoundType({ roundType: 'groupStage' })).toBe('groupStage');
      expect(getRoundType({ roundType: 'knockoutRound' })).toBe('knockoutRound');
      expect(getRoundType({ roundType: 'medalRound' })).toBe('medalRound');
    });

    it('determines medalRound from name', () => {
      expect(getRoundType({ name: 'Gold Medal Game' })).toBe('medalRound');
      expect(getRoundType({ name: 'Bronze Medal Game' })).toBe('medalRound');
      expect(getRoundType({ roundName: 'Gold' })).toBe('medalRound');
    });

    it('determines knockoutRound from name', () => {
      expect(getRoundType({ name: 'Quarterfinals' })).toBe('knockoutRound');
      expect(getRoundType({ name: 'Semifinal' })).toBe('knockoutRound');
      expect(getRoundType({ roundName: 'Semifinals' })).toBe('knockoutRound');
    });

    it('determines groupStage from name', () => {
      expect(getRoundType({ name: 'Group A' })).toBe('groupStage');
      expect(getRoundType({ name: 'Group B' })).toBe('groupStage');
    });

    it('defaults to groupStage for unknown names', () => {
      expect(getRoundType({ name: 'Unknown Round' })).toBe('groupStage');
      expect(getRoundType({})).toBe('groupStage');
    });
  });

  describe('getPointsForRound', () => {
    it('returns correct points for each round type', () => {
      expect(getPointsForRound('groupStage')).toBe(1);
      expect(getPointsForRound('knockoutRound')).toBe(2);
      expect(getPointsForRound('medalRound')).toBe(3);
    });

    it('defaults to groupStage points for unknown round', () => {
      expect(getPointsForRound('unknown')).toBe(1);
    });
  });

  describe('calculatePickScore', () => {
    const mockConfig = {
      points: {
        groupStage: 1,
        knockoutRound: 2,
        medalRound: 3,
      },
      exactScoreBonus: {
        enabled: false,
        points: 1,
      },
    };

    it('returns zero for scheduled (not started) games', () => {
      const pick = { teamAScore: 3, teamBScore: 2 };
      const game = {
        id: '1',
        status: { state: 'scheduled' },
        scores: { teamA: null, teamB: null },
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.totalPoints).toBe(0);
      expect(result.isCorrect).toBe(false);
      expect(result.details.reason).toBe('Game not started');
    });

    it('scores in-progress games with current scores', () => {
      const pick = { teamAScore: 3, teamBScore: 2 }; // Predicting win_a
      const game = {
        id: '1',
        status: { state: 'in_progress' },
        scores: { teamA: 2, teamB: 1 }, // Currently win_a
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.totalPoints).toBe(1); // Provisional correct
      expect(result.isCorrect).toBe(true);
    });

    it('returns zero for games with missing scores', () => {
      const pick = { teamAScore: 3, teamBScore: 2 };
      const game = {
        id: '1',
        status: { state: 'final' },
        scores: { teamA: null, teamB: null },
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.totalPoints).toBe(0);
      expect(result.details.reason).toBe('Missing actual scores');
    });

    it('scores correctly for groupStage win', () => {
      const pick = { teamAScore: 3, teamBScore: 2 };
      const game = {
        id: '1',
        status: { state: 'final' },
        scores: { teamA: 4, teamB: 1 },
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.isCorrect).toBe(true);
      expect(result.basePoints).toBe(1);
      expect(result.totalPoints).toBe(1);
    });

    it('scores correctly for knockoutRound win', () => {
      const pick = { teamAScore: 2, teamBScore: 1 };
      const game = {
        id: '1',
        status: { state: 'final' },
        scores: { teamA: 3, teamB: 0 },
        roundType: 'knockoutRound'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.isCorrect).toBe(true);
      expect(result.basePoints).toBe(2);
      expect(result.totalPoints).toBe(2);
    });

    it('scores correctly for medalRound win', () => {
      const pick = { teamAScore: 5, teamBScore: 2 };
      const game = {
        id: '1',
        status: { state: 'final' },
        scores: { teamA: 4, teamB: 3 },
        roundType: 'medalRound'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.isCorrect).toBe(true);
      expect(result.basePoints).toBe(3);
      expect(result.totalPoints).toBe(3);
    });

    it('returns zero for incorrect prediction', () => {
      const pick = { teamAScore: 3, teamBScore: 2 }; // predicting win_a
      const game = {
        id: '1',
        status: { state: 'final' },
        scores: { teamA: 1, teamB: 2 }, // actual win_b
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.isCorrect).toBe(false);
      expect(result.totalPoints).toBe(0);
    });

    it('awards exact score bonus when enabled', () => {
      const configWithBonus = {
        ...mockConfig,
        exactScoreBonus: { enabled: true, points: 2 },
      };
      const pick = { teamAScore: 3, teamBScore: 2 };
      const game = {
        id: '1',
        status: { state: 'final' },
        scores: { teamA: 3, teamB: 2 },
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, configWithBonus);
      expect(result.isCorrect).toBe(true);
      expect(result.basePoints).toBe(1);
      expect(result.bonusPoints).toBe(2);
      expect(result.totalPoints).toBe(3);
      expect(result.details.exactScore).toBe(true);
    });

    it('handles tie predictions correctly', () => {
      const pick = { teamAScore: 2, teamBScore: 2 };
      const game = {
        id: '1',
        status: { state: 'final' },
        scores: { teamA: 1, teamB: 1 },
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.isCorrect).toBe(true);
      expect(result.details.predictedResult).toBe('tie');
      expect(result.details.actualResult).toBe('tie');
    });

    it('handles game with status as string', () => {
      const pick = { teamAScore: 3, teamBScore: 2 };
      const game = {
        id: '1',
        status: 'final',
        scores: { teamA: 4, teamB: 1 },
        roundType: 'groupStage'
      };

      const result = calculatePickScore(pick, game, mockConfig);
      expect(result.isCorrect).toBe(true);
    });
  });

  describe('calculatePlayerScore', () => {
    const mockConfig = {
      points: {
        groupStage: 1,
        knockoutRound: 2,
        medalRound: 3,
      },
      exactScoreBonus: { enabled: false, points: 1 },
    };

    const mockGames = [
      { id: '1', status: { state: 'final' }, scores: { teamA: 3, teamB: 1 }, roundType: 'groupStage' },
      { id: '2', status: { state: 'final' }, scores: { teamA: 2, teamB: 2 }, roundType: 'groupStage' },
      { id: '3', status: { state: 'final' }, scores: { teamA: 1, teamB: 3 }, roundType: 'knockoutRound' },
      { id: '4', status: { state: 'scheduled' }, scores: { teamA: null, teamB: null }, roundType: 'medalRound' },
    ];

    it('calculates total score across multiple picks', () => {
      const picks = [
        { gameId: '1', teamAScore: 4, teamBScore: 2 }, // correct (win_a)
        { gameId: '2', teamAScore: 1, teamBScore: 1 }, // correct (tie)
        { gameId: '3', teamAScore: 2, teamBScore: 0 }, // wrong (predicted win_a, actual win_b)
      ];

      const result = calculatePlayerScore(picks, mockGames, mockConfig);
      expect(result.totalPoints).toBe(2); // 1 (groupStage) + 1 (groupStage) + 0 = 2
      expect(result.correctPicks).toBe(2);
      expect(result.scoredGames).toBe(3);
    });

    it('calculates accuracy correctly', () => {
      const picks = [
        { gameId: '1', teamAScore: 4, teamBScore: 2 }, // correct
        { gameId: '2', teamAScore: 3, teamBScore: 1 }, // wrong
      ];

      const result = calculatePlayerScore(picks, mockGames, mockConfig);
      expect(result.accuracy).toBe('50.0');
    });

    it('handles picks for games not found', () => {
      const picks = [
        { gameId: 'nonexistent', teamAScore: 1, teamBScore: 0 },
      ];

      const result = calculatePlayerScore(picks, mockGames, mockConfig);
      expect(result.pickResults[0].error).toBe('Game not found');
      expect(result.totalPoints).toBe(0);
    });

    it('tracks round breakdown correctly', () => {
      const picks = [
        { gameId: '1', teamAScore: 4, teamBScore: 2 }, // correct groupStage
        { gameId: '3', teamAScore: 0, teamBScore: 2 }, // correct knockoutRound
      ];

      const result = calculatePlayerScore(picks, mockGames, mockConfig);
      expect(result.roundBreakdown.groupStage.correct).toBe(1);
      expect(result.roundBreakdown.groupStage.points).toBe(1);
      expect(result.roundBreakdown.knockoutRound.correct).toBe(1);
      expect(result.roundBreakdown.knockoutRound.points).toBe(2);
    });

    // This test is no longer relevant as calculatePlayerScore expects games to be pre-filtered.
    // The filtering logic for scheduled games is now handled in `leaderboardCalculator.js`.
    // We will keep the test but comment it out or adapt it if needed for future logic.
    it.skip('ignores scheduled games in scoring', () => {
      const picks = [
        { gameId: '4', teamAScore: 2, teamBScore: 1 }, // game not yet played
      ];

      const result = calculatePlayerScore(picks, mockGames, mockConfig);
      expect(result.scoredGames).toBe(0);
      expect(result.totalPoints).toBe(0);
    });
  });

  describe('calculateLeaderboard', () => {
    const mockConfig = {
      points: { groupStage: 1, knockoutRound: 2, medalRound: 3 },
      exactScoreBonus: { enabled: false, points: 1 },
    };

    const mockGames = [
      { id: '1', status: { state: 'final' }, scores: { teamA: 3, teamB: 1 }, roundType: 'groupStage' },
      { id: '2', status: { state: 'final' }, scores: { teamA: 2, teamB: 2 }, roundType: 'groupStage' },
    ];

    const mockPlayers = [
      {
        id: 'player1',
        name: 'Alice',
        picks: [
          { gameId: '1', teamAScore: 2, teamBScore: 0 }, // correct
          { gameId: '2', teamAScore: 1, teamBScore: 1 }, // correct
        ],
      },
      {
        id: 'player2',
        name: 'Bob',
        picks: [
          { gameId: '1', teamAScore: 0, teamBScore: 2 }, // wrong
          { gameId: '2', teamAScore: 3, teamBScore: 0 }, // wrong
        ],
      },
      {
        id: 'player3',
        name: 'Charlie',
        picks: [
          { gameId: '1', teamAScore: 3, teamBScore: 0 }, // correct
          { gameId: '2', teamAScore: 0, teamBScore: 1 }, // wrong
        ],
      },
    ];

    it('sorts players by total points descending', () => {
      const leaderboard = calculateLeaderboard(mockPlayers, mockGames, mockConfig);

      expect(leaderboard[0].playerName).toBe('Alice');
      expect(leaderboard[0].totalPoints).toBe(2);
      expect(leaderboard[1].playerName).toBe('Charlie');
      expect(leaderboard[1].totalPoints).toBe(1);
      expect(leaderboard[2].playerName).toBe('Bob');
      expect(leaderboard[2].totalPoints).toBe(0);
    });

    it('assigns correct ranks', () => {
      const leaderboard = calculateLeaderboard(mockPlayers, mockGames, mockConfig);

      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[2].rank).toBe(3);
    });

    it('handles ties with same rank', () => {
      const playersWithTie = [
        {
          id: 'player1',
          name: 'Alice',
          picks: [{ gameId: '1', teamAScore: 2, teamBScore: 0 }], // 1 point
        },
        {
          id: 'player2',
          name: 'Bob',
          picks: [{ gameId: '1', teamAScore: 3, teamBScore: 1 }], // 1 point
        },
      ];

      const leaderboard = calculateLeaderboard(playersWithTie, mockGames, mockConfig);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(1);
    });

    it('sorts by correct picks as tiebreaker', () => {
      const games = [
        { id: '1', status: { state: 'final' }, scores: { teamA: 3, teamB: 1 }, roundType: 'groupStage' },
        { id: '2', status: { state: 'final' }, scores: { teamA: 0, teamB: 2 }, roundType: 'groupStage' },
      ];

      const playersWithTie = [
        {
          id: 'player1',
          name: 'Alice',
          picks: [
            { gameId: '1', teamAScore: 2, teamBScore: 0 }, // correct
          ],
        },
        {
          id: 'player2',
          name: 'Bob',
          picks: [
            { gameId: '2', teamAScore: 1, teamBScore: 3 }, // correct
          ],
        },
      ];

      const leaderboard = calculateLeaderboard(playersWithTie, games, mockConfig);
      // Both have 1 point, 1 correct pick - sorted alphabetically
      expect(leaderboard[0].playerName).toBe('Alice');
      expect(leaderboard[1].playerName).toBe('Bob');
    });

    it('handles empty players array', () => {
      const leaderboard = calculateLeaderboard([], mockGames, mockConfig);
      expect(leaderboard).toEqual([]);
    });

    it('handles players with no picks', () => {
      const playersNoPicks = [
        { id: 'player1', name: 'Alice', picks: [] },
      ];

      const leaderboard = calculateLeaderboard(playersNoPicks, mockGames, mockConfig);
      expect(leaderboard[0].totalPoints).toBe(0);
      expect(leaderboard[0].correctPicks).toBe(0);
    });
  });
});
