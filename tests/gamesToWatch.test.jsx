import React, { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GamesToWatch from '../src/GamesToWatch.jsx'
import { POOLS } from '../src/domain.js'
import { cachedWatchRatings, calculateWatchComponents, excitementScore, watchRootingTeam, watchSeasonRival, watchTeamQuality } from '../src/watchRatings.js'

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

function Harness({ weekly = [current], poolKey = 'week-11' }) {
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
  it('refreshes live ratings through completion and only caches the final', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const early = summary(live)
    early.drives.current = { plays: early.drives.previous[0].plays.slice(0, 2) }
    early.drives.previous = []
    early.winprobability = early.winprobability.slice(0, 2)
    const later = summary(live)
    later.drives.previous[0].plays.pop()
    later.winprobability.pop()
    const fetchSummary = vi.fn()
      .mockImplementationOnce(() => json(early))
      .mockImplementationOnce(() => json(later))
      .mockImplementation(() => json(summary({ ...live, type: final })))
    mockEspn(() => json({ events: [scoreboard(live)] }), fetchSummary)
    const view = render(<Harness weekly={[live]} />)
    const cell = (index) => screen.getByText('SEA @ ARI').closest('tr').cells[index].textContent
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 1 of 1 games · 1 live'))
    expect(cell(4)).toBe('—')
    const earlySwings = cell(3)
    expect(cachedWatchRatings(2026, [live])).toEqual([])
    const tick = async () => {
      const [refresh] = timers.mock.calls.filter(([, delay]) => delay === 30_000).at(-1)
      await act(async () => { await refresh() })
    }
    await tick()
    expect(cell(3)).not.toBe(earlySwings)
    expect(cell(4)).not.toBe('—')
    await tick()
    expect(screen.queryByText('Live', { exact: true })).not.toBeInTheDocument()
    expect(cachedWatchRatings(2026, [live])).toHaveLength(1)
    view.unmount()
    render(<Harness weekly={[]} />)
    switchTo('Full Season')
    await waitFor(() => expect(progress()).toHaveTextContent('Analyzed 1 of 1 games'))
    expect(screen.queryByText('Live', { exact: true })).not.toBeInTheDocument()
    expect(fetchSummary).toHaveBeenCalledTimes(3)
  })

  it('uses overall standings order and picks the runner-up when the viewer leads', () => {
    const entry = (id, name, points, remaining) => ({ id, name, cumulative: [points], remaining: [remaining] })
    const users = [entry('low', 'A', 20, 40), entry('second', 'C', 30, 5),
      entry('first', 'B', 30, 5), entry('fpi', 'Model', 100, 0), entry('third', 'D', 30, 0)]
    const players = users.filter(({ id }) => id !== 'fpi')
    expect(watchSeasonRival({ users }, players, 'low')).toBe('first')
    expect(watchSeasonRival({ users }, players, 'first')).toBe('second')
    expect(watchSeasonRival(null, players, 'low')).toBeUndefined()
  })

  it('chooses the outcome that maximizes the viewer’s margin over rivals', () => {
    const game = { home: 'PHI', away: 'DAL' }
    const viewer = { team: 'PHI', confidence: 1 }
    const rivals = [{ team: 'PHI', confidence: 4 }, { team: 'DAL', confidence: 1 }]
    expect(watchRootingTeam(game, viewer, rivals, false)).toBe('DAL')
    expect(watchRootingTeam(game, viewer, rivals, true)).toBe('PHI')
    expect(watchRootingTeam(game, viewer, [viewer], false)).toBeNull()
    expect(watchRootingTeam(game, viewer, [], false)).toBeNull()
    expect(watchRootingTeam(game, null, rivals, false)).toBeNull()
  })

  it('uses game-clock weights, a smooth swings score, and available components only', () => {
    const scores = calculateWatchComponents(summary(current), current)
    const { uncertainty, suspense, swings } = scores
    expect(uncertainty).toBeCloseTo(100 * 2388 / 3600)
    expect(suspense).toBeCloseTo(80)
    expect(swings).toBeCloseTo(50.142, 2)
    const overtime = summary(current)
    overtime.winprobability.at(-1).homeWinPercentage = 0.5
    overtime.drives.previous[0].plays.push({ id: '5', period: { number: 5 }, clock: { displayValue: '9:00' } })
    overtime.winprobability.push({ playId: '5', homeWinPercentage: 1 })
    expect(calculateWatchComponents(overtime, current).suspense).toBeCloseTo(100 * 300 / 360)
    expect(watchTeamQuality(current, new Map([['DAL', 15], ['PHI', 10]]))).toBe(100)
    expect(watchTeamQuality(current, new Map([['DAL', -15], ['PHI', -10]]))).toBe(0)
    expect(excitementScore({ uncertainty: 40, swings: 80, suspense: 70, quality: null },
      { uncertainty: 30, swings: 25, suspense: 35, quality: 10 })).toBeCloseTo(5650 / 90)
  })

  it('converts uncapped cached scores and queues capped games for recalculation', () => {
    localStorage.setItem('nfl-pickem-watch-v1:rating:2026:180', JSON.stringify({
      game: { id: '180' }, components: { swings: 40, uncertainty: 72, suspense: 80 },
    }))
    localStorage.setItem('nfl-pickem-watch-v1:rating:2026:181', JSON.stringify({
      game: { id: '181' }, components: { swings: 100, uncertainty: 60, suspense: 90 },
    }))
    for (const rows of [cachedWatchRatings(2026), cachedWatchRatings(2026, [{ id: '180' }, { id: '181' }])]) {
      expect(rows).toHaveLength(1)
      expect(rows[0].components).toMatchObject({ uncertainty: 72, suspense: 80 })
      expect(rows[0].components.swings).toBeCloseTo(32.968)
    }
  })

  it('starts with weekly finals, progressively ranks the selected season, and reuses cached ratings', async () => {
    const calls = []
    const aborted = []
    let holding = true
    const events = [canceled, ...[current, previous, ...history].reverse()].map(scoreboard)
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
