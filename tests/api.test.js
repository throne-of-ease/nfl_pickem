import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCurrentPool, refreshEspnPool, refreshLivePool } from '../src/api.js'

afterEach(() => localStorage.clear())

const scoreboard = {
  content: { sbData: { events: [{
    id: 'g1', date: '2026-09-10T00:00:00Z', status: { period: 2, displayClock: '09:00', type: { state: 'in', shortDetail: '2nd 09:00' } },
    competitions: [{ competitors: [
      { homeAway: 'home', score: '14', team: { abbreviation: 'BUF' } },
      { homeAway: 'away', score: '10', team: { abbreviation: 'PIT' } },
    ] }],
  }] } },
}

const summary = { gamepackageJSON: {
  winprobability: [{ homeWinPercentage: .46 }, { homeWinPercentage: .72 }],
  pickcenter: [{ homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 130 } }],
} }

describe('direct ESPN live refresh', () => {
  it('only treats a slate inside its kickoff window as current', () => {
    const now = Date.parse('2026-08-29T12:00:00Z')
    expect(isCurrentPool([{ kickoff: '2026-08-29T00:00:00Z' }], now)).toBe(true)
    expect(isCurrentPool([{ kickoff: '2026-08-20T00:00:00Z' }], now)).toBe(false)
  })

  it('uses the browser cache for older weeks, even when forced', async () => {
    const fetcher = vi.fn()
    const historical = [{ id: 'old', kickoff: '2026-08-01T00:00:00Z', status: 'final', away: 'A', home: 'B' }]
    const first = await refreshEspnPool('week-01', { serverGames: historical, serverAsOf: '2026-08-02T00:00:00Z', fetcher })
    const second = await refreshEspnPool('week-01', { serverGames: historical, forceRefresh: true, fetcher })

    expect(fetcher).not.toHaveBeenCalled()
    expect(first).toMatchObject({ games: historical, cached: true, cacheScope: 'historical' })
    expect(second).toMatchObject({ games: historical, cached: true, cacheScope: 'historical' })
  })

  it('fetches the current scoreboard and each game package without Supabase data', async () => {
    const requests = []
    const fetcher = async (url) => {
      requests.push(url)
      if (url.includes('scoreboard')) return { ok: true, json: async () => scoreboard }
      if (url.includes('game?')) return { ok: true, json: async () => summary }
      return { ok: false, json: async () => ({}) }
    }

    const result = await refreshLivePool('week-01', [{ id: 'g1', kickoff: new Date(Date.now() - 30 * 60 * 1000).toISOString(), gotw: true, locked: true }], { fetcher })

    expect(requests.some((url) => url.includes('cdn.espn.com/core/nfl/scoreboard') && url.includes('week=1'))).toBe(true)
    expect(requests.some((url) => url.includes('cdn.espn.com/core/nfl/game') && url.includes('gameId=g1'))).toBe(true)
    expect(requests.every((url) => url.includes('_nfl_pickem='))).toBe(true)
    expect(result.games[0]).toMatchObject({ status: 'live', awayScore: 10, homeScore: 14, homeWinProbability: .72, awayWinProbability: .28, gotw: true, locked: true })
  })
})
