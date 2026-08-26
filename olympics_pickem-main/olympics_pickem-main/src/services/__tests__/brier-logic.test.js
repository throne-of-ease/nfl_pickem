import { describe, it, expect } from 'vitest';
import { calculateBrierPoints } from '../scoring';

describe('calculateBrierPoints', () => {
  const config = {
    brier: {
      base: 25,
      multiplier: 100
    }
  };

  it('calculates points for 100% confidence correctly', () => {
    // Correct 100%
    expect(calculateBrierPoints(true, 1.0, 1, config)).toBe(25);
    // Incorrect 100%
    expect(calculateBrierPoints(false, 1.0, 1, config)).toBe(-75);
  });

  it('calculates points for 50% confidence correctly', () => {
    // Correct 50%
    expect(calculateBrierPoints(true, 0.5, 1, config)).toBe(0);
    // Incorrect 50%
    expect(calculateBrierPoints(false, 0.5, 1, config)).toBe(0);
  });

  it('calculates points for 75% confidence correctly', () => {
    // Correct 75%
    // 1 * (25 - (100 * (1 - 0.75)^2)) = 25 - (100 * 0.0625) = 25 - 6.25 = 18.75
    expect(calculateBrierPoints(true, 0.75, 1, config)).toBe(18.75);
    
    // Incorrect 75%
    // 1 * (25 - (100 * (0 - 0.75)^2)) = 25 - (100 * 0.5625) = 25 - 56.25 = -31.25
    expect(calculateBrierPoints(false, 0.75, 1, config)).toBe(-31.25);
  });

  it('applies round multiplier correctly', () => {
    expect(calculateBrierPoints(true, 1.0, 3, config)).toBe(75);
    expect(calculateBrierPoints(false, 1.0, 3, config)).toBe(-225);
  });

  it('defaults confidence to 0.5 if not provided', () => {
    expect(calculateBrierPoints(true, undefined, 1, config)).toBe(0);
  });
});
