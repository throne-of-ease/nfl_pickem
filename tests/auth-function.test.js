import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticate, clearSession, loadPool, refreshEspnPool, savePicks } from '../src/api.js'

describe('direct Supabase authentication', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearSession()
    delete globalThis.__NFL_SUPABASE_URL
    delete globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY
  })

  it('registers through Supabase Auth with browser-safe credentials and metadata', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, options?.body ? JSON.parse(options.body) : null, options?.headers])
      if (url.endsWith('/get_registration_status')) return { ok: true, json: async () => ({ registrationOpen: true }) }
      return { ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh', user: { id: 'user-1' } }) }
    }))

    const result = await authenticate('register', { username: 'Pat', email: '', password: 'long-enough', displayName: 'Pat' })
    expect(result).toMatchObject({ access_token: 'access', user: { id: 'user-1' } })
    expect(calls[1][0]).toBe('https://example.supabase.co/auth/v1/signup')
    expect(calls[1][1]).toEqual({ email: 'pat@accounts.nfl-pickem.invalid', password: 'long-enough', data: { display_name: 'Pat', username: 'pat', contact_email: null } })
    expect(calls[1][2]).toMatchObject({ apikey: 'publishable' })
    expect(calls[1][2]).not.toHaveProperty('authorization')
    expect(JSON.parse(localStorage.getItem('nfl-pickem-session-v1'))).toMatchObject({ refresh_token: 'refresh' })
  })

  it('maps Supabase duplicate registration and login errors to app codes', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/get_registration_status')) return { ok: true, json: async () => ({ registrationOpen: true }) }
      return { ok: false, status: 400, json: async () => ({ msg: url.includes('signup') ? 'User already registered' : 'Invalid login credentials' }) }
    }))
    await expect(authenticate('register', { username: 'pat', password: 'long-enough', displayName: 'Pat' })).rejects.toMatchObject({ code: 'USERNAME_ALREADY_REGISTERED', status: 400 })
    await expect(authenticate('login', { username: 'pat', password: 'wrong-pass' })).rejects.toMatchObject({ code: 'INVALID_LOGIN', status: 400 })
  })

  it('loads season data and drafts directly from authenticated RPCs without sync calls', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, options])
      if (url.endsWith('/get_season_data')) return { ok: true, json: async () => ({ games: [{ id: 'g1', pool_key: 'week-01', kickoff: '2026-09-01T00:00:00Z', away_team: 'A', home_team: 'B', status: 'scheduled', locked_at: null }], profiles: [{ id: 'u1', name: 'Pat' }], revealedPicks: [], asOf: '2026-08-28T00:00:00Z' }) }
      return { ok: true, json: async () => ({ draftRevision: 3, picks: [{ gameId: 'g1', team: null, confidence: 1 }] }) }
    }))
    const result = await loadPool('week-01', 'access', { fetchEspn: false })
    expect(result).toMatchObject({ draftRevision: 3, users: [{ id: 'u1', name: 'Pat' }], games: [{ id: 'g1', away: 'A', home: 'B' }] })
    expect(calls).toHaveLength(2)
    expect(calls.every(([url]) => url.includes('/rest/v1/rpc/'))).toBe(true)
    expect(calls.every(([, options]) => options.headers.authorization === 'Bearer access')).toBe(true)
  })

  it('writes picks through the authenticated replace_picks RPC', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    let call
    vi.stubGlobal('fetch', vi.fn(async (url, options) => { call = [url, options]; return { ok: true, json: async () => ({ draftRevision: 4, picks: [] }) } }))
    await expect(savePicks('week-01', 'access', 3, [{ gameId: 'g1', team: 'A', confidence: 1 }])).resolves.toMatchObject({ draftRevision: 4 })
    expect(call[0]).toBe('https://example.supabase.co/rest/v1/rpc/replace_picks')
    expect(JSON.parse(call[1].body)).toEqual({ p_pool_key: 'week-01', p_expected_revision: 3, p_picks: [{ gameId: 'g1', team: 'A', confidence: 1 }] })
  })

  it('caches non-current browser ESPN pools and never calls a Supabase sync endpoint', async () => {
    globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
    globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ content: { sbData: { events: [{ id: 'g1', date: '2025-09-01T00:00:00Z', status: { type: { state: 'post' } }, competitions: [{ competitors: [{ homeAway: 'away', team: { abbreviation: 'A' }, score: '7' }, { homeAway: 'home', team: { abbreviation: 'B' }, score: '3' }] }] }] } } }) }))
    const serverGames = [{ id: 'g1', kickoff: '2025-09-01T00:00:00Z', status: 'final', away: 'A', home: 'B', awayScore: 7, homeScore: 3 }]
    await refreshEspnPool('week-01', { serverGames, serverAsOf: '2025-09-02T00:00:00Z', fetcher })
    await refreshEspnPool('week-01', { serverGames, forceRefresh: true, fetcher })
    expect(fetcher).not.toHaveBeenCalled()
    expect(fetcher.mock.calls.every(([url]) => !url.includes('/functions/v1/sync-season'))).toBe(true)
  })
})
