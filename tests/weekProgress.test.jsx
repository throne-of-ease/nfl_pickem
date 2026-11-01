import React from 'react'
import { expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { poolMetrics } from '../src/domain.js'
import { WeekProgressChart, weekProgressData, kickoffGroupLabel } from '../src/weekProgress.jsx'

const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Blair' }]
const games = [
  { id: 'g3', kickoff: '2026-01-02T18:00:00Z', status: 'live', home: 'H3', away: 'A3', homeScore: 3, awayScore: 7 },
  { id: 'g2', kickoff: '2026-01-01T18:00:00Z', status: 'final', home: 'H2', away: 'A2', homeScore: 0, awayScore: 7, gotw: true },
  { id: 'g1', kickoff: '2026-01-01T18:00:00Z', status: 'final', home: 'H1', away: 'A1', homeScore: 10, awayScore: 3 },
  { id: 'g4', kickoff: '2099-01-01T18:00:00Z', status: 'scheduled', home: 'H4', away: 'A4' },
]
const picks = {
  a: [1, 2, 3, 4].map((confidence) => ({ gameId: `g${confidence}`, team: `H${confidence}`, confidence })),
  b: [1, 2, 3].map((value) => ({ gameId: `g${value}`, team: `A${value}`, confidence: 5 - value })),
}

it('orders games deterministically and computes earned, lost, potential and net with GOTW', () => {
  const options = { viewerId: 'a', provisional: true }
  const expected = { earned: [0, 1, 1, 1, 1], lost: [0, 0, 7, 10, 10], potential: [0, 1, 1, 1, 5], net: [0, 1, -6, -9, -9] }
  for (const [metric, values] of Object.entries(expected)) {
    const data = weekProgressData(players, games, picks, { ...options, metric })
    expect(data.series[0].values).toEqual(values)
    expect(data.details[1]).toContain('A1 @ H1')
    expect(data.details[1]).toContain('19:00 Berlin')
    const grouped = weekProgressData(players, games, picks, { ...options, metric, groupKickoffs: true })
    expect(grouped.series[0].values).toEqual([0, values[2], values[3], values[4]])
    expect(grouped.details[1]).toContain('A1 @ H1, A2 @ H2')
  }
})

it.each([false, true])('reconciles all endpoints with weekly scoring (provisional=%s)', (provisional) => {
  const totals = poolMetrics(players, games, picks, provisional)
  for (const groupKickoffs of [false, true]) for (const metric of ['earned', 'lost', 'potential', 'net']) {
    const data = weekProgressData(players, games, picks, { viewerId: 'a', provisional, groupKickoffs, metric })
    data.series.forEach((series, index) => {
      const row = totals[index]
      expect(series.values.at(-1)).toBe(metric === 'earned' ? row.points : metric === 'lost' ? row.pointsLost : metric === 'net' ? row.points - row.pointsLost : row.points + row.potential)
    })
  }
})

it('does not expose private future confidence or team through another player’s path', () => {
  const futureGames = games.map((game, index) => ({ ...game, status: 'scheduled', kickoff: `2099-01-0${index + 1}T18:00:00Z` }))
  const first = weekProgressData(players, futureGames, picks, { metric: 'potential', viewerId: 'b' })
  const changed = weekProgressData(players, futureGames, { ...picks, a: picks.a.map((pick) => ({ ...pick, team: 'PRIVATE', confidence: 5 - pick.confidence })) }, { metric: 'potential', viewerId: 'b' })
  expect(changed).toEqual(first)
  expect(first.series[0].values.at(-1)).toBe(15)
  expect(first.series[0].pointTitles[1]).toContain('Estimated allocation')
})

it('handles ties, absent picks, empty data and unknown kickoffs', () => {
  const tied = [{ ...games[2], homeScore: 7, awayScore: 7 }]
  expect(weekProgressData(players, tied, picks, { metric: 'earned' }).series.map((s) => s.values.at(-1))).toEqual([1, 4])
  expect(weekProgressData(players, tied, {}, { metric: 'lost' }).series[0].values).toEqual([0, 0])
  expect(weekProgressData(players, [], {}).series[0].values).toEqual([0])
  expect(weekProgressData(players, [{ ...games[0], kickoff: null }, { ...games[1], kickoff: null }], {}, { groupKickoffs: true }).labels).toHaveLength(3)
})

it('allows multiple lines and preserves remaining player colors when filtering', () => {
  render(<WeekProgressChart players={players} games={games} picksByUser={picks} weekLabel="Week 1" viewerId="a" />)
  const chart = screen.getByRole('img')
  expect(chart.querySelectorAll('polyline')).toHaveLength(2)
  const blairColor = chart.querySelectorAll('polyline')[1].getAttribute('stroke')
  fireEvent.click(screen.getByText('Players (2/2)'))
  fireEvent.click(screen.getByLabelText('Alex'))
  expect(chart.querySelectorAll('polyline')).toHaveLength(1)
  expect(chart.querySelector('polyline').getAttribute('stroke')).toBe(blairColor)
  fireEvent.change(screen.getByLabelText('Week progress display mode'), { target: { value: 'net' } })
  fireEvent.change(screen.getByLabelText('Week progress grouping'), { target: { value: 'kickoff' } })
  fireEvent.click(screen.getByText('All players'))
  expect(chart.querySelectorAll('polyline')).toHaveLength(2)
  fireEvent.click(screen.getByText('View chart data'))
  expect(screen.getByRole('table')).toHaveTextContent('A1 @ H1, A2 @ H2')
})


it('names kickoff windows using Eastern time across European daylight-saving changes', () => {
  for (const [kickoff, label] of [
    ['2026-10-30T00:15:00Z', 'TNF'],
    ['2026-11-01T18:00:00Z', 'Sunday early slate'],
    ['2026-11-01T21:25:00Z', 'Sunday late window'],
    ['2026-11-02T01:20:00Z', 'SNF'],
    ['2026-11-03T01:15:00Z', 'MNF'],
    ['2026-11-01T14:30:00Z', 'Sunday 09:30 ET'],
    ['2026-11-07T18:00:00Z', 'Saturday 13:00 ET'],
  ]) expect(kickoffGroupLabel({ kickoff })).toBe(label)
})

it('sorts by model confidence, preserves grouped endpoints and labels every game', () => {
  const sample = games.map((game, i) => ({ ...game, predictorHome: [.6, .9, .8, .7][i], homeMoneyline: [-110, -400, -200, -150][i], awayMoneyline: [100, 300, 180, 130][i] }))
  for (const order of ['predictor', 'moneyline', 'aggregate']) {
    const chronological = weekProgressData(players, sample, picks, { metric: 'potential', viewerId: 'a' })
    const sorted = weekProgressData(players, sample, picks, { order, metric: 'potential', viewerId: 'a' })
    expect(sorted.labels[1]).toBe('A2 @ H2')
    expect(sorted.series.map(s => s.values.at(-1))).toEqual(chronological.series.map(s => s.values.at(-1)))
    const ascending = weekProgressData(players, sample, picks, { order, ascending: true })
    expect(ascending.labels[1]).toBe('A3 @ H3')
    const grouped = weekProgressData(players, sample, picks, { order, metric: 'potential', viewerId: 'a', groupKickoffs: true })
    expect(grouped.series.map(s => s.values.at(-1))).toEqual(chronological.series.map(s => s.values.at(-1)))
    expect(grouped.details.some(detail => detail.includes('A1 @ H1, A2 @ H2'))).toBe(true)
  }
})

it('Dev ordering never depends on private future picks', () => {
  const future = games.map((game, i) => ({ ...game, kickoff: `2099-01-0${i+1}T18:00:00Z` }))
  const first = weekProgressData(players, future, picks, { order: 'dev', metric: 'potential', viewerId: 'b' })
  const changed = weekProgressData(players, future, { ...picks, a: picks.a.map(pick => ({ ...pick, confidence: 5 - pick.confidence, team: 'PRIVATE' })) }, { order: 'dev', metric: 'potential', viewerId: 'b' })
  expect(changed).toEqual(first)
})
