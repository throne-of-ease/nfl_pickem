import React from 'react'
import { expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { relativeGamePoints, RelativeGamePointsTable } from '../src/charts.jsx'

const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Blair' }, { id: 'c', name: 'Casey' }]
const game = { id: 'g', home: 'H', away: 'A', status: 'final', homeScore: 21, awayScore: 10 }
const games = { 'week-01': [game], 'week-02': [{ ...game, gotw: true, awayScore: 28 }] }
const picks = {
  a: { 'week-01': [{ gameId: 'g', team: 'H', confidence: 10 }], 'week-02': [{ gameId: 'g', team: 'H', confidence: 10 }] },
  b: { 'week-01': [{ gameId: 'g', team: 'A', confidence: 16 }], 'week-02': [{ gameId: 'g', team: 'A', confidence: 8 }] },
  c: { 'week-01': [{ gameId: 'g', team: 'H', confidence: 4 }] },
}
it('reflects wasted confidence when everyone picks the losing team, only when enabled', () => {
  const twoPlayers = players.slice(0, 2)
  const losingPicks = {
    a: { 'week-01': [{ gameId: 'g', team: 'A', confidence: 12 }] },
    b: { 'week-01': [{ gameId: 'g', team: 'A', confidence: 2 }] },
  }
  expect(relativeGamePoints(twoPlayers, games, losingPicks, null, ['week-01']).map((row) => row.difference)).toEqual([0, 0])
  const top = relativeGamePoints(twoPlayers, games, losingPicks, null, ['week-01'], 'top', 10, true)
  expect(top.map(({ playerId, points, mean, difference }) => ({ playerId, points, mean, difference }))).toEqual([
    { playerId: 'b', points: -2, mean: -12, difference: 10 },
    { playerId: 'a', points: -12, mean: -2, difference: -10 },
  ])
  expect(relativeGamePoints(twoPlayers, games, losingPicks, null, ['week-01'], 'bottom', 10, true)[0].playerId).toBe('a')
})
it('uses each pick’s outcome and GOTW stake, preserves ties, and excludes unfinished games in net mode', () => {
  const rows = relativeGamePoints(players, games, picks, 'a', Object.keys(games), 'top', 10, true)
  expect(rows.map(({ points, mean, difference }) => ({ points, mean, difference }))).toEqual([
    { points: 10, mean: -6, difference: 16 },
    { points: -15, mean: 6.5, difference: -21.5 },
  ])
  const mixed = { 'week-01': [{ ...game, homeScore: 10, gotw: true }, { ...game, id: 'live', status: 'live' }, { ...game, id: 'missing', homeScore: null }] }
  const tied = relativeGamePoints(players, mixed, picks, 'a', ['week-01'], 'top', 10, true)
  expect(tied).toHaveLength(1)
  expect(tied[0]).toMatchObject({ points: 15, mean: 15, difference: 0 })
  expect(relativeGamePoints(players, games, picks, 'c', ['week-02'], 'top', 10, true)[0]).toMatchObject({ points: 0, mean: -1, difference: 1 })
})
it('defaults to net points and restores the existing ranking when unchecked', () => {
  render(<RelativeGamePointsTable players={players} gamesByPool={games} picksByUser={picks} viewerId="a" poolKeys={Object.keys(games)} weekLabels={['W1', 'W2']} selectedPoolKey="week-01" />)
  const toggle = screen.getByRole('checkbox', { name: 'Include lost points' })
  expect(toggle).toBeChecked()
  expect(screen.getByRole('columnheader', { name: 'Net points' })).toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Top 10 games by net difference' })).toHaveTextContent('+16.0')
  fireEvent.change(screen.getByLabelText('Game points period'), { target: { value: 'season' } })
  fireEvent.change(screen.getByLabelText('Game points player'), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText('Game points ranking'), { target: { value: 'bottom25' } })
  const table = screen.getByRole('table', { name: 'Bottom 25 player-game results across all players by net difference' })
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('-23.0')
  fireEvent.click(toggle)
  expect(screen.getByRole('columnheader', { name: 'Points', exact: true })).toBeInTheDocument()
  expect(screen.getByRole('table')).toHaveTextContent('-7.0')
  fireEvent.click(toggle)
  expect(screen.getByRole('columnheader', { name: 'Net points' })).toBeInTheDocument()
})
it('scores opposite teams independently, excludes self, and counts missed picks as zero', () => {
  const rows = relativeGamePoints(players, games, picks, 'a', Object.keys(games))
  expect(rows.map(({ points, mean, difference }) => ({ points, mean, difference }))).toEqual([
    { points: 10, mean: 2, difference: 8 },
    { points: 0, mean: 6.5, difference: -6.5 },
  ])
  expect(relativeGamePoints(players, games, picks, 'a', Object.keys(games), 'bottom')[0].poolKey).toBe('week-02')
  expect(relativeGamePoints(players, games, picks, 'a', ['week-02'])).toHaveLength(1)
})
it('ranks each player against the mean of the other players in the all-player view', () => {
  const rows = relativeGamePoints(players, games, picks, null, ['week-01'])
  expect(rows.map(({ playerName, points, mean, difference }) => [playerName, points, mean, difference])).toEqual([
    ['Alex', 10, 2, 8],
    ['Casey', 4, 5, -1],
    ['Blair', 0, 7, -7],
  ])
})
it('handles ties, unfinished games, missing scores, and no opponents', () => {
  const mixed = { 'week-01': [{ ...game, homeScore: 10, gotw: true }, { ...game, id: 'live', status: 'live' }, { ...game, id: 'missing', homeScore: null }] }
  expect(relativeGamePoints(players, mixed, picks, 'a', ['week-01'])[0]).toMatchObject({ points: 15, mean: 15, difference: 0 })
  expect(relativeGamePoints([players[0]], games, picks, 'a', ['week-01'])).toEqual([])
})
it('limits to ten games and sorts by unrounded differences', () => {
  const many = { 'week-01': Array.from({ length: 12 }, (_, i) => ({ ...game, id: `g${i}` })) }
  const manyPicks = { a: { 'week-01': many['week-01'].map((g, i) => ({ gameId: g.id, team: 'H', confidence: i + 1 })) } }
  expect(relativeGamePoints(players, many, manyPicks, 'a', ['week-01']).map((r) => r.points)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
})
it('supports top and bottom 25 rankings', () => {
  const many = { 'week-01': Array.from({ length: 30 }, (_, i) => ({ ...game, id: `g${i}` })) }
  const manyPicks = Object.fromEntries(players.map((player, playerIndex) => [player.id, { 'week-01': many['week-01'].map((g, i) => ({ gameId: g.id, team: playerIndex === 1 ? 'A' : 'H', confidence: i + 1 })) }]))
  const top = relativeGamePoints(players, many, manyPicks, null, ['week-01'], 'top', 25)
  const bottom = relativeGamePoints(players, many, manyPicks, null, ['week-01'], 'bottom', 25)
  expect(top).toHaveLength(25)
  expect(bottom).toHaveLength(25)
  expect(top[0].difference).toBeGreaterThanOrEqual(top.at(-1).difference)
  expect(bottom[0].difference).toBeLessThanOrEqual(bottom.at(-1).difference)
})
it('defaults to the viewer and supports player, ranking, period, and week controls', () => {
  render(<RelativeGamePointsTable players={players} gamesByPool={games} picksByUser={picks} viewerId="b" poolKeys={Object.keys(games)} weekLabels={['W1', 'W2']} selectedPoolKey="week-01" />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include lost points' }))
  expect(screen.getByLabelText('Game points player')).toHaveValue('b')
  fireEvent.change(screen.getByLabelText('Game points player'), { target: { value: 'a' } })
  expect(screen.getByRole('table')).toHaveTextContent('+8.0')
  fireEvent.change(screen.getByLabelText('Game points week'), { target: { value: 'week-02' } })
  expect(screen.getByRole('table')).toHaveTextContent('-6.5')
  fireEvent.change(screen.getByLabelText('Game points period'), { target: { value: 'season' } })
  expect(screen.queryByLabelText('Game points week')).not.toBeInTheDocument()
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  fireEvent.change(screen.getByLabelText('Game points ranking'), { target: { value: 'bottom10' } })
  expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('-6.5')
})
it('renders difference before points and the other-player mean', () => {
  render(<RelativeGamePointsTable players={players} gamesByPool={games} picksByUser={picks} viewerId="a" poolKeys={Object.keys(games)} weekLabels={['W1', 'W2']} selectedPoolKey="week-01" />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include lost points' }))
  expect([...screen.getByRole('table').querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(['Rank', 'Week', 'Game', 'Pick', 'Difference', 'Points', 'Others’ mean'])
})
it('shows every player in the shared ranking and offers 25-row rankings', () => {
  render(<RelativeGamePointsTable players={players} gamesByPool={games} picksByUser={picks} viewerId="a" poolKeys={Object.keys(games)} weekLabels={['W1', 'W2']} selectedPoolKey="week-01" />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include lost points' }))
  fireEvent.change(screen.getByLabelText('Game points player'), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText('Game points ranking'), { target: { value: 'top25' } })
  expect(screen.getByRole('table', { name: 'Top 25 player-game results across all players by points difference' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Game points ranking'), { target: { value: 'bottom25' } })
  fireEvent.change(screen.getByLabelText('Game points period'), { target: { value: 'season' } })
  const table = screen.getByRole('table', { name: 'Bottom 25 player-game results across all players by points difference' })
  expect([...table.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(['Rank', 'Player', 'Week', 'Game', 'Pick', 'Difference', 'Points', 'Others’ mean'])
  expect(within(table).getAllByRole('row')).toHaveLength(7)
  expect(table).toHaveTextContent('Alex')
  expect(table).toHaveTextContent('Blair')
  expect(table).toHaveTextContent('Casey')
})
