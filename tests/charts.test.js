import { describe, expect, it } from 'vitest'
import { COLORS, aggressivenessChartData, chartLegendLayout, cumulativeChartSeries, currentWeekChartData, gotwChartData, leaderAxisTicks, teamBarValueLabelLayout, teamBenchmarkRelativeExposure, teamBenchmarkRelativePoints, weeklyAggressivenessSeries, weeklyChartSeries } from '../src/charts.jsx'
import { buildSeasonHistory } from '../src/domain.js'

const history = {
  weeks: ['W1', 'W2'],
  users: [{
    name: 'Alex',
    weekly: [5, 10],
    correct: [1, 2],
    possible: [20, 25],
    gameCounts: [4, 4],
    lockedPossible: [10, 20],
    lockedGameCounts: [2, 4],
    relative: [-3, 0],
    relativePotential: [-1, 0],
    gotw: 6,
    gotwPossible: 10,
    gotwCorrect: 1,
    gotwPlayed: 2,
    gotwLockedCount: 1,
    gotwPotential: 11,
  }],
}

describe('tracker-compatible chart transformations', () => {
  it('uses only finished or locked games in weekly percentage denominators', () => {
    expect(weeklyChartSeries(history, 'correct_percentage')[0].values).toEqual([50, 50])
    expect(weeklyChartSeries(history, 'points_percentage')[0].values).toEqual([50, 50])
  })

  it('excludes a picked future GOTW from weekly and GOTW percentage denominators', () => {
    const games = [
      { id: 'finished', away: 'A1', home: 'H1', kickoff: '2026-01-01T00:00:00Z', status: 'final', awayScore: 14, homeScore: 21, gotw: true },
      { id: 'locked', away: 'A2', home: 'H2', kickoff: '2099-01-01T00:00:00Z', status: 'scheduled', locked: true },
      { id: 'future', away: 'A3', home: 'H3', kickoff: '2099-01-02T00:00:00Z', status: 'scheduled', gotw: true },
    ]
    const built = buildSeasonHistory(
      [{ id: 'alex', name: 'Alex' }],
      { 'week-01': games },
      { alex: { 'week-01': [
        { gameId: 'finished', team: 'H1', confidence: 1 },
        { gameId: 'locked', team: 'A2', confidence: 2 },
        { gameId: 'future', team: 'H3', confidence: 3 },
      ] } },
      false,
      'week-01',
    )

    expect(built.users[0].lockedGameCounts).toEqual([2])
    expect(built.users[0].lockedPossible).toEqual([8])
    expect(weeklyChartSeries(built, 'correct_percentage')[0].values).toEqual([50])
    expect(weeklyChartSeries(built, 'points_percentage')[0].values).toEqual([75])
    expect(gotwChartData(built, 'points_percentage')[0].value).toBe(100)
    expect(gotwChartData(built, 'correct_percentage')[0].value).toBe(100)
  })

  it('plots cumulative gaps to the leader with a separate potential line', () => {
    expect(cumulativeChartSeries(history)[0]).toMatchObject({ values: [-3, 0], potentialValues: [-1, 0] })
  })

  it('keeps player legend labels apart and uses a distinct fourth color', () => {
    const layout = chartLegendLayout([{ name: 'Alexandra' }, { name: 'Christopher' }, { name: 'Casey' }, { name: 'Devon' }], 54, 722)
    for (let index = 1; index < layout.length; index += 1) {
      if (layout[index].row === layout[index - 1].row) expect(layout[index].x).toBeGreaterThanOrEqual(layout[index - 1].x + layout[index - 1].width)
    }
    expect(COLORS).toEqual(['#4477aa', '#ccbb44', '#228833', '#ee6677', '#66ccee', '#aa3377', '#bbbbbb'])
  })

  it('uses even, readable leader-gap ticks including zero', () => {
    expect(leaderAxisTicks([-21, -15, -6, 0])).toEqual([-25, -20, -15, -10, -5, 0])
    expect(leaderAxisTicks([-21, 2])).toEqual([-25, -20, -15, -10, -5, 0, 5])
    expect(leaderAxisTicks([0, 0])).toEqual([-1, 0, 1])
  })

  it('uses only finished or locked GOTW games in percentage denominators', () => {
    expect(gotwChartData(history, 'points_percentage')[0].value).toBe(60)
    expect(gotwChartData(history, 'correct_percentage')[0].value).toBe(100)
  })

  it('compares current-week results with weekly and season leaders correctly', () => {
    const current = [
      { name: 'Alex', points: 5, potential: 2, correct: 1, gameCount: 4, lockedGameCount: 2, maximum: 15, lockedMaximum: 10, seasonTotal: 100 },
      { name: 'Blair', points: 10, potential: 1, correct: 2, gameCount: 4, lockedGameCount: 4, maximum: 15, lockedMaximum: 20, seasonTotal: 90 },
    ]
    const correctPercentage = currentWeekChartData(current, 'correct_percentage').find((item) => item.name === 'Alex')
    expect(correctPercentage).toMatchObject({ value: 50 })
    expect(correctPercentage).not.toHaveProperty('potential')
    expect(currentWeekChartData(current, 'points_percentage').find((item) => item.name === 'Alex')).toMatchObject({ value: 50 })
    expect(currentWeekChartData(current, 'vs_leader').find((item) => item.name === 'Alex')).toMatchObject({ value: -5, potential: -4 })
    expect(currentWeekChartData(current, 'vs_total_leader')).toEqual([
      { name: 'Alex', colorIndex: 0, value: 0, potential: 0 },
      { name: 'Blair', colorIndex: 1, value: 5, potential: 4 },
    ])
  })

  it('treats equal confidence on opposite teams as the sum of both confidences', () => {
    const games = [
      { id: 'g1', home: 'H1', away: 'A1', locked: true, predictorHome: .51 },
      { id: 'g2', home: 'H2', away: 'A2', locked: true, predictorHome: .60 },
      { id: 'g3', home: 'H3', away: 'A3', locked: true, predictorHome: .90 },
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
    const game = { id: 'g1', home: 'HOME', away: 'AWAY', locked: true, predictorHome: .8, homeMoneyline: 200, awayMoneyline: -200 }
    const args = [[{ id: 'alex', name: 'Alex' }], { 'week-01': [game] }, { alex: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 1 }] } }]
    expect(aggressivenessChartData(...args, 'predictor')[0].value).toBe(0)
    expect(aggressivenessChartData(...args, 'moneyline')[0].value).toBe(2)
    expect(aggressivenessChartData(...args, 'aggregate')[0].value).toBe(0)
  })

  it('calculates each player\'s aggressiveness separately by week', () => {
    const games = [
      { id: 'g1', home: 'H1', away: 'A1', locked: true, predictorHome: .51 },
      { id: 'g2', home: 'H2', away: 'A2', locked: true, predictorHome: .60 },
      { id: 'g3', home: 'H3', away: 'A3', locked: true, predictorHome: .90 },
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

  it('ignores unlocked picks and compares every locked game in a full slate', () => {
    const lockedGames = Array.from({ length: 16 }, (_, index) => ({ id: `g${index + 1}`, home: `H${index + 1}`, away: `A${index + 1}`, locked: true, predictorHome: .51 + index / 100 }))
    const unlocked = { id: 'future', home: 'HF', away: 'AF', kickoff: '2099-09-01T12:00:00Z', predictorHome: .9 }
    const picks = [...lockedGames.map((game, index) => ({ gameId: game.id, team: game.home, confidence: index + 1 })), { gameId: 'future', team: 'AF', confidence: 17 }]
    const [result] = aggressivenessChartData([{ id: 'alex', name: 'Alex' }], { 'week-01': [...lockedGames, unlocked] }, { alex: { 'week-01': picks } }, 'predictor')
    expect(result).toMatchObject({ value: 0, comparisons: 16 })
  })
})


describe('team-relative positions versus benchmark', () => {
  const players = [{ id: 'alex', name: 'Alex' }, { id: 'blair', name: 'Blair' }]
  const gamesByPool = {
    'week-01': [
      { id: 'g1', home: 'HOME', away: 'AWAY', status: 'final', homeScore: 24, awayScore: 14, predictorHome: .90, homeMoneyline: -300, awayMoneyline: 250 },
      { id: 'g2', home: 'H2', away: 'A2', status: 'final', homeScore: 21, awayScore: 17, predictorHome: .60, homeMoneyline: -140, awayMoneyline: 120 },
    ],
    'week-02': [
      { id: 'g3', home: 'H3', away: 'A3', status: 'final', homeScore: 10, awayScore: 20, predictorHome: .80, homeMoneyline: -200, awayMoneyline: 170 },
    ],
  }

  it('treats lower confidence in a team as an overweight in its opponent against a model', () => {
    const picks = { alex: { 'week-01': [
      { gameId: 'g1', team: 'HOME', confidence: 1 },
      { gameId: 'g2', team: 'A2', confidence: 2 },
    ] } }
    expect(teamBenchmarkRelativePoints(players, gamesByPool, picks, 'alex', 'predictor', ['week-01'])).toMatchObject([
      { name: 'AWAY', value: -1, relativeStake: 1, playerNet: 1, benchmarkNet: 2, comparisons: 1 },
      { name: 'A2', value: -3, relativeStake: 3, playerNet: -2, benchmarkNet: 1, comparisons: 1 },
    ])
  })

  it('compares directly with another player pick and confidence', () => {
    const picks = {
      alex: { 'week-01': [
        { gameId: 'g1', team: 'HOME', confidence: 1 },
        { gameId: 'g2', team: 'A2', confidence: 2 },
      ] },
      blair: { 'week-01': [
        { gameId: 'g1', team: 'HOME', confidence: 2 },
        { gameId: 'g2', team: 'H2', confidence: 1 },
      ] },
    }
    expect(teamBenchmarkRelativePoints(players, gamesByPool, picks, 'alex', 'player:blair', ['week-01'])).toMatchObject([
      { name: 'AWAY', value: -1, relativeStake: 1, playerNet: 1, benchmarkNet: 2, comparisons: 1 },
      { name: 'A2', value: -3, relativeStake: 3, playerNet: -2, benchmarkNet: 1, comparisons: 1 },
    ])
  })

  it('excludes games where the comparison player has no usable pick', () => {
    const picks = {
      alex: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 1 }], 'week-02': [{ gameId: 'g3', team: 'A3', confidence: 1 }] },
      blair: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 2 }] },
    }
    expect(teamBenchmarkRelativePoints(players, gamesByPool, picks, 'alex', 'player:blair', ['week-02'])).toMatchObject([])
  })

  it('sums only non-zero positions for All players when comparing with another player', () => {
    const picks = {
      alex: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 1 }] },
      blair: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 2 }] },
    }
    expect(teamBenchmarkRelativePoints(players, gamesByPool, picks, null, 'player:blair', ['week-01'])).toMatchObject([
      { name: 'AWAY', value: -1, relativeStake: 1, playerNet: 1, benchmarkNet: 2, comparisons: 1 },
    ])
  })

  it('uses the requested model baseline and omits identical positions', () => {
    const game = { id: 'g', home: 'HOME', away: 'AWAY', status: 'final', homeScore: 28, awayScore: 20, predictorHome: .8, homeMoneyline: 200, awayMoneyline: -200 }
    const picks = { alex: { 'week-01': [{ gameId: 'g', team: 'HOME', confidence: 1 }] } }
    const games = { 'week-01': [game] }
    expect(teamBenchmarkRelativePoints(players, games, picks, 'alex', 'predictor', ['week-01'])).toMatchObject([])
    expect(teamBenchmarkRelativePoints(players, games, picks, 'alex', 'moneyline', ['week-01'])).toMatchObject([
      { name: 'HOME', value: 2, relativeStake: 2, playerNet: 1, benchmarkNet: -1, comparisons: 1 },
    ])
  })

  it('shows both sides in the over/underweight view and sums to zero', () => {
    const picks = {
      alex: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 1 }] },
      blair: { 'week-01': [{ gameId: 'g1', team: 'HOME', confidence: 2 }] },
    }
    const rows = teamBenchmarkRelativeExposure(players, gamesByPool, picks, 'alex', 'player:blair', ['week-01'])
    expect(rows).toMatchObject([
      { name: 'AWAY', value: 1, comparisons: 1 },
      { name: 'HOME', value: -1, comparisons: 1 },
    ])
    expect(rows.reduce((sum, row) => sum + row.value, 0)).toBe(0)
  })

  it('includes GOTW bonus stake against another player when picks oppose', () => {
    const game = { id: 'gotw', home: 'HOME', away: 'AWAY', status: 'final', homeScore: 10, awayScore: 20, predictorHome: .8, gotw: true }
    const games = { 'week-01': [game] }
    const picks = {
      alex: { 'week-01': [{ gameId: 'gotw', team: 'AWAY', confidence: 1 }] },
      blair: { 'week-01': [{ gameId: 'gotw', team: 'HOME', confidence: 1 }] },
    }
    expect(teamBenchmarkRelativePoints(players, games, picks, 'alex', 'player:blair', ['week-01'])).toMatchObject([
      { name: 'AWAY', value: 12, relativeStake: 12, playerNet: 6, benchmarkNet: -6, comparisons: 1 },
    ])
    expect(teamBenchmarkRelativeExposure(players, games, picks, 'alex', 'player:blair', ['week-01'])).toMatchObject([
      { name: 'AWAY', value: 12, comparisons: 1 },
      { name: 'HOME', value: -12, comparisons: 1 },
    ])
  })
})


describe('team model chart label layout', () => {
  it('moves a far-left negative value label inside its bar instead of into the team-name column', () => {
    expect(teamBarValueLabelLayout(-17, 78, 78, 120, 78)).toEqual({
      x: 84,
      anchor: 'start',
      inside: true,
      fill: '#fff',
      label: '-17',
    })
  })

  it('keeps smaller negative and positive labels outside their bars', () => {
    expect(teamBarValueLabelLayout(-2, 240, 240, 80, 78)).toMatchObject({ x: 234, anchor: 'end', inside: false, fill: null, label: '-2' })
    expect(teamBarValueLabelLayout(7, 500, 400, 100, 78)).toMatchObject({ x: 506, anchor: 'start', inside: false, fill: null, label: '+7' })
  })
})
