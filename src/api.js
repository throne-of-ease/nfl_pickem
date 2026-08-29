import { POOLS } from './domain.js'
import { fetchEspnPool } from './espnAdapter.js'

const SESSION_KEY = 'nfl-pickem-session-v1'
const ESPN_CACHE_KEY = 'nfl-pickem-espn-cache-v2'

const configuration = () => ({
  url: import.meta.env.VITE_SUPABASE_URL || globalThis.__NFL_SUPABASE_URL || '',
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || globalThis.__NFL_SUPABASE_PUBLISHABLE_KEY || '',
})

const apiError = (code, status = 0) => Object.assign(new Error(code), { status, code })

const authEmail = (username) => `${username.toLowerCase()}@accounts.nfl-pickem.invalid`

async function request(path, options = {}) {
  const { url, key } = configuration()
  if (!url || !key) throw apiError('SUPABASE_CONFIGURATION_MISSING')
  const result = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { apikey: key, 'content-type': 'application/json', ...options.headers },
  })
  const data = await result.json().catch(() => ({}))
  if (!result.ok) {
    const message = data.code ?? data.error_code ?? data.msg ?? data.message
    const duplicate = /already|registered|exists/i.test(String(message ?? ''))
    const code = duplicate ? 'EMAIL_ALREADY_REGISTERED' : message || (result.status === 401 ? 'INVALID_LOGIN' : 'REQUEST_FAILED')
    throw apiError(String(code).toUpperCase().replaceAll(' ', '_'), result.status)
  }
  return data
}

const saveSession = (session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session))

export async function authenticate(action, values = {}) {
  if (action === 'refresh') {
    if (!values.refreshToken) throw apiError('INVALID_REFRESH_TOKEN', 401)
    const session = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: values.refreshToken }) })
    saveSession(session)
    return session
  }

  const username = values.username?.trim()
  const email = values.email?.trim()
  const password = values.password ?? ''
  const identifier = username || email
  if (!identifier || !password) throw apiError('USERNAME_AND_PASSWORD_REQUIRED', 400)
  if (action === 'register') {
    const displayName = values.displayName?.trim()
    if (!username || !/^[a-z0-9][a-z0-9_.-]{2,31}$/i.test(username) || !displayName || displayName.length > 40 || password.length < 8) throw apiError('INVALID_REGISTRATION', 422)
    const registration = await loadRegistrationStatus()
    if (!registration.registrationOpen) throw apiError('REGISTRATION_CLOSED', 403)
  }

  const path = action === 'register' ? '/auth/v1/signup' : action === 'login' ? '/auth/v1/token?grant_type=password' : null
  if (!path) throw apiError('UNKNOWN_ACTION', 400)
  const body = action === 'register'
    ? { email: authEmail(username), password, data: { display_name: values.displayName.trim(), username: username.toLowerCase(), contact_email: email || null } }
    : { email: username ? authEmail(username) : email, password }
  try {
    const session = await request(path, { method: 'POST', body: JSON.stringify(body) })
    saveSession(session)
    return session
  } catch (error) {
    if (error.status === 400 && action === 'login') throw apiError('INVALID_LOGIN', error.status)
    if (error.status === 400 && action === 'register') throw apiError(username ? 'USERNAME_ALREADY_REGISTERED' : 'EMAIL_ALREADY_REGISTERED', error.status)
    throw error
  }
}

export async function restoreSession() {
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') } catch { clearSession() }
  if (!saved?.refresh_token) return null
  try { return await authenticate('refresh', { refreshToken: saved.refresh_token }) }
  catch { clearSession(); return null }
}

export function clearSession() { localStorage.removeItem(SESSION_KEY) }

const bearer = (token) => ({ authorization: `Bearer ${token}` })

const loadSeason = (poolKey, token) => request('/rest/v1/rpc/get_season_data', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_pool_key: poolKey }) })
const loadDraft = (poolKey, token) => request('/rest/v1/rpc/get_my_draft', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_pool_key: poolKey }) })

const mapSeason = (season, draft) => {
  const games = (season?.games ?? []).map((game) => ({
    id: game.id,
    poolKey: game.pool_key,
    kickoff: game.kickoff,
    away: game.away_team,
    home: game.home_team,
    status: game.status,
    awayScore: game.away_score ?? 0,
    homeScore: game.home_score ?? 0,
    period: game.period ?? null,
    displayClock: game.display_clock ?? null,
    statusDetail: game.status_detail ?? null,
    gotw: game.gotw,
    locked: Boolean(game.locked_at),
    homeFpi: game.home_fpi ?? null,
    awayFpi: game.away_fpi ?? null,
    predictorHome: game.predictor_home,
    homeMoneyline: game.home_moneyline,
    awayMoneyline: game.away_moneyline,
    matchupQuality: game.matchup_quality ?? null,
  }))
  const users = season?.profiles ?? []
  const picksByUser = Object.fromEntries(users.map((profile) => [profile.id, []]))
  for (const pick of season?.revealedPicks ?? []) (picksByUser[pick.userId] ??= []).push({ gameId: pick.gameId, team: pick.team, confidence: pick.confidence })
  return { games, users, picksByUser, viewer: season?.viewer ?? null, registrationOpen: season?.registrationOpen ?? true, draftRevision: draft?.draftRevision ?? 0, ownPicks: draft?.picks ?? [], asOf: season?.asOf }
}

const readEspnCache = (poolKey) => {
  try { return JSON.parse(localStorage.getItem(`${ESPN_CACHE_KEY}:${poolKey}`) ?? 'null') } catch { return null }
}

const writeEspnCache = (poolKey, value) => {
  try { localStorage.setItem(`${ESPN_CACHE_KEY}:${poolKey}`, JSON.stringify(value)) } catch { /* cache is an optimization */ }
}

const CURRENT_POOL_PADDING = 36 * 60 * 60 * 1000

export function isCurrentPool(games = [], now = Date.now()) {
  const kickoffs = games.map((game) => Date.parse(game.kickoff)).filter(Number.isFinite)
  if (!kickoffs.length) return false
  return now >= Math.min(...kickoffs) - CURRENT_POOL_PADDING && now <= Math.max(...kickoffs) + CURRENT_POOL_PADDING
}

export async function refreshEspnPool(poolKey, { forceRefresh = false, serverGames = [], serverAsOf = null, currentWeek = null, fetcher = fetch, signal, includeFpi = true } = {}) {
  const pool = POOLS.find((item) => item.key === poolKey)
  if (!pool) throw apiError('UNKNOWN_POOL', 404)
  const cached = readEspnCache(poolKey)
  const current = currentWeek ?? isCurrentPool([...serverGames, ...(cached?.games ?? [])])
  if (!current && !forceRefresh) {
    if (cached?.games?.length) return { ...cached, cached: true, freshness: 'cached', cacheScope: 'historical' }
    if (serverGames.length) {
      const value = { games: serverGames, asOf: serverAsOf ?? new Date().toISOString(), source: 'Supabase schedule cache', cached: true, freshness: 'cached', cacheScope: 'historical' }
      writeEspnCache(poolKey, value)
      return value
    }
    return { games: [], asOf: serverAsOf ?? new Date().toISOString(), source: 'historical cache miss', cached: true, freshness: 'cached', cacheScope: 'historical' }
  }
  const maxAge = 2 * 60 * 1000
  if (!forceRefresh && cached?.games?.length && Date.now() - Date.parse(cached.asOf) < maxAge) return { ...cached, cached: true, freshness: 'cached', cacheScope: 'current' }
  const fresh = await fetchEspnPool(pool, { fetcher, signal, includeFpi })
  const value = { ...fresh, cached: false }
  writeEspnCache(poolKey, value)
  return value
}

const mergeGames = (serverGames, espnGames) => {
  const live = new Map(espnGames.map((game) => [game.id, game]))
  const merged = serverGames.map((game) => ({ ...game, ...(live.get(game.id) ?? {}), gotw: Boolean(game.gotw), locked: Boolean(game.locked) }))
  const known = new Set(serverGames.map((game) => game.id))
  return [...merged, ...espnGames.filter((game) => !known.has(game.id))]
}

export async function refreshLivePool(poolKey, previousGames = [], { currentWeek = null, forceRefresh = false, signal, fetcher = fetch } = {}) {
  const current = currentWeek ?? isCurrentPool(previousGames)
  const espn = await refreshEspnPool(poolKey, { forceRefresh: current || forceRefresh, currentWeek: current, serverGames: previousGames, fetcher, signal, includeFpi: forceRefresh })
  return { ...espn, games: mergeGames(previousGames, espn.games), asOf: espn.asOf, espnAsOf: espn.asOf }
}

export async function loadRegistrationStatus() {
  return request('/rest/v1/rpc/get_registration_status', { method: 'POST' })
}

export async function loadPool(poolKey, token, { forceRefresh = false, fetchEspn = true, signal } = {}) {
  const [season, draft] = await Promise.all([loadSeason(poolKey, token), loadDraft(poolKey, token)])
  const mapped = mapSeason(season, draft)
  if (!fetchEspn) return mapped
  try {
    const espn = await refreshEspnPool(poolKey, { forceRefresh, serverGames: mapped.games, serverAsOf: mapped.asOf, signal })
    return { ...mapped, games: mergeGames(mapped.games, espn.games), asOf: espn.asOf, espnAsOf: espn.asOf, espnCached: espn.cached, espnSource: espn.source }
  } catch {
    return mapped
  }
}

export const savePicks = (poolKey, token, expectedDraftRevision, picks) => request('/rest/v1/rpc/replace_picks', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_pool_key: poolKey, p_expected_revision: expectedDraftRevision, p_picks: picks }) })

const mapGame = (game) => ({ id: game.id, poolKey: game.pool_key, kickoff: game.kickoff, away: game.away_team, home: game.home_team, status: game.status, awayScore: game.away_score ?? 0, homeScore: game.home_score ?? 0, period: game.period ?? null, displayClock: game.display_clock ?? null, statusDetail: game.status_detail ?? null, gotw: Boolean(game.gotw), locked: Boolean(game.locked_at), homeFpi: game.home_fpi ?? null, awayFpi: game.away_fpi ?? null, predictorHome: game.predictor_home, homeMoneyline: game.home_moneyline, awayMoneyline: game.away_moneyline, matchupQuality: game.matchup_quality ?? null })

export async function loadAdminData(poolKey, token) {
  const data = await request('/rest/v1/rpc/get_admin_data', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_pool_key: poolKey }) })
  const players = data?.players ?? []
  const picksByUser = Object.fromEntries(players.map((player) => [player.id, []]))
  for (const pick of data?.picks ?? []) (picksByUser[pick.userId] ??= []).push({ gameId: pick.gameId, team: pick.team, confidence: pick.confidence })
  return { ...data, players, games: (data?.games ?? []).map(mapGame), picksByUser }
}

const syncPool = (poolKey, token) => request('/functions/v1/sync-season', { method: 'POST', headers: bearer(token), body: JSON.stringify({ pool: poolKey }), signal: AbortSignal.timeout?.(15000) })

export async function loadAdminGotwData(token, poolKey) {
  const load = () => request('/rest/v1/rpc/get_admin_gotw_data', { method: 'POST', headers: bearer(token), body: '{}' })
  let data = await load()
  if (poolKey && !(data?.games ?? []).some((game) => game.pool_key === poolKey)) {
    try { await syncPool(poolKey, token); data = await load() } catch { /* the existing slate is still useful */ }
  }
  return { games: (data?.games ?? []).map(mapGame) }
}

export const deleteAdminPlayer = (token, userId) => request('/rest/v1/rpc/admin_delete_player', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_user_id: userId }) })

export const setRegistrationOpen = (token, registrationOpen) => request('/rest/v1/rpc/set_registration_open', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_open: registrationOpen }) })

export const saveAdminPicks = (poolKey, token, userId, picks) => request('/rest/v1/rpc/admin_replace_picks', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_user_id: userId, p_pool_key: poolKey, p_picks: picks }) })

export const setGameOfWeek = (token, poolKey, gameId) => request('/rest/v1/rpc/set_game_of_week', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_pool_key: poolKey, p_game_id: gameId || null }) })

export const resetAdminPassword = (token, userId, temporaryPassword) => request('/rest/v1/rpc/admin_reset_password', { method: 'POST', headers: bearer(token), body: JSON.stringify({ p_user_id: userId, p_temporary_password: temporaryPassword }) })

export const updatePassword = (token, password) => {
  if (!password || password.length < 8) throw apiError('INVALID_PASSWORD', 422)
  return request('/auth/v1/user', { method: 'PUT', headers: bearer(token), body: JSON.stringify({ password }) })
}

export async function loadChartData(token) {
  const data = await request('/rest/v1/rpc/get_chart_data', { method: 'POST', headers: bearer(token), body: '{}' })
  const users = data?.profiles ?? []
  const gamesByPool = {}
  for (const game of data?.games ?? []) (gamesByPool[game.pool_key] ??= []).push(mapGame(game))
  const picksByUser = Object.fromEntries(users.map((user) => [user.id, {}]))
  for (const pick of data?.revealedPicks ?? []) {
    const userPicks = (picksByUser[pick.userId] ??= {})
    if (!userPicks[pick.poolKey]) userPicks[pick.poolKey] = []
    userPicks[pick.poolKey].push({ gameId: pick.gameId, team: pick.team, confidence: pick.confidence })
  }
  return { users, gamesByPool, picksByUser }
}
