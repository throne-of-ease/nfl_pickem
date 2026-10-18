import { describe, expect, it } from 'vitest'
import { pearsonCorrelation, pickConfidenceCorrelationMatrix } from '../src/pickCorrelation.jsx'

describe('pick confidence correlation matrix', () => {
  it('returns standard Pearson correlation values', () => {
    expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(pearsonCorrelation([1, 2, 3], [-2, -4, -6])).toBeCloseTo(-1)
    expect(pearsonCorrelation([1], [1])).toBeNull()
    expect(pearsonCorrelation([1, 1, 1], [1, 2, 3])).toBeNull()
  })

  it('treats opposite-team picks as opposite signed confidence signals', () => {
    const players = [
      { id: 'alex', name: 'Alex' },
      { id: 'blair', name: 'Blair' },
      { id: 'casey', name: 'Casey' },
    ]
    const gamesByPool = {
      'week-01': [
        { id: 'g1', home: 'H1', away: 'A1', locked: true },
        { id: 'g2', home: 'H2', away: 'A2', locked: true },
        { id: 'g3', home: 'H3', away: 'A3', locked: true },
      ],
    }
    const picksByUser = {
      alex: { 'week-01': [
        { gameId: 'g1', team: 'H1', confidence: 1 },
        { gameId: 'g2', team: 'H2', confidence: 2 },
        { gameId: 'g3', team: 'H3', confidence: 3 },
      ] },
      blair: { 'week-01': [
        { gameId: 'g1', team: 'H1', confidence: 1 },
        { gameId: 'g2', team: 'H2', confidence: 2 },
        { gameId: 'g3', team: 'H3', confidence: 3 },
      ] },
      casey: { 'week-01': [
        { gameId: 'g1', team: 'A1', confidence: 1 },
        { gameId: 'g2', team: 'A2', confidence: 2 },
        { gameId: 'g3', team: 'A3', confidence: 3 },
      ] },
    }

    const matrix = pickConfidenceCorrelationMatrix(players, gamesByPool, picksByUser, ['week-01'])
    expect(matrix.cells[0][1]).toMatchObject({ count: 3 })
    expect(matrix.cells[0][1].value).toBeCloseTo(1)
    expect(matrix.cells[0][2].value).toBeCloseTo(-1)
  })

  it('uses only common locked games and excludes missing picks pairwise', () => {
    const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    const gamesByPool = { 'week-01': [
      { id: 'g1', home: 'H1', away: 'A1', locked: true },
      { id: 'g2', home: 'H2', away: 'A2', locked: true },
      { id: 'future', home: 'HF', away: 'AF', kickoff: '2099-01-01T00:00:00Z', status: 'scheduled' },
    ] }
    const picksByUser = {
      a: { 'week-01': [{ gameId: 'g1', team: 'H1', confidence: 1 }, { gameId: 'g2', team: 'H2', confidence: 2 }, { gameId: 'future', team: 'HF', confidence: 3 }] },
      b: { 'week-01': [{ gameId: 'g1', team: 'H1', confidence: 2 }, { gameId: 'g2', team: 'H2', confidence: 1 }] },
    }
    const matrix = pickConfidenceCorrelationMatrix(players, gamesByPool, picksByUser, ['week-01'])
    expect(matrix.cells[0][1].count).toBe(2)
    expect(matrix.cells[0][1].value).toBeCloseTo(-1)
  })
})
