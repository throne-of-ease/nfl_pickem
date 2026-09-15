import { describe, expect, it } from 'vitest'
import { aggressivenessChartData, cumulativeChartSeries, currentWeekChartData, gotwChartData, weeklyAggressivenessSeries, weeklyChartSeries } from '../src/charts.jsx'

const history = {
  weeks: ['W1', 'W2'],
  users: [{
    name: 'Alex',
    weekly: [5, 10],
    correct: [1, 2],
    possible: [20, 25],
    gameCounts: [4, 4],
    relative: [-3, 0],
    relativePotential: [-1, 0],
    gotw: 6,
    gotwPossible: 10,
    gotwCorrect: 1,
    gotwPlayed: 2,
    gotwPotential: 11,
  }],
}

describe('tracker-compatible chart transformations', () => {
  it('uses full weekly game count for correct-pick percentage', () => {
    expect(weeklyChartSeries(history, 'correct_percentage')[0].values).toEqual([25, 50])
    expect(weeklyChartSeries(history, 'points_percentage')[0].values).toEqual([25, 40])
  })

  it('plots cumulative gaps to the leader with a separate potential line', () => {
    expect(cumulativeChartSeries(history)[0]).toMatchObject({ values: [-3, 0], potentialValues: [-1, 0] })
  })

  it('uses all played GOTW stakes as the points-percentage denominator', () => {
    expect(gotwChartData(history, 'points_percentage')[0].value).toBe(60)
    expect(gotwChartData(history, 'correct_percentage')[0].value).toBe(50)
  })

  it('compares current-week results with weekly and season leaders correctly', () => {
    const current = [
      { name: 'Alex', points: 5, potential: 2, correct: 1, gameCount: 4, maximum: 15, seasonTotal: 100 },
      { name: 'Blair', points: 10, potential: 1, correct: 2, gameCount: 4, maximum: 15, seasonTotal: 90 },
    ]
    const correctPercentage = currentWeekChartData(current, 'correct_percentage').find((item) => item.name === 'Alex')
    expect(correctPercentage).toMatchObject({ value: 25 })
    expect(correctPercentage).not.toHaveProperty('potential')
    expect(currentWeekChartData(current, 'vs_leader').find((item) => item.name === 'Alex')).toMatchObject({ value: -5, potential: -4 })
    expect(currentWeekChartData(current, 'vs_total_leader')).toEqual([
      { name: 'Alex', colorIndex: 0, value: 0, potential: 0 },
      { name: 'Blair', colorIndex: 1, value: 5, potential: 4 },
    ])
  })

  it('treats equal confidence on opposite teams as the sum of both confidences', () => {
    const games = [
      { id: 'g1', home: 'H1', away: 'A1', kickoff: '2026-09-01T12:00:00Z', predictorHome: .51 },
      { id: 'g2', home: 'H2', away: 'A2', kickoff: '2026-09-01T13:00:00Z', predictorHome: .60 },
      { id: 'g3', home: 'H3', away: 'A3', kickoff: '2026-09-01T14:00:00Z', predictorHome: .90 },
    ]
    const result = aggressivenessChartData(
      [{ id: 'alex', name: 'Alex' }],
      { 'week-01': games },
      { alex: { 'week-01': [{ gameId: 'g3', team: 'A3', confidence: 3 }] } },
      'predictor',
    )
    expect(result[0]).toMatchObject({ name: 'Alex', value: 6, comparisons: 1 })
  })

  it('switches between FPI, moneyline, and their average', () => {
    const game = { id: 'g1', home: 'HOME', away: 'AWAY', kickoff: '2026-09-01T12:00:00Z', predictorHome: .8, homeMoneyline: 200, awayMoneyline: -200 }
    const args = [[{ id: 'alex', name: 'Alex' }], { 'week-01': [game] }, { alex: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 1 }] } }]
    expect(aggressivenessChartData(...args, 'predictor')[0].value).toBe(0)
    expect(aggressivenessChartData(...args, 'moneyline')[0].value).toBe(2)
    expect(aggressivenessChartData(...args, 'aggregate')[0].value).toBe(0)
  })

  it('calculates each player\'s aggressiveness separately by week', () => {
    const games = [
      { id: 'g1', home: 'H1', away: 'A1', kickoff: '2026-09-01T12:00:00Z', predictorHome: .51 },
      { id: 'g2', home: 'H2', away: 'A2', kickoff: '2026-09-01T13:00:00Z', predictorHome: .60 },
      { id: 'g3', home: 'H3', away: 'A3', kickoff: '2026-09-01T14:00:00Z', predictorHome: .90 },
    ]
    const series = weeklyAggressivenessSeries(
      [{ id: 'alex', name: 'Alex' }],
      { 'week-01': games, 'week-02': games },
      { alex: { 'week-01': [{ gameId: 'g3', team: 'A3', confidence: 3 }], 'week-02': [{ gameId: 'g3', team: 'H3', confidence: 3 }] } },
      'predictor',
      ['week-01', 'week-02'],
    )
    expect(series).toEqual([{ name: 'Alex', values: [6, 0] }])
  })
})
