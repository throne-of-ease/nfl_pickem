import React from 'react'
import { expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CurrentWeekChart, TeamModelRelativeChart, currentWeekChartData, weeklyAxisTicks, naturalRange, teamBenchmarkRelativePoints, teamBenchmarkRelativeExposure } from '../src/charts.jsx'
import { poolMetrics } from '../src/domain.js'

const players = [{ id: 'p', name: 'Player' }, { id: 'b', name: 'Benchmark' }]
const game = (id, status, homeScore = 20, awayScore = 10) => ({ id, status, home: 'HOME', away: 'AWAY', homeScore, awayScore, gotw: true })
const games = { w: [game('f', 'final'), game('l', 'live'), game('t', 'in', 10, 10), game('s', 'scheduled')] }
const picks = Object.fromEntries(players.map((player) => [player.id, { w: games.w.map((g) => ({ gameId: g.id, team: player.id === 'p' ? 'HOME' : 'AWAY', confidence: 2 })) }]))
const args = [players, games, picks, 'p', 'player:b', ['w']]

it('includes live GOTW impact by default, keeps tied live impact neutral, and excludes scheduled games', () => {
  expect(teamBenchmarkRelativePoints(...args)).toMatchObject([{ name: 'HOME', value: 28, finalValue: 14, liveValue: 14, liveGames: 2, comparisons: 3, playerNet: 14, benchmarkNet: -14, outcomes: { Won: 1, Leading: 1, 'Live tied': 1 } }])
  expect(teamBenchmarkRelativePoints(...args, false)).toMatchObject([{ value: 14, liveGames: 0, comparisons: 1 }])
  const flipped = { w: [game('l', 'live', 7, 21)] }
  expect(teamBenchmarkRelativePoints(players, flipped, picks, 'p', 'player:b', ['w'])).toMatchObject([{ value: -14, outcomes: { Trailing: 1 } }])
})

it('tracks team results on both exposure sides and preserves zero-sum stakes', () => {
  const rows = teamBenchmarkRelativeExposure(...args)
  expect(rows).toMatchObject([
    { name: 'HOME', value: 42, finalValue: 14, liveValue: 28, outcomes: { Won: 1, Leading: 1, 'Live tied': 1 } },
    { name: 'AWAY', value: -42, outcomes: { Lost: 1, Trailing: 1, 'Live tied': 1 } },
  ])
  expect(rows.reduce((sum, row) => sum + row.value, 0)).toBe(0)
})

it('shows outlined live results for a selected week in both views and removes them with the live toggle', () => {
  render(<TeamModelRelativeChart players={players} gamesByPool={games} picksByUser={picks} viewerId="p" poolKeys={['w']} weekLabels={['W1']} />)
  fireEvent.change(screen.getByLabelText('Net points benchmark'), { target: { value: 'player:b' } })
  fireEvent.change(screen.getByLabelText('Net points vs benchmark week'), { target: { value: 'w' } })
  expect(screen.getByLabelText('Include live games')).toBeChecked()
  expect(screen.getByRole('img').querySelector('[data-live-bar="HOME"]')).toHaveAttribute('fill', 'none')
  expect(screen.getByRole('img').querySelector('[data-team-outcome="Leading"]')).not.toBeNull()
  fireEvent.change(screen.getByLabelText('Net points vs benchmark view'), { target: { value: 'exposure' } })
  expect(screen.getByRole('img').querySelectorAll('[data-live-bar]')).toHaveLength(2)
  expect(screen.getByRole('img').querySelector('[data-team-outcome="Trailing"]')).not.toBeNull()
  fireEvent.click(screen.getByLabelText('Include live games'))
  expect(screen.getByRole('img').querySelectorAll('[data-live-bar]')).toHaveLength(0)
  expect(screen.getByRole('img')).not.toHaveTextContent('LIVE')
})

it('shows actual losses and maximum possible losses using scoring stakes including GOTW', () => {
  const slate = [game('f', 'final'), game('s', 'scheduled')]
  const metrics = poolMetrics([players[1]], slate, { b: [{ gameId: 'f', team: 'AWAY', confidence: 1 }, { gameId: 's', team: 'HOME', confidence: 2 }] })
  render(<CurrentWeekChart current={metrics} />)
  fireEvent.change(screen.getByLabelText('Current week display mode'), { target: { value: 'points_lost' } })
  expect(screen.getByRole('img')).toHaveTextContent('-6.0')
  expect(screen.getByRole('img').querySelector('[data-potential="Benchmark"]')).toHaveTextContent('-13 P')
})

it('pads weekly data without forcing zero, including constant, negative, and empty data', () => {
  expect(naturalRange([60, 80, null])).toEqual({ min: 58, max: 82, span: 24 })
  expect(naturalRange([70, 70])).toEqual({ min: 69, max: 71, span: 2 })
  expect(naturalRange([-20, -10])).toEqual({ min: -21, max: -9, span: 12 })
  expect(naturalRange([])).toEqual({ min: -1, max: 1, span: 2 })
})

it('keeps all live stakes at risk in potential losses even when provisional scoring awards them', () => {
  const slate = [game('f', 'final'), game('l', 'live')]
  const picks = { p: [{ gameId: 'f', team: 'AWAY', confidence: 1 }, { gameId: 'l', team: 'HOME', confidence: 2 }] }
  for (const provisional of [false, true]) {
    expect(poolMetrics([players[0]], slate, picks, provisional)[0]).toMatchObject({ pointsLost: 6, potentialPointsLost: 13 })
  }
})

it('orders negative losses from smallest loss to largest and keeps potential negative', () => {
  expect(currentWeekChartData([
    { name: 'More', pointsLost: 20, potentialPointsLost: 30 },
    { name: 'None', pointsLost: 0, potentialPointsLost: 10 },
    { name: 'Less', pointsLost: 5, potentialPointsLost: 15 },
  ], 'points_lost')).toMatchObject([
    { name: 'None', value: 0, potential: -10 },
    { name: 'Less', value: -5, potential: -15 },
    { name: 'More', value: -20, potential: -30 },
  ])
})

it('uses whole-number weekly ticks around data without forcing zero', () => {
  for (const values of [[60, 80], [70, 70], [70.1, 70.6], [-12.5, -3], [], [0]]) {
    const ticks = weeklyAxisTicks(values)
    expect(ticks.every(Number.isInteger)).toBe(true)
    expect(new Set(ticks).size).toBe(ticks.length)
    if (values.length) {
      expect(ticks[0]).toBeLessThan(Math.min(...values))
      expect(ticks.at(-1)).toBeGreaterThan(Math.max(...values))
    }
  }
  expect(weeklyAxisTicks([70, 70])).toEqual([69, 70, 71])
})

it('shows compact completed records for all weeks and counts a team game once across players', () => {
  const all = teamBenchmarkRelativeExposure([...players, { id: 'c', name: 'Copy' }], games, { ...picks, c: picks.p }, null, 'player:b', ['w'])
  expect(all.find(row => row.name === 'HOME').outcomes.Won).toBe(1)
  render(<TeamModelRelativeChart players={players} gamesByPool={games} picksByUser={picks} viewerId="p" poolKeys={['w']} weekLabels={['W1']} />)
  fireEvent.change(screen.getByLabelText('Net points benchmark'), { target: { value: 'player:b' } })
  expect(screen.getByRole('img').querySelector('[data-team-label]')).toHaveTextContent('HOME (W:1/L:0)')
  expect(screen.getByRole('img').querySelector('[data-team-outcome]')).toBeNull()
  fireEvent.change(screen.getByLabelText('Net points vs benchmark week'), { target: { value: 'w' } })
  expect(screen.getByRole('img').querySelector('[data-team-label]')).toHaveTextContent(/^HOME$/)
  expect(screen.getByRole('img').querySelector('[data-live-outcome]')).not.toBeNull()
})
