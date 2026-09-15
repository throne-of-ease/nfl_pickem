import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteAdminOverride, isCurrentPool, loadAdminGotwData, loadChartData, mergeGames, refreshEspnPool, refreshLivePool, resetAdminPassword, saveDivisionWinnerPicks, updateDisplayName, updatePassword } from '../src/api.js'
import { buildSeasonHistory } from '../src/domain.js'

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
  it('scores previous weeks from ESPN even when the database and historical cache still say scheduled', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const kickoff = new Date(Date.now() - 14 * 86400000).toISOString()
    const stored = { id: 'g1', pool_key: 'week-01', kickoff, away_team: 'PIT', home_team: 'BUF', status: 'scheduled', gotw: true, locked_at: kickoff }
    localStorage.setItem('nfl-pickem-espn-cache-v2:week-01', JSON.stringify({ asOf: kickoff, games: [{ id: 'g1', kickoff, status: 'scheduled' }] }))
    const finalScoreboard = structuredClone(scoreboard)
    finalScoreboard.content.sbData.events[0].date = kickoff
    finalScoreboard.content.sbData.events[0].status.type.state = 'post'
    const fetcher = vi.fn(async (url) => ({ ok: true, json: async () =>
      url.includes('get_chart_data') ? {
        profiles: [{ id: 'u1', name: 'Alex' }],
        games: [stored, { ...stored, id: 'g2', pool_key: 'week-02', kickoff: '2099-09-20T17:00:00Z', locked_at: null }],
        revealedPicks: [{ userId: 'u1', poolKey: 'week-01', gameId: 'g1', team: 'BUF', confidence: 1 }],
      } : url.includes('scoreboard') ? finalScoreboard : {} }))
    vi.stubGlobal('fetch', fetcher)
    const result = await loadChartData('player-access')
    expect(result.failedPools).toEqual([])
    expect(result.gamesByPool['week-01'][0]).toMatchObject({ status: 'final', homeScore: 14, awayScore: 10, gotw: true, locked: true })
    expect(buildSeasonHistory(result.users, result.gamesByPool, result.picksByUser).users[0]).toMatchObject({ cumulative: [6], correct: [1] })
    expect(mergeGames([{ id: 'g1', status: 'scheduled', gotw: true }], result.gamesByPool['week-01'])[0].status).toBe('final')
    expect(fetcher.mock.calls.filter(([url]) => url.includes('scoreboard'))).toHaveLength(1)
    await loadChartData('player-access')
    expect(fetcher.mock.calls.filter(([url]) => url.includes('scoreboard'))).toHaveLength(1)
  })

  it('reports unavailable historical scores instead of silently presenting complete season totals', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (!url.includes('get_chart_data')) throw new Error('offline')
      return { ok: true, json: async () => ({ profiles: [], games: [{ id: 'g1', pool_key: 'week-01', kickoff: '2020-09-01T17:00:00Z', status: 'scheduled' }] }) }
    }))
    expect((await loadChartData('player-access')).failedPools).toEqual(['week-01'])
  })

  it('only treats a slate inside its kickoff window as current', () => {
    const now = Date.parse('2026-08-29T12:00:00Z')
    expect(isCurrentPool([{ kickoff: '2026-08-29T00:00:00Z' }], now)).toBe(true)
    expect(isCurrentPool([{ kickoff: '2026-08-20T00:00:00Z' }], now)).toBe(false)
  })

  it('uses the admin reset RPC and authenticated self-service password update', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, options])
      return { ok: true, json: async () => ({ reset: true }) }
    }))

    await resetAdminPassword('admin-access', 'player-1', 'Nfl!7Temporary')
    await updatePassword('player-access', 'new-password')

    expect(calls[0][0]).toBe('https://example.supabase.co/rest/v1/rpc/admin_reset_password')
    expect(calls[0][1].headers.authorization).toBe('Bearer admin-access')
    expect(JSON.parse(calls[0][1].body)).toEqual({ p_user_id: 'player-1', p_temporary_password: 'Nfl!7Temporary' })
    expect(calls[1][0]).toBe('https://example.supabase.co/auth/v1/user')
    expect(calls[1][1].headers.authorization).toBe('Bearer player-access')
    expect(JSON.parse(calls[1][1].body)).toEqual({ password: 'new-password' })
  })

  it('uses the profile and override admin RPCs', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, options])
      return { ok: true, json: async () => ({ displayName: 'New Name', deleted: 7 }) }
    }))

    await updateDisplayName('player-access', 'New Name')
    await deleteAdminOverride('admin-access', 7)

    expect(calls[0][0]).toBe('https://example.supabase.co/rest/v1/rpc/update_my_display_name')
    expect(calls[0][1].headers.authorization).toBe('Bearer player-access')
    expect(JSON.parse(calls[0][1].body)).toEqual({ p_display_name: 'New Name' })
    expect(calls[1][0]).toBe('https://example.supabase.co/rest/v1/rpc/delete_admin_override')
    expect(JSON.parse(calls[1][1].body)).toEqual({ p_override_id: 7 })
  })

  it('sends authenticated division winner drafts to the deployed RPC contract', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, options])
      return { ok: true, json: async () => ({ draftRevision: 1, picks: { 'afc-east': 'BUF' } }) }
    }))

    await saveDivisionWinnerPicks('player-access', 0, { 'afc-east': 'BUF' })

    expect(calls[0][0]).toBe('https://example.supabase.co/rest/v1/rpc/replace_division_winner_picks')
    expect(calls[0][1].headers.authorization).toBe('Bearer player-access')
    expect(JSON.parse(calls[0][1].body)).toEqual({ p_expected_revision: 0, p_picks: { 'afc-east': 'BUF' } })
  })

  it('syncs an existing GOTW pool when stored quality is missing', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    let adminLoads = 0
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, options])
      if (url.endsWith('/rest/v1/rpc/get_admin_gotw_data')) {
        adminLoads += 1
        return { ok: true, json: async () => ({ games: [{ id: 'g1', pool_key: 'week-07', kickoff: '2026-10-24T17:00:00Z', away_team: 'A', home_team: 'B', status: 'scheduled', gotw: false, matchup_quality: adminLoads === 1 ? null : 91.2 }] }) }
      }
      return { ok: true, json: async () => ({ synced: [{ key: 'week-07', games: 1 }] }) }
    }))

    const result = await loadAdminGotwData('admin-access', 'week-07')

    expect(adminLoads).toBe(2)
    expect(calls.some(([url]) => url.endsWith('/functions/v1/sync-season'))).toBe(true)
    expect(JSON.parse(calls.find(([url]) => url.endsWith('/functions/v1/sync-season'))[1].body)).toEqual({ pool: 'week-07' })
    expect(result.games[0]).toMatchObject({ id: 'g1', matchupQuality: 91.2 })
  })

  it('uses the browser cache for older weeks until an explicit refresh is requested', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ content: { sbData: { events: [] } } }) }))
    const historical = [{ id: 'old', kickoff: '2026-08-01T00:00:00Z', status: 'final', away: 'A', home: 'B' }]
    const first = await refreshEspnPool('week-01', { serverGames: historical, serverAsOf: '2026-08-02T00:00:00Z', fetcher })
    const second = await refreshEspnPool('week-01', { serverGames: historical, forceRefresh: true, fetcher })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(first).toMatchObject({ games: historical, cached: true, cacheScope: 'historical' })
    expect(second).toMatchObject({ games: [], cached: false })
  })

  it('fetches the current scoreboard and each game package without Supabase data', async () => {
    const requests = []
    const fetcher = async (url) => {
      requests.push(url)
      if (url.includes('scoreboard')) return { ok: true, json: async () => scoreboard }
      if (url.includes('/summary?')) return { ok: true, json: async () => summary }
      return { ok: false, json: async () => ({}) }
    }

    const result = await refreshLivePool('week-01', [{ id: 'g1', kickoff: new Date(Date.now() - 30 * 60 * 1000).toISOString(), gotw: true, locked: true }], { fetcher })

    expect(requests.some((url) => url.includes('cdn.espn.com/core/nfl/scoreboard') && url.includes('week=1'))).toBe(true)
    expect(requests.some((url) => url.includes('site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary') && url.includes('event=g1'))).toBe(true)
    expect(requests.every((url) => url.includes('_nfl_pickem='))).toBe(true)
    expect(result.games[0]).toMatchObject({ status: 'live', awayScore: 10, homeScore: 14, homeWinProbability: .72, awayWinProbability: .28, gotw: true, locked: true })
  })

  it('does not let a delayed live response move the score or clock backward', async () => {
    const staleSummary = { header: { competitions: [{ status: { period: 2, displayClock: '0:24', type: { state: 'in', shortDetail: '0:24 - 2nd' } }, competitors: [
      { homeAway: 'home', score: '13', team: { abbreviation: 'BUF' } },
      { homeAway: 'away', score: '13', team: { abbreviation: 'PIT' } },
    ] }] }, winprobability: [{ homeWinPercentage: .5 }] }
    const fetcher = async (url) => {
      if (url.includes('scoreboard')) return { ok: true, json: async () => scoreboard }
      return { ok: true, json: async () => staleSummary }
    }
    const result = await refreshLivePool('week-01', [{ id: 'g1', away: 'PIT', home: 'BUF', status: 'live', awayScore: 13, homeScore: 13, period: 2, displayClock: '0:08' }], { currentWeek: true, fetcher })

    expect(result.games[0]).toMatchObject({ awayScore: 13, homeScore: 13, period: 2, displayClock: '0:08' })
  })

  it('force refreshes a historical slate and requests model data', async () => {
    const requests = []
    const fetcher = async (url) => {
      requests.push(url)
      if (url.includes('scoreboard')) return { ok: true, json: async () => scoreboard }
      return { ok: false, json: async () => ({}) }
    }
    const result = await refreshLivePool('week-01', [{ id: 'g1', kickoff: '2025-09-01T00:00:00Z', away: 'PIT', home: 'BUF' }], { currentWeek: false, forceRefresh: true, fetcher })

    expect(result.cached).toBe(false)
    expect(requests.some((url) => url.includes('powerindex'))).toBe(true)
    expect(result.games[0]).toMatchObject({ id: 'g1', status: 'live', away: 'PIT', home: 'BUF' })
  })
})
