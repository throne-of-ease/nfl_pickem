import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GamesToWatch from '../src/GamesToWatch.jsx'
import { POOLS } from '../src/domain.js'

const final = { state: 'post', completed: true, name: 'STATUS_FINAL' }
const current = { id: '100', week: 11, day: 16, away: 'DAL', home: 'PHI', type: final }
const previous = { id: '101', week: 10, day: 9, away: 'DET', home: 'GB', type: final }
const history = [
  { id: '102', week: 9, day: 8, away: 'BUF', home: 'MIA', type: final },
  { id: '103', week: 9, day: 7, away: 'KC', home: 'DEN', type: final },
  { id: '104', week: 9, day: 6, away: 'NYJ', home: 'NE', type: final },
  { id: '105', week: 8, day: 5, away: 'BAL', home: 'CIN', type: final },
  { id: '106', week: 8, day: 4, away: 'LAR', home: 'SF', type: final },
]
const live = { id: '107', week: 11, day: 16, away: 'SEA', home: 'ARI', type: { state: 'in', completed: false, name: 'STATUS_IN_PROGRESS' } }
const canceled = { id: '108', week: 11, day: 16, away: 'IND', home: 'HOU', type: { state: 'post', completed: true, name: 'STATUS_CANCELED' } }
const date = (game) => `2026-11-${String(game.day).padStart(2, '0')}T17:00:00Z`

const competitors = (game) => [
  { homeAway: 'away', team: { abbreviation: game.away }, score: '19', winner: false, record: [{ type: 'total', summary: '5-4' }] },
  { homeAway: 'home', team: { abbreviation: game.home }, score: '78', winner: true, record: [{ type: 'total', summary: '4-5' }] },
]
const scoreboard = (game) => ({
  id: game.id, date: date(game), shortName: 'WinnerMarker 78-19', season: { year: 2026, type: 2 }, week: { number: game.week },
  status: { type: game.type }, competitions: [{ competitors: competitors(game) }],
})
const summary = (game) => {
  const volatility = Number(game.id.at(-1)) / 25
  const plays = [[1, '15:00', .5], [2, '7:00', .2 + volatility], [4, '5:00', .55], [4, '1:00', .2 + volatility], [4, '0:00', 1]]
  return {
    header: { competitions: [{ competitors: competitors(game), status: { type: game.type } }] },
    drives: { previous: [{ plays: plays.map(([number, displayValue], index) => ({ id: String(index), period: { number }, clock: { displayValue }, text: 'WinnerMarker' })) }] },
    winprobability: plays.map(([, , homeWinPercentage], index) => ({ playId: String(index), homeWinPercentage })),
  }
}

function Harness({ weekly = [current, live], poolKey = 'week-11' }) {
  const [scope, setScope] = useState('week')
  const [weights, setWeights] = useState()
  return <GamesToWatch pool={POOLS.find(({ key }) => key === poolKey)} scope={scope} onScope={setScope} weights={weights} onWeights={setWeights}
    weekGames={weekly.map((game) => ({ ...game, kickoff: date(game), status: game.type === final ? 'final' : 'live', homeScore: 78, awayScore: 19 }))} />
}

function mockEspn(getSchedule, getSummary, getFpi = () => new Response(null, { status: 503 })) {
  vi.stubGlobal('fetch', vi.fn((url, { signal }) => {
    const query = new URL(url)
    if (query.pathname.endsWith('/powerindex')) return getFpi(query.searchParams.get('season'))
    return query.pathname.endsWith('/scoreboard') ? getSchedule(query) : getSummary(query.searchParams.get('event'), signal)
  }))
}
const json = (value) => new Response(JSON.stringify(value), { status: 200 })
const switchTo = (scope) => fireEvent.click(screen.getByRole('button', { name: scope }))
const progress = () => screen.getByRole('status')
const ranking = () => within(screen.getByRole('table'))

beforeEach(() => vi.spyOn(Date.prototype, 'getUTCFullYear').mockReturnValue(2026))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Games to Watch', () => {
  it('starts with weekly finals, progressively ranks the selected season, and reuses cached ratings', async () => {
    const calls = []
    const aborted = []
    let holding = true
    const events = [canceled, live, ...[current, previous, ...history].reverse()].map(scoreboard)
    const schedule = vi.fn(() => json({ events }))
    const teamFpi = Object.fromEntries(history.flatMap(({ home, away }) => [[home, 0], [away, 0]]))
    Object.assign(teamFpi, { DAL: 4, PHI: 2, DET: -4, GB: -2 })
    const fpi = vi.fn(() => json({ teams: Object.entries(teamFpi).map(([abbreviation, rating]) => ({
      team: { abbreviation }, categories: [{ name: 'fpi', values: [rating] }],
    })) }))
    mockEspn(schedule, (id, signal) => {
      calls.push(id)
      const game = [current, previous, ...history].find((event) => event.id === id)
      if (!holding || !history.includes(game)) return json(summary(game))
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
        aborted.push(id)
        reject(signal.reason)
      }, { once: true }))
    }, fpi)
    const view = render(<Harness />)
    expect(screen.getByRole('button', { name: 'Current Week' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByText('DAL @ PHI')
    expect(screen.getByText('DAL @ PHI').closest('tr').lastElementChild).toHaveTextContent('65.0')
    expect(fpi).toHaveBeenCalledWith('2026')
    expect(calls).toEqual([current.id])
    expect(schedule).not.toHaveBeenCalled()
    expect(screen.queryByText('SEA @ ARI')).not.toBeInTheDocument()
    expect(ranking().queryByRole('columnheader', { name: 'Week' })).not.toBeInTheDocument()
    view.rerender(<Harness poolKey="week-10" weekly={[previous]} />)
    await screen.findByText('DET @ GB')

    switchTo('Full Season')
    expect(screen.getByText('DAL @ PHI')).toBeInTheDocument()
    expect(screen.getByText('DET @ GB')).toBeInTheDocument()
    expect(screen.getByText('DET @ GB').closest('tr').lastElementChild).toHaveTextContent('35.0')
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 2 of 7 games · Rankings provisional'))
    expect(calls).toEqual(['100', '101', '102', '103', '104'])
    const swings = ranking().getByRole('button', { name: 'WP Swings' })
    fireEvent.click(swings)
    expect(swings.closest('th')).toHaveAttribute('aria-sort', 'descending')
    fireEvent.click(swings)
    expect(swings.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    const overall = () => [...screen.getByRole('table').querySelectorAll('.watch-overall')].map((cell) => Number(cell.textContent))
    const oldScores = overall()
    fireEvent.click(screen.getByText('Scoring Settings', { exact: true }))
    const weights = () => screen.getAllByRole('slider').map((slider) => slider.valueAsNumber)
    const setWeight = (component, value) => fireEvent.change(screen.getByRole('slider', { name: `${component} weight` }), { target: { value } })
    setWeight('Uncertainty', '50')
    expect(weights()).toEqual([50, 18, 25, 7])
    setWeight('Uncertainty', '100')
    expect(weights()).toEqual([100, 0, 0, 0])
    setWeight('Uncertainty', '50')
    expect(weights()).toEqual([50, 18, 25, 7])
    setWeight('Team Quality', '100')
    expect(weights()).toEqual([0, 0, 0, 100])
    expect(overall()).not.toEqual(oldScores)
    expect(calls).toHaveLength(5)

    switchTo('Current Week')
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 1 of 1 games'))
    expect(aborted).toEqual(['102', '103', '104'])
    expect(calls).toHaveLength(5)
    holding = false
    switchTo('Full Season')
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 7 of 7 games'))
    expect(progress()).not.toHaveTextContent('provisional')
    expect(screen.getByRole('slider', { name: 'Team Quality weight' })).toHaveValue('100')
    expect(overall()).toEqual(overall().sort((a, b) => b - a))
    expect(within(ranking().getByRole('row', { name: /LAR @ SF/ })).getAllByRole('cell')[0]).toHaveTextContent('8')
    expect(screen.getByRole('table')).not.toHaveTextContent(/78.?19|WinnerMarker|IND @ HOU|SEA @ ARI/)
    expect(ranking().queryByRole('link')).not.toBeInTheDocument()
    const storage = Object.values(localStorage).join(' ')
    expect(storage).not.toMatch(/winner|awayScore|homeScore|homeWinPercentage/i)

    const requestCount = calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default weights' }))
    expect(weights()).toEqual([30, 25, 35, 10])
    expect(overall().some((score) => score !== 50)).toBe(true)
    expect(calls).toHaveLength(requestCount)
    view.unmount()
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Current Week' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('DAL @ PHI')).toBeInTheDocument()
    switchTo('Full Season')
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 7 of 7 games'))
    expect(calls).toHaveLength(requestCount)
    expect(schedule).toHaveBeenCalledOnce()
    expect(fpi).toHaveBeenCalledOnce()

    const fpiCacheKey = Object.keys(localStorage).find((key) => key.endsWith(':fpi:2026'))
    const saved = JSON.parse(localStorage.getItem(fpiCacheKey))
    localStorage.setItem(fpiCacheKey, JSON.stringify({ ...saved, fetchedAt: 0 }))
    teamFpi.DET = 6
    switchTo('Current Week')
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 1 of 1 games'))
    switchTo('Full Season')
    await waitFor(() => expect(screen.getByText('DET @ GB').closest('tr').lastElementChild).toHaveTextContent('60.0'))
    expect(fpi).toHaveBeenCalledTimes(2)
    expect(calls).toHaveLength(requestCount)
  })

  it('keeps cached rows visible and retries a failed schedule, a rate limit, and missing WP data', async () => {
    const weekly = { ...current, id: '200' }
    const prior = { ...previous, id: '201' }
    const schedule = vi.fn()
      .mockReturnValueOnce(new Response(null, { status: 503 }))
      .mockReturnValue(json({ events: [weekly, prior].map(scoreboard) }))
    const historySummary = vi.fn()
      .mockReturnValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '1' } }))
      .mockReturnValueOnce(json({}))
      .mockReturnValue(json(summary(prior)))
    mockEspn(schedule, (id) => id === prior.id ? historySummary() : json(summary(weekly)))
    render(<Harness weekly={[weekly]} />)
    await screen.findByText('DAL @ PHI')
    expect(screen.getByText('DAL @ PHI').closest('tr').lastElementChild).toHaveTextContent('—')
    switchTo('Full Season')
    await waitFor(() => expect(progress()).toHaveTextContent('ESPN schedule unavailable'))
    expect(screen.getByText('DAL @ PHI')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 1 of 2 games · Rankings provisional · 1 unavailable'), { timeout: 2500 })
    expect(historySummary).toHaveBeenCalledTimes(2)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 2 of 2 games'))
    expect(historySummary).toHaveBeenCalledTimes(3)
    expect(schedule).toHaveBeenCalledTimes(2)
  })
})
