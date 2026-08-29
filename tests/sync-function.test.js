import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest'

let handler

beforeAll(async () => {
  const values = {
    SUPABASE_URL: 'https://example.supabase.co',
    APP_SUPABASE_PUBLISHABLE_KEY: 'publishable',
    APP_SUPABASE_SECRET_KEY: 'secret',
    APP_CRON_SECRET: 'cron-secret',
    APP_ALLOWED_ORIGIN: 'https://throne-of-ease.github.io',
  }
  globalThis.Deno = { env: { get: (name) => values[name] }, serve: (entrypoint) => { handler = entrypoint } }
  await import('../supabase/functions/sync-season/index.js')
})

afterEach(() => vi.unstubAllGlobals())
afterAll(() => { delete globalThis.Deno })

describe('sync-season Edge Function', () => {
  it('handles browser preflight and rejects unauthenticated calls', async () => {
    const options = await handler(new Request('https://example.supabase.co/functions/v1/sync-season', { method: 'OPTIONS', headers: { origin: 'https://throne-of-ease.github.io' } }))
    expect(options.status).toBe(204)
    const unauthorized = await handler(new Request('https://example.supabase.co/functions/v1/sync-season', { method: 'POST', headers: { origin: 'https://throne-of-ease.github.io' }, body: '{}' }))
    expect(unauthorized.status).toBe(401)
    await expect(unauthorized.json()).resolves.toEqual({ code: 'UNAUTHORIZED' })
  })

  it('syncs a requested pool with the service key and keeps existing lock metadata', async () => {
    const scoreboard = { content: { sbData: { events: [{ id: '401', date: '2026-08-21T00:00Z', status: { type: { state: 'post' } }, competitions: [{ competitors: [
      { homeAway: 'home', score: '20', team: { abbreviation: 'HOU' } },
      { homeAway: 'away', score: '22', team: { abbreviation: 'LV' } },
    ] }] }] } } }
    const summary = { gamepackageJSON: { pickcenter: [{ homeTeamOdds: { moneyLine: 114 }, awayTeamOdds: { moneyLine: -135 } }], winprobability: [{ homeWinPercentage: .5257 }] } }
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      calls.push([url, options])
      if (url.includes('/games?pool_key=')) return { ok: true, json: async () => [{ id: '401', locked_at: '2026-08-21T00:00:01Z', pregame_snapshot: { predictorHome: .52 }, gotw: true }] }
      if (url.includes('scoreboard')) return { ok: true, json: async () => scoreboard }
      if (url.includes('/game?')) return { ok: true, json: async () => summary }
      return { ok: true, json: async () => [] }
    }))
    const result = await handler(new Request('https://example.supabase.co/functions/v1/sync-season', {
      method: 'POST',
      headers: { origin: 'https://throne-of-ease.github.io', 'x-cron-secret': 'cron-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ pool: 'preseason-03' }),
    }))
    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toMatchObject({ synced: [{ key: 'preseason-03', games: 1 }], failures: [] })
    const gameWrite = calls.find(([url]) => url.includes('/rest/v1/rpc/sync_pool_service'))
    expect(gameWrite[1].headers.apikey).toBe('secret')
    expect(JSON.parse(gameWrite[1].body).p_games[0]).toMatchObject({ locked_at: '2026-08-21T00:00:01Z', gotw: true, pregame_snapshot: { predictorHome: .52 } })
  })

  it('does not persist live score state through the explicit sync function', async () => {
    const scoreboard = { content: { sbData: { events: [{ id: '401', date: '2026-08-29T18:00Z', status: { period: 2, displayClock: '07:42', type: { state: 'in', shortDetail: '2nd 07:42' } }, competitions: [{ competitors: [
      { homeAway: 'home', score: '14', team: { abbreviation: 'HOU' } },
      { homeAway: 'away', score: '10', team: { abbreviation: 'LV' } },
    ] }] }] } } }
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      calls.push([url, options])
      if (url.includes('scoreboard')) return { ok: true, json: async () => scoreboard }
      if (url.includes('/game?')) return { ok: true, json: async () => ({}) }
      if (url.includes('/games?')) return { ok: true, json: async () => [] }
      return { ok: true, json: async () => [] }
    }))

    const result = await handler(new Request('https://example.supabase.co/functions/v1/sync-season', {
      method: 'POST',
      headers: { origin: 'https://throne-of-ease.github.io', 'x-cron-secret': 'cron-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ pool: 'preseason-03' }),
    }))
    expect(result.status).toBe(200)
    const gameWrite = calls.find(([url]) => url.includes('/rest/v1/rpc/sync_pool_service'))
    expect(JSON.parse(gameWrite[1].body).p_games[0]).toMatchObject({ status: 'scheduled', away_score: null, home_score: null, period: null, display_clock: null })
  })
})
