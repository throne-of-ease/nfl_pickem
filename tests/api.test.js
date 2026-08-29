import { afterEach, describe, expect, it } from 'vitest'
import { refreshLivePool } from '../src/api.js'

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
  it('fetches the current scoreboard and each game package without Supabase data', async () => {
    const requests = []
    const fetcher = async (url) => {
      requests.push(url)
      if (url.includes('scoreboard')) return { ok: true, json: async () => scoreboard }
      if (url.includes('game?')) return { ok: true, json: async () => summary }
      return { ok: false, json: async () => ({}) }
    }

    const result = await refreshLivePool('week-01', [{ id: 'g1', gotw: true, locked: true }], { fetcher })

    expect(requests.some((url) => url.includes('cdn.espn.com/core/nfl/scoreboard') && url.includes('week=1'))).toBe(true)
    expect(requests.some((url) => url.includes('cdn.espn.com/core/nfl/game') && url.includes('gameId=g1'))).toBe(true)
    expect(requests.every((url) => url.includes('_nfl_pickem='))).toBe(true)
    expect(result.games[0]).toMatchObject({ status: 'live', awayScore: 10, homeScore: 14, homeWinProbability: .72, awayWinProbability: .28, gotw: true, locked: true })
  })
})
