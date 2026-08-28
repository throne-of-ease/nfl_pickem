import { freezePregameSnapshot } from './domain.js'

const STATUS = { pre: 'scheduled', in: 'live', post: 'final', scheduled: 'scheduled', live: 'live', final: 'final' }
const SCOREBOARD = 'https://cdn.espn.com/core/nfl/scoreboard?xhr=1'
const GAME = 'https://cdn.espn.com/core/nfl/game?xhr=1'
const FPI = 'https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex'

const finite = (value) => value === null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null

export function normalizeEvent(event) {
  const id = String(event?.id ?? '')
  const kickoff = new Date(event?.kickoff ?? event?.date)
  const statusInfo = typeof event?.status === 'object' ? event.status : {}
  const status = STATUS[statusInfo.type?.state ?? statusInfo.state ?? event?.status]
  if (!id || !status || Number.isNaN(kickoff.valueOf())) return null
  return {
    ...event,
    id,
    kickoff: kickoff.toISOString(),
    status,
    period: finite(statusInfo.period),
    displayClock: statusInfo.displayClock ?? statusInfo.type?.detail ?? null,
    statusDetail: statusInfo.type?.shortDetail ?? statusInfo.type?.detail ?? null,
  }
}

export function normalizeScoreboard(payload) {
  const events = payload?.content?.sbData?.events
  if (!Array.isArray(events)) throw new Error('ESPN returned an invalid scoreboard')
  return events.flatMap((event) => {
    const competition = event.competitions?.[0]
    const home = competition?.competitors?.find((team) => team.homeAway === 'home')
    const away = competition?.competitors?.find((team) => team.homeAway === 'away')
    const statusInfo = event.status ?? {}
    const status = STATUS[statusInfo.type?.state ?? statusInfo.state]
    if (!event.id || !competition || !home?.team?.abbreviation || !away?.team?.abbreviation || !status) return []
    return [{
      id: String(event.id),
      away: away.team.abbreviation,
      home: home.team.abbreviation,
      kickoff: new Date(event.date).toISOString(),
      status,
      awayScore: finite(away.score) ?? 0,
      homeScore: finite(home.score) ?? 0,
      period: finite(statusInfo.period),
      displayClock: statusInfo.displayClock ?? statusInfo.type?.detail ?? null,
      statusDetail: statusInfo.type?.shortDetail ?? statusInfo.type?.detail ?? null,
      homeWinProbability: null,
      predictorHome: null,
      homeMoneyline: null,
      awayMoneyline: null,
      matchupQuality: finite(event.matchupQuality ?? competition.matchupQuality),
      gotw: false,
      source: 'ESPN',
    }]
  })
}

export function addPregameData(game, payload) {
  const data = payload?.gamepackageJSON ?? payload ?? {}
  const odds = data.pickcenter?.find((item) => finite(item?.homeTeamOdds?.moneyLine) !== null && finite(item?.awayTeamOdds?.moneyLine) !== null)
  const projection = finite(data.predictor?.homeTeam?.gameProjection)
  const probabilities = Array.isArray(data.winprobability) ? data.winprobability : []
  const initial = finite(probabilities[0]?.homeWinPercentage)
  const latest = finite(probabilities.at(-1)?.homeWinPercentage)
  return {
    ...game,
    predictorHome: projection === null ? initial : projection / 100,
    homeMoneyline: finite(odds?.homeTeamOdds?.moneyLine),
    awayMoneyline: finite(odds?.awayTeamOdds?.moneyLine),
    matchupQuality: finite(data.matchupQuality ?? data.game?.matchupQuality ?? game.matchupQuality),
    homeWinProbability: game.status === 'live' ? latest : null,
    pregameSource: projection === null ? initial === null ? null : 'ESPN opening win probability' : 'ESPN Matchup Predictor',
  }
}

export function normalizeFpiRatings(payload) {
  const ratings = new Map()
  for (const entry of payload?.teams ?? []) {
    const abbreviation = entry?.team?.abbreviation
    const fpi = finite(entry?.categories?.find((category) => category.name === 'fpi')?.values?.[0])
    if (abbreviation && Number.isFinite(fpi)) ratings.set(abbreviation, fpi)
  }
  return ratings
}

export function applyFpiRatings(games, ratings, asOf = null) {
  return games.map((game) => {
    const homeFpi = ratings.get(game.home) ?? null
    const awayFpi = ratings.get(game.away) ?? null
    return {
      ...game,
      homeFpi,
      awayFpi,
      matchupQuality: Number.isFinite(homeFpi) && Number.isFinite(awayFpi) ? (homeFpi + awayFpi) / 2 : game.matchupQuality ?? null,
      fpiAsOf: asOf,
    }
  })
}

export async function fetchFpiRatings({ fetcher = fetch, season = new Date().getUTCFullYear(), signal } = {}) {
  const response = await fetcher(`${FPI}?season=${encodeURIComponent(season)}`, { signal })
  if (!response.ok) throw new Error(`ESPN FPI HTTP ${response.status}`)
  const payload = await response.json()
  return { ratings: normalizeFpiRatings(payload), asOf: payload?.lastUpdated ?? new Date().toISOString() }
}

export async function fetchEspnPool(pool, { fetcher = fetch, signal } = {}) {
  const query = `&dates=${pool.espnSeason}&seasontype=${pool.espnSeasonType}&week=${pool.espnWeek}`
  const scoreboardResponse = await fetcher(`${SCOREBOARD}${query}`, { signal })
  if (!scoreboardResponse.ok) throw new Error(`ESPN scoreboard HTTP ${scoreboardResponse.status}`)
  const games = normalizeScoreboard(await scoreboardResponse.json())
  if (!games.length) return { games: [], asOf: new Date().toISOString(), source: 'ESPN' }
  const fpiPromise = fetchFpiRatings({ fetcher, season: pool.espnSeason, signal }).catch(() => null)
  const enriched = await Promise.all(games.map(async (game) => {
    try {
      const response = await fetcher(`${GAME}&gameId=${game.id}`, { signal })
      return response.ok ? addPregameData(game, await response.json()) : game
    } catch (error) {
      if (error.name === 'AbortError') throw error
      return game
    }
  }))
  const fpi = await fpiPromise
  return { games: fpi ? applyFpiRatings(enriched, fpi.ratings, fpi.asOf) : enriched, asOf: new Date().toISOString(), source: 'ESPN', fpiAsOf: fpi?.asOf ?? null }
}

export function ingestEspnResponse(payload, previous = [], receivedAt = new Date()) {
  if (!Array.isArray(payload?.events)) return { games: previous, freshness: 'stale', asOf: receivedAt.toISOString(), error: 'MALFORMED_RESPONSE' }
  const games = payload.events.map(normalizeEvent).filter(Boolean)
  if (!games.length) return { games: previous, freshness: 'stale', asOf: receivedAt.toISOString(), error: payload.events.length ? 'MALFORMED_RESPONSE' : 'EMPTY_RESPONSE' }
  return { games, freshness: 'fresh', asOf: receivedAt.toISOString() }
}

export function applyLiveSample(game, sample) {
  const updated = { ...game, ...sample, locked: game.locked || game.status !== 'scheduled' || sample.status !== 'scheduled' }
  return sample.status === 'live' ? freezePregameSnapshot(updated, { predictorHome: game.predictorHome ?? sample.predictorHome, homeMoneyline: game.homeMoneyline ?? sample.homeMoneyline, awayMoneyline: game.awayMoneyline ?? sample.awayMoneyline, source: game.status === 'scheduled' ? 'latest-pregame' : 'first-valid-live', capturedAt: sample.capturedAt }) : updated
}
