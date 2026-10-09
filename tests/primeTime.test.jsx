import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PrimeTimeChart, primeTimeChartData } from '../src/charts.jsx'
import { primeTimeCategory } from '../src/time.js'

describe('prime-time kickoff groups', () => {
  it.each([
    ['2026-09-11T00:20:00Z', 'tnf'], // Thursday evening in EDT, Friday in Germany.
    ['2026-09-12T00:00:00Z', 'tnf'], // Friday evening.
    ['2024-12-25T18:00:00Z', 'tnf'], // Wednesday holiday game.
    ['2026-11-27T18:00:00Z', 'tnf'], // Friday afternoon special slot.
    ['2026-09-14T00:20:00Z', 'snf'],
    ['2026-11-02T01:20:00Z', 'snf'], // EST after US daylight-saving time ends.
    ['2026-10-26T00:20:00Z', 'snf'], // Europe and US DST differ this week.
    ['2026-09-14T23:00:00Z', 'mnf'], // Early Monday doubleheader game.
    ['2026-09-15T02:00:00Z', 'mnf'], // Late Monday doubleheader game.
    ['2026-09-13T17:00:00Z', null],
    ['2026-09-13T20:25:00Z', null],
    ['2026-09-14T17:00:00Z', null],
    ['2026-09-13T00:20:00Z', null], // Saturday evening is outside requested groups.
    [undefined, null], [null, null], ['', null], ['invalid', null],
  ])('classifies %s as %s using US Eastern time', (kickoff, category) => {
    expect(primeTimeCategory(kickoff)).toBe(category)
  })
})

const players = [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Blair' }, { id: 'c', name: 'Casey' }]
const game = (id, kickoff, extra = {}) => ({ id, kickoff, home: 'HOME', away: 'AWAY', status: 'final', homeScore: 20, awayScore: 10, ...extra })
const games = {
  'week-01': [
    game('thu', '2026-09-11T00:20:00Z', { gotw: true }),
    game('fri', '2026-09-12T00:00:00Z'),
    game('sun', '2026-09-14T00:20:00Z'),
    game('mon1', '2026-09-14T23:00:00Z'),
    game('mon2', '2026-09-15T02:00:00Z', { status: 'post', homeScore: 10 }), // Final tie.
    game('day', '2026-09-13T17:00:00Z'),
    game('live', '2026-09-14T00:30:00Z', { status: 'in' }),
    game('future', '2099-09-11T00:20:00Z', { status: 'scheduled' }),
  ],
  'week-02': [game('wed', '2024-12-25T18:00:00Z')],
}
const picks = {
  a: { 'week-01': games['week-01'].map((g, index) => ({ gameId: g.id, team: g.id === 'fri' ? 'AWAY' : 'HOME', confidence: index + 1 })), 'week-02': [{ gameId: 'wed', team: 'HOME', confidence: 2 }] },
  b: { 'week-01': [{ gameId: 'thu', team: 'AWAY', confidence: 1 }, { gameId: 'fri', team: 'HOME', confidence: 2 }] },
}

it('totals season earned points, GOTW bonuses and ties; losing, missed and unfinished picks earn zero', () => {
  const args = [players, games, picks]
  expect(primeTimeChartData(...args)).toEqual([{ name: 'Alex', colorIndex: 0, value: 20 }, { name: 'Blair', colorIndex: 1, value: 2 }, { name: 'Casey', colorIndex: 2, value: 0 }])
  expect(primeTimeChartData(...args, 'tnf')[0].value).toBe(8)
  expect(primeTimeChartData(...args, 'snf')[0].value).toBe(3)
  expect(primeTimeChartData(...args, 'mnf')[0].value).toBe(9)
  expect(primeTimeChartData(...args, 'all', ['week-01'])[0].value).toBe(18)
  expect(primeTimeChartData(...args, 'all', ['week-01', 'week-02'], true)[0].value).toBe(27)
  expect(primeTimeChartData(players, {}, {}, 'all', []).map(row => row.value)).toEqual([0, 0, 0])
})

it('defaults to all games, changes totals with each filter, and exposes the chart data', () => {
  const { rerender } = render(<PrimeTimeChart players={players} gamesByPool={games} picksByUser={picks} poolKeys={['week-01', 'week-02']} provisional={false} />)
  const filter = screen.getByLabelText('Prime-time games filter')
  expect(filter).toHaveValue('all')
  expect(within(filter).getAllByRole('option')).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'View chart data' }))
  const table = screen.getByRole('table', { name: 'Prime-time games points' })
  const alexPoints = () => within(table).getAllByRole('row')[1].lastChild.textContent
  expect(alexPoints()).toBe('20.0')
  for (const [category, total] of [['tnf', '8.0'], ['snf', '3.0'], ['mnf', '9.0']]) {
    fireEvent.change(filter, { target: { value: category } })
    expect(screen.getByRole('img', { name: `Prime-time games points, ${category}` })).toBeInTheDocument()
    expect(alexPoints()).toBe(total)
  }
  fireEvent.change(filter, { target: { value: 'snf' } })
  rerender(<PrimeTimeChart players={players} gamesByPool={games} picksByUser={picks} poolKeys={['week-01', 'week-02']} provisional />)
  expect(alexPoints()).toBe('10.0')
  expect(screen.getByRole('button', { name: 'Download chart as PNG' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Share chart as PNG' })).toBeInTheDocument()
})

it('subtracts losing stakes once, including GOTW, without charging missed or unfinished picks', () => {
  const net = primeTimeChartData(players, games, picks, 'all', Object.keys(games), false, { view: 'net' })
  expect(net.find(row => row.name === 'Alex')).toMatchObject({ value: 18, earned: 20, lost: 2, colorIndex: 0 })
  expect(net.find(row => row.name === 'Blair')).toMatchObject({ value: -4, earned: 2, lost: 6, colorIndex: 1 })
  expect(net.find(row => row.name === 'Casey')).toMatchObject({ value: 0, earned: 0, lost: 0 })
  expect(primeTimeChartData(players, games, picks, 'all', Object.keys(games), true, { view: 'net' }).find(row => row.name === 'Alex').value).toBe(25)
})

const modelGames = {
  'week-01': [
    game('day', '2026-09-13T17:00:00Z', { predictorHome: .95, homeMoneyline: -900, awayMoneyline: 800 }),
    game('tnf', '2026-09-11T00:20:00Z', { gotw: true, predictorHome: .8, homeMoneyline: 150, awayMoneyline: -180 }),
    game('snf', '2026-09-14T00:20:00Z', { predictorHome: .7, homeMoneyline: -150, awayMoneyline: 130 }),
    game('mnf', '2026-09-15T00:20:00Z', { predictorHome: .6, homeMoneyline: -400, awayMoneyline: 330, homeScore: 10, awayScore: 20 }),
  ],
}
const modelPlayer = [{ id: 'p', name: 'Player' }]
const modelPicks = { p: { 'week-01': [
  { gameId: 'tnf', team: 'HOME', confidence: 5 },
  { gameId: 'snf', team: 'AWAY', confidence: 1 },
  { gameId: 'mnf', team: 'HOME', confidence: 3 },
] } }

it.each([['predictor', -3, 2, 9], ['moneyline', 15, 17, -9], ['aggregate', 1, 4, 5]])('scores over/underweight impact against %s using full-week ranks before filtering', (benchmark, total, tnf, modelNet) => {
  const args = [modelPlayer, modelGames, modelPicks]
  const row = primeTimeChartData(...args, 'all', ['week-01'], false, { view: 'model', benchmark })[0]
  expect(row).toMatchObject({ value: total, earned: 10, lost: 4, modelNet, compared: 3 })
  expect(primeTimeChartData(...args, 'tnf', ['week-01'], false, { view: 'model', benchmark })[0].value).toBe(tnf)
  const categorySum = ['tnf', 'snf', 'mnf'].reduce((sum, category) => sum + primeTimeChartData(...args, category, ['week-01'], false, { view: 'model', benchmark })[0].value, 0)
  expect(categorySum).toBe(total)
})

it.each([
  ['HOME', 1, 20, 10, -2], ['HOME', 5, 20, 10, 2], ['AWAY', 1, 20, 10, -14],
  ['HOME', 1, 10, 20, 2], ['AWAY', 1, 10, 20, 14], ['AWAY', 1, 10, 10, -2],
])('handles same-side under/overweight, opposing GOTW picks and final ties: %s/%s', (team, confidence, homeScore, awayScore, expected) => {
  const slate = { 'week-01': modelGames['week-01'].map(g => g.id === 'tnf' ? { ...g, homeScore, awayScore } : g) }
  const submitted = { p: { 'week-01': [{ gameId: 'tnf', team, confidence }] } }
  expect(primeTimeChartData(modelPlayer, slate, submitted, 'tnf', ['week-01'], false, { view: 'model', benchmark: 'predictor' })[0]).toMatchObject({ value: expected, compared: 1 })
})

it('excludes unavailable models and missed picks from the model comparison, and follows live scoring', () => {
  expect(primeTimeChartData(modelPlayer, modelGames, {}, 'all', ['week-01'], false, { view: 'model' })[0]).toMatchObject({ value: 0, compared: 0 })
  const unavailable = { 'week-01': modelGames['week-01'].map(g => ({ ...g, predictorHome: null })) }
  expect(primeTimeChartData(modelPlayer, unavailable, modelPicks, 'all', ['week-01'], false, { view: 'model' })[0]).toMatchObject({ value: 0, compared: 0 })
  const live = { 'week-01': modelGames['week-01'].map(g => g.id === 'tnf' ? { ...g, status: 'live' } : g) }
  expect(primeTimeChartData(modelPlayer, live, modelPicks, 'tnf', ['week-01'], false, { view: 'model', benchmark: 'predictor' })[0]).toMatchObject({ value: 0, compared: 0 })
  expect(primeTimeChartData(modelPlayer, live, modelPicks, 'tnf', ['week-01'], true, { view: 'model', benchmark: 'predictor' })[0]).toMatchObject({ value: 2, compared: 1 })
})

it('switches between earned, net and model views, retaining the slot and selected model', () => {
  render(<PrimeTimeChart players={modelPlayer} gamesByPool={modelGames} picksByUser={modelPicks} poolKeys={['week-01']} />)
  const view = screen.getByLabelText('Prime-time games view')
  expect(view).toHaveValue('earned')
  expect(screen.queryByLabelText('Prime-time games model')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'View chart data' }))
  fireEvent.change(view, { target: { value: 'net' } })
  expect(screen.getByRole('img', { name: 'Prime-time games net points, all' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Lost' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Prime-time games filter'), { target: { value: 'tnf' } })
  fireEvent.change(view, { target: { value: 'model' } })
  const model = screen.getByLabelText('Prime-time games model')
  expect(model).toHaveValue('aggregate')
  expect(within(model).getAllByRole('option')).toHaveLength(3)
  fireEvent.change(model, { target: { value: 'moneyline' } })
  expect(screen.getByRole('img', { name: 'Prime-time games overweight/underweight net impact versus Moneyline, tnf' })).toHaveTextContent('17.0')
  expect(screen.getByRole('columnheader', { name: 'Model net' })).toBeInTheDocument()
  fireEvent.change(view, { target: { value: 'net' } })
  expect(screen.queryByLabelText('Prime-time games model')).not.toBeInTheDocument()
  fireEvent.change(view, { target: { value: 'model' } })
  expect(screen.getByLabelText('Prime-time games model')).toHaveValue('moneyline')
  expect(screen.getByLabelText('Prime-time games filter')).toHaveValue('tnf')
})
