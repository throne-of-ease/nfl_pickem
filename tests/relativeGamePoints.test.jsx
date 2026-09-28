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
it('scores opposite teams independently, excludes self, and counts missed picks as zero', () => {
  const rows = relativeGamePoints(players, games, picks, 'a', Object.keys(games))
  expect(rows.map(({ points, mean, difference }) => ({ points, mean, difference }))).toEqual([
    { points: 10, mean: 2, difference: 8 },
    { points: 0, mean: 6.5, difference: -6.5 },
  ])
  expect(relativeGamePoints(players, games, picks, 'a', Object.keys(games), 'bottom')[0].poolKey).toBe('week-02')
  expect(relativeGamePoints(players, games, picks, 'a', ['week-02'])).toHaveLength(1)
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
it('defaults to the viewer and supports player, ranking, period, and week controls', () => {
  render(<RelativeGamePointsTable players={players} gamesByPool={games} picksByUser={picks} viewerId="b" poolKeys={Object.keys(games)} weekLabels={['W1', 'W2']} selectedPoolKey="week-01" />)
  expect(screen.getByLabelText('Game points player')).toHaveValue('b')
  fireEvent.change(screen.getByLabelText('Game points player'), { target: { value: 'a' } })
  expect(screen.getByRole('table')).toHaveTextContent('+8.0')
  fireEvent.change(screen.getByLabelText('Game points week'), { target: { value: 'week-02' } })
  expect(screen.getByRole('table')).toHaveTextContent('-6.5')
  fireEvent.change(screen.getByLabelText('Game points period'), { target: { value: 'season' } })
  expect(screen.queryByLabelText('Game points week')).not.toBeInTheDocument()
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  fireEvent.change(screen.getByLabelText('Game points ranking'), { target: { value: 'bottom' } })
  expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('-6.5')
})
