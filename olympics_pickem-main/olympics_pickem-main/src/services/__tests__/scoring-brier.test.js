import { describe, it, expect } from 'vitest';
import { calculatePickScore } from '../scoring.js';

describe('calculatePickScore with Brier mode', () => {
  const brierConfig = {
    mode: 'brier',
    points: {
      groupStage: 1,
      knockoutRound: 2,
      medalRound: 3,
    },
    brier: {
      base: 25,
      multiplier: 100,
      baseMultipliers: {
        groupStage: 1,
        playoff: 2,
      },
      overtimeMultipliers: {
        groupStage: 0.75,
        playoff: 1.5,
      }
    }
  };

  const game = {
    id: '1',
    status: { state: 'final' },
    scores: { teamA: 3, teamB: 1 },
    roundType: 'groupStage'
  };

  it('calculates Brier score for correct pick with 100% confidence', () => {
    const pick = { teamAScore: 2, teamBScore: 0, confidence: 1.0 };
    const result = calculatePickScore(pick, game, brierConfig);
    expect(result.isCorrect).toBe(true);
    expect(result.totalPoints).toBe(25);
  });

  it('calculates Brier score for incorrect pick with 100% confidence', () => {
    const pick = { teamAScore: 0, teamBScore: 2, confidence: 1.0 };
    const result = calculatePickScore(pick, game, brierConfig);
    expect(result.isCorrect).toBe(false);
    expect(result.totalPoints).toBe(-75);
  });

  it('calculates Brier score for pick with 50% confidence', () => {
    const pick = { teamAScore: 2, teamBScore: 0, confidence: 0.5 };
    const result = calculatePickScore(pick, game, brierConfig);
    expect(result.totalPoints).toBe(0);
  });

  it('applies round multipliers in Brier mode', () => {
    const knockoutGame = { ...game, roundType: 'knockoutRound' };
    const pick = { teamAScore: 2, teamBScore: 0, confidence: 1.0 };
    const result = calculatePickScore(pick, knockoutGame, brierConfig);
    expect(result.totalPoints).toBe(50); // 2 * 25
  });

  it('uses overtime multiplier for group stage OT/SO games', () => {
    const otGame = { ...game, status: { state: 'final', detail: 'Final/OT' }, roundType: 'groupStage' };
    const pick = { teamAScore: 2, teamBScore: 0, confidence: 1.0 };
    const result = calculatePickScore(pick, otGame, brierConfig);
    expect(result.totalPoints).toBe(18.75); // 0.75 * 25
    expect(result.details.overtimeShootoutAdjusted).toBe(true);
  });

  it('uses playoff overtime multiplier for knockout games', () => {
    const otGame = { ...game, status: { state: 'final', detail: 'Final/SO' }, roundType: 'knockoutRound' };
    const pick = { teamAScore: 2, teamBScore: 0, confidence: 1.0 };
    const result = calculatePickScore(pick, otGame, brierConfig);
    expect(result.totalPoints).toBe(37.5); // 1.5 * 25
  });

  it('treats medal games as playoffs in regulation', () => {
    const medalGame = { ...game, status: { state: 'final', detail: 'Final' }, roundType: 'medalRound' };
    const pick = { teamAScore: 2, teamBScore: 0, confidence: 1.0 };
    const result = calculatePickScore(pick, medalGame, brierConfig);
    expect(result.totalPoints).toBe(50); // 2 * 25
  });

  it('uses playoff overtime multiplier for medal games', () => {
    const medalOtGame = { ...game, status: { state: 'final', detail: 'Final/2OT' }, roundType: 'medalRound' };
    const pick = { teamAScore: 2, teamBScore: 0, confidence: 1.0 };
    const result = calculatePickScore(pick, medalOtGame, brierConfig);
    expect(result.totalPoints).toBe(37.5); // 1.5 * 25
  });

  it('defaults confidence to 0.5 if missing in Brier mode', () => {
    const pick = { teamAScore: 2, teamBScore: 0 };
    const result = calculatePickScore(pick, game, brierConfig);
    expect(result.totalPoints).toBe(0);
  });
});
