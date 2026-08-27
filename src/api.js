const SESSION_KEY = 'nfl-pickem-session-v1'

async function request(path, options = {}) {
  const result = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } })
  const data = await result.json().catch(() => ({}))
  if (!result.ok) throw Object.assign(new Error(data.code ?? 'REQUEST_FAILED'), { status: result.status, code: data.code })
  return data
}

export async function authenticate(action, values) {
  const session = await request('/api/auth', { method: 'POST', body: JSON.stringify({ action, ...values }) })
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function restoreSession() {
  const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
  if (!saved?.refresh_token) return null
  try { return await authenticate('refresh', { refreshToken: saved.refresh_token }) }
  catch { localStorage.removeItem(SESSION_KEY); return null }
}

export function clearSession() { localStorage.removeItem(SESSION_KEY) }

export async function loadPool(poolKey, token) {
  const season = await request(`/api/season-data?pool=${encodeURIComponent(poolKey)}`, { headers: { authorization: `Bearer ${token}` } })
  const draft = await request(`/api/picks?pool=${encodeURIComponent(poolKey)}`, { headers: { authorization: `Bearer ${token}` } })
  const games = (season.games ?? []).map((game) => ({ id: game.id, poolKey: game.pool_key, kickoff: game.kickoff, away: game.away_team, home: game.home_team, status: game.status, awayScore: game.away_score ?? 0, homeScore: game.home_score ?? 0, gotw: game.gotw, locked: Boolean(game.locked_at), predictorHome: game.predictor_home, homeMoneyline: game.home_moneyline, awayMoneyline: game.away_moneyline }))
  const picksByUser = Object.fromEntries((season.profiles ?? []).map((profile) => [profile.id, []]))
  for (const pick of season.revealedPicks ?? []) (picksByUser[pick.userId] ??= []).push({ gameId: pick.gameId, team: pick.team, confidence: pick.confidence })
  return { games, users: season.profiles ?? [], picksByUser, draftRevision: draft.draftRevision ?? 0, ownPicks: draft.picks ?? [], asOf: season.asOf }
}

export const savePicks = (poolKey, token, expectedDraftRevision, picks) => request(`/api/picks?pool=${encodeURIComponent(poolKey)}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ expectedDraftRevision, picks }) })
