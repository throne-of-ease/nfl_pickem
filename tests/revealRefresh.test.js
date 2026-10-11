import { afterEach, expect, it, vi } from 'vitest'
import { clearSession, loadPool, refreshRevealedPicks } from '../src/api.js'
import { mergeRefreshedVisibility } from '../src/overview.jsx'

afterEach(() => {
  clearSession()
  localStorage.clear()
  vi.unstubAllGlobals()
})

const gameRow = ({ kickoff, locked = false } = {}) => ({
  id: 'g1',
  pool_key: 'week-05',
  kickoff,
  away_team: 'CHI',
  home_team: 'GB',
  status: 'scheduled',
  gotw: false,
  locked_at: locked ? kickoff : null,
})

it('syncs a live flexed game before reloading the picks that are now allowed to be revealed', async () => {
  globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
  globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
  const futureKickoff = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
  const actualKickoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  let seasonLoads = 0
  const calls = []

  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    calls.push([url, options])
    if (url.endsWith('/rest/v1/rpc/get_my_draft')) return { ok: true, json: async () => ({ draftRevision: 1, picks: [] }) }
    if (url.endsWith('/functions/v1/sync-season')) return { ok: true, json: async () => ({ synced: [{ key: 'week-05', games: 1 }] }) }
    if (url.endsWith('/rest/v1/rpc/get_season_data')) {
      seasonLoads += 1
      const revealed = seasonLoads > 1
      return { ok: true, json: async () => ({
        games: [gameRow({ kickoff: revealed ? actualKickoff : futureKickoff, locked: revealed })],
        profiles: [{ id: 'u1', name: 'One' }, { id: 'u2', name: 'Two' }],
        revealedPicks: revealed ? [{ userId: 'u2', gameId: 'g1', team: 'CHI', confidence: 7 }] : [],
        hiddenPickStatuses: revealed ? [] : [{ userId: 'u2', gameId: 'g1' }],
      }) }
    }
    throw new Error(`Unexpected request: ${url}`)
  }))

  await loadPool('week-05', 'player-access', { fetchEspn: false })
  const result = await refreshRevealedPicks('week-05', [{ id: 'g1', kickoff: actualKickoff, status: 'live', locked: false }])

  expect(calls.some(([url]) => url.endsWith('/functions/v1/sync-season'))).toBe(true)
  expect(result.picksByUser.u2).toEqual([{ gameId: 'g1', team: 'CHI', confidence: 7 }])
  expect(result.needsRetry).toBe(false)
})

it('does not expose a future saved pick while refreshing visibility', async () => {
  globalThis.__NFL_SUPABASE_URL = 'https://example.supabase.co'
  globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY = 'publishable'
  const futureKickoff = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
  const calls = []

  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    calls.push([url, options])
    if (url.endsWith('/rest/v1/rpc/get_my_draft')) return { ok: true, json: async () => ({ draftRevision: 1, picks: [] }) }
    if (url.endsWith('/rest/v1/rpc/get_season_data')) return { ok: true, json: async () => ({
      games: [gameRow({ kickoff: futureKickoff })],
      profiles: [{ id: 'u2', name: 'Two' }],
      revealedPicks: [],
      hiddenPickStatuses: [{ userId: 'u2', gameId: 'g1' }],
    }) }
    throw new Error(`Unexpected request: ${url}`)
  }))

  await loadPool('week-05', 'player-access', { fetchEspn: false })
  const result = await refreshRevealedPicks('week-05', [{ id: 'g1', kickoff: futureKickoff, status: 'scheduled', locked: false }])

  expect(calls.some(([url]) => url.endsWith('/functions/v1/sync-season'))).toBe(false)
  expect(result.picksByUser.u2).toEqual([{ gameId: 'g1', saved: true }])
})

it('replaces revealed placeholders while preserving the signed-in players future draft', () => {
  const games = [
    { id: 'g1', kickoff: '2026-10-11T17:00:00Z', status: 'live', locked: false },
    { id: 'g2', kickoff: '2099-10-11T17:00:00Z', status: 'scheduled', locked: false },
  ]
  const base = {
    u1: [{ gameId: 'g1', team: 'GB', confidence: 7 }, { gameId: 'g2', team: 'DET', confidence: 3 }],
    u2: [{ gameId: 'g1', saved: true }, { gameId: 'g2', saved: true }],
  }
  const refreshed = {
    u1: [{ gameId: 'g1', team: 'GB', confidence: 7 }, { gameId: 'g2', saved: true }],
    u2: [{ gameId: 'g1', team: 'CHI', confidence: 5 }, { gameId: 'g2', saved: true }],
  }

  const merged = mergeRefreshedVisibility(base, refreshed, games)

  expect(merged.u1).toContainEqual({ gameId: 'g1', team: 'GB', confidence: 7 })
  expect(merged.u1).toContainEqual({ gameId: 'g2', team: 'DET', confidence: 3 })
  expect(merged.u2).toContainEqual({ gameId: 'g1', team: 'CHI', confidence: 5 })
  expect(merged.u2).toContainEqual({ gameId: 'g2', saved: true })
})
