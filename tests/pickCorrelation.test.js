import { describe, expect, it } from 'vitest'
import { correlationRange, correlationColor, pearsonCorrelation, pickConfidenceCorrelationMatrix } from '../src/pickCorrelation.jsx'

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



it('scales the heatmap to finite off-diagonal sample extrema, including narrow positive ranges', () => {
  const cells = [[{ rowId: 'a', columnId: 'a', value: 1 }, { rowId: 'a', columnId: 'b', value: .81 }], [{ rowId: 'b', columnId: 'c', value: .84 }, { rowId: 'b', columnId: 'd', value: null }]]
  const range = correlationRange(cells)
  expect(range).toEqual({ min: .81, max: .84 })
  expect(correlationColor(.81, range).background).toBe('rgb(5, 48, 97)')
  expect(correlationColor(.84, range).background).toBe('rgb(103, 0, 31)')
  expect(correlationColor(.825, range).background).not.toBe(correlationColor(.81, range).background)
  expect(correlationColor(.81, range).color).toBe('#fff')
  expect(correlationColor(.84, range).color).toBe('#fff')
})

it('handles equal correlations, negative-only ranges and unavailable samples', () => {
  expect(correlationColor(.5, { min: .5, max: .5 }).background).toBe('rgb(247, 247, 247)')
  expect(correlationColor(-.9, { min: -.9, max: -.6 }).background).not.toBe(correlationColor(-.6, { min: -.9, max: -.6 }).background)
  expect(correlationRange([[{ rowId: 'a', columnId: 'a', value: 1 }]])).toBeNull()
  expect(correlationColor(null, { min: 0, max: 1 }).background).toBe('#293746')
})
