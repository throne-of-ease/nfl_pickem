import { describe, expect, it } from 'vitest'
import { cumulativeChartSeries, currentWeekChartData, gotwChartData, weeklyChartSeries } from '../src/charts.jsx'

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
})
