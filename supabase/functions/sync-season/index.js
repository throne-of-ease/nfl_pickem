import { POOLS } from '../../../src/domain.js'
import { fetchEspnPool } from '../../../src/espnAdapter.js'

const json = (request, status, body) => {
  const origin = request.headers.get('origin')
  const allowedOrigin = Deno.env.get('APP_ALLOWED_ORIGIN') || origin || ''
  return new Response(status === 204 ? undefined : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': allowedOrigin,
      'access-control-allow-headers': 'authorization, apikey, content-type, x-cron-secret',
      'access-control-allow-methods': 'POST, OPTIONS',
      vary: 'Origin',
    },
  })
}

const config = () => ({
  url: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('APP_SUPABASE_PUBLISHABLE_KEY'),
  secretKey: Deno.env.get('APP_SUPABASE_SECRET_KEY'),
  cronSecret: Deno.env.get('APP_CRON_SECRET'),
  allowedOrigin: Deno.env.get('APP_ALLOWED_ORIGIN'),
})

async function supabase(path, { method = 'GET', body, token, service = false, headers = {} } = {}) {
  const settings = config()
  const key = service ? settings.secretKey : settings.publishableKey
  if (!settings.url || !key) throw new Error('SUPABASE_FUNCTION_CONFIGURATION_MISSING')
  const result = await fetch(`${settings.url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, ...(token && { authorization: `Bearer ${token}` }), 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await result.json().catch(() => null)
  if (!result.ok) throw Object.assign(new Error(data?.message ?? 'Supabase request failed'), { status: result.status, data })
  return data
}

async function authenticatedUser(token) {
  const settings = config()
  const result = await fetch(`${settings.url}/auth/v1/user`, { headers: { apikey: settings.publishableKey, authorization: `Bearer ${token}` } })
  if (!result.ok) throw new Error('UNAUTHORIZED')
  return result.json()
}

const poolByKey = (key) => POOLS.find((pool) => pool.key === key)

const activePoolKeys = async () => {
  const now = Date.now()
  const rows = await supabase('games?select=pool_key,kickoff,status&limit=1000', { service: true })
  return [...new Set((rows ?? []).filter((game) => {
    const kickoff = Date.parse(game.kickoff)
    return Number.isFinite(kickoff) && kickoff >= now - 12 * 60 * 60 * 1000 && kickoff <= now + 10 * 86400000 && ['scheduled', 'live'].includes(game.status)
  }).map((game) => game.pool_key))]
}

const pregameSnapshot = (game, capturedAt) => {
  const valid = Number.isFinite(game.predictorHome) || (Number.isFinite(game.homeMoneyline) && Number.isFinite(game.awayMoneyline))
  return valid ? { predictorHome: game.predictorHome ?? null, homeMoneyline: game.homeMoneyline ?? null, awayMoneyline: game.awayMoneyline ?? null, source: game.pregameSource ?? 'ESPN', capturedAt } : null
}

async function syncPool(pool) {
  const receivedAt = new Date()
  const { games } = await fetchEspnPool(pool, { signal: AbortSignal.timeout(12000) })
  if (!games.length) return { key: pool.key, games: 0, skipped: true }

  const existing = await supabase(`games?pool_key=eq.${encodeURIComponent(pool.key)}&select=id,locked_at,pregame_snapshot,gotw`, { service: true })
  const previous = new Map((existing ?? []).map((game) => [game.id, game]))
  const payload = games.map((game) => {
    const old = previous.get(game.id)
    const hasStarted = game.status !== 'scheduled' || new Date(game.kickoff) <= receivedAt
    return {
      id: game.id,
      pool_key: pool.key,
      kickoff: game.kickoff,
      away_team: game.away,
      home_team: game.home,
      status: game.status,
      away_score: game.awayScore,
      home_score: game.homeScore,
      period: game.period,
      display_clock: game.displayClock,
      status_detail: game.statusDetail,
      matchup_quality: game.matchupQuality,
      gotw: Boolean(old?.gotw || game.gotw),
      locked_at: old?.locked_at ?? (hasStarted ? receivedAt.toISOString() : null),
      predictor_home: game.predictorHome,
      home_moneyline: game.homeMoneyline,
      away_moneyline: game.awayMoneyline,
      pregame_snapshot: old?.pregame_snapshot ?? (hasStarted ? pregameSnapshot(game, receivedAt.toISOString()) : null),
    }
  })

  await supabase('rpc/sync_pool_service', {
    method: 'POST',
    service: true,
    body: {
      p_pool: { key: pool.key, label: pool.label, phase: pool.phase, espnSeason: pool.espnSeason, espnSeasonType: pool.espnSeasonType, espnWeek: pool.espnWeek, countsTowardSeason: pool.countsTowardSeason, acceptsLatePicks: Boolean(pool.acceptsLatePicks), updatedAt: receivedAt.toISOString() },
      p_games: payload,
    },
  })
  return { key: pool.key, games: payload.length, asOf: receivedAt.toISOString() }
}

export async function handler(request) {
  const settings = config()
  const origin = request.headers.get('origin')
  if (origin && settings.allowedOrigin && origin !== settings.allowedOrigin) return json(request, 403, { code: 'ORIGIN_NOT_ALLOWED' })
  if (request.method === 'OPTIONS') return json(request, 204, {})
  if (request.method !== 'POST') return json(request, 405, { code: 'METHOD_NOT_ALLOWED' })

  const cronAuthorized = Boolean(settings.cronSecret && request.headers.get('x-cron-secret') === settings.cronSecret)
  if (!cronAuthorized) {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return json(request, 401, { code: 'UNAUTHORIZED' })
    try { await authenticatedUser(token) } catch { return json(request, 401, { code: 'UNAUTHORIZED' }) }
  }

  try {
    const body = await request.json().catch(() => ({}))
    const requestedKey = body.pool
    if (requestedKey && !poolByKey(requestedKey)) return json(request, 404, { code: 'UNKNOWN_POOL' })
    const keys = requestedKey ? [requestedKey] : await activePoolKeys()
    const synced = []
    const failures = []
    for (const key of keys) {
      try { synced.push(await syncPool(poolByKey(key))) }
      catch (error) { failures.push({ key, code: error.message }) }
    }
    const status = failures.length && !synced.length ? 503 : 200
    return json(request, status, { synced, failures })
  } catch (error) {
    return json(request, 500, { code: error.message === 'SUPABASE_FUNCTION_CONFIGURATION_MISSING' ? error.message : 'SYNC_FAILED' })
  }
}

Deno.serve(handler)
