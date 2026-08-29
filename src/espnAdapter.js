import { freezePregameSnapshot } from './domain.js'

const STATUS = { pre: 'scheduled', in: 'live', post: 'final', scheduled: 'scheduled', live: 'live', final: 'final' }
const SCOREBOARD = 'https://cdn.espn.com/core/nfl/scoreboard?xhr=1'
const GAME = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='
const FPI = 'https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex'

const finite = (value) => value === null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null
const probability = (value) => {
  const number = finite(value)
  return number === null ? null : number > 1 ? number / 100 : number
}
const cacheBusted = (url) => `${url}&_nfl_pickem=${Date.now()}`

const statusRank = (status) => status === 'final' || status === 'post' ? 2 : status === 'live' || status === 'in' ? 1 : 0
const scoreValue = (value) => Number.isFinite(Number(value)) ? Number(value) : null
const clockValue = (value) => {
  const match = String(value ?? '').match(/^(\d+):([0-5]\d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

const isOlderGameState = (current, incoming) => {
  if (!current || !incoming) return false
  if (statusRank(incoming.status) < statusRank(current.status)) return true
  if (statusRank(incoming.status) !== statusRank(current.status)) return false

  const currentAway = scoreValue(current.awayScore)
  const currentHome = scoreValue(current.homeScore)
  const incomingAway = scoreValue(incoming.awayScore)
  const incomingHome = scoreValue(incoming.homeScore)
  if (currentAway !== null && incomingAway !== null && incomingAway < currentAway) return true
  if (currentHome !== null && incomingHome !== null && incomingHome < currentHome) return true

  if (statusRank(current.status) !== 1) return false
  const currentPeriod = scoreValue(current.period)
  const incomingPeriod = scoreValue(incoming.period)
  if (currentPeriod !== null && incomingPeriod !== null && incomingPeriod < currentPeriod) return true
  const currentClock = clockValue(current.displayClock)
  const incomingClock = clockValue(incoming.displayClock)
  return currentPeriod !== null && currentPeriod === incomingPeriod && currentClock !== null && incomingClock !== null && incomingClock > currentClock
}

export function mergeLatestGame(current, incoming) {
  const merged = { ...current, ...incoming }
  if (!isOlderGameState(current, incoming)) return merged
  for (const key of ['status', 'awayScore', 'homeScore', 'period', 'displayClock', 'statusDetail']) {
    if (current[key] !== undefined) merged[key] = current[key]
  }
  return merged
}

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
  const competition = data.header?.competitions?.[0]
  const competitors = competition?.competitors ?? []
  const home = competitors.find((team) => team.homeAway === 'home' || team.team?.abbreviation === game.home)
  const away = competitors.find((team) => team.homeAway === 'away' || team.team?.abbreviation === game.away)
  const statusInfo = competition?.status ?? {}
  const summaryStatus = STATUS[statusInfo.type?.state ?? statusInfo.state]
  const summaryMatchesGame = home?.team?.abbreviation === game.home && away?.team?.abbreviation === game.away
  const updatedGame = summaryMatchesGame ? {
    ...game,
    ...(summaryStatus ? { status: summaryStatus } : {}),
    ...(Number.isFinite(finite(home.score)) ? { homeScore: finite(home.score) } : {}),
    ...(Number.isFinite(finite(away.score)) ? { awayScore: finite(away.score) } : {}),
    ...(Number.isFinite(finite(statusInfo.period)) ? { period: finite(statusInfo.period) } : {}),
    ...(statusInfo.displayClock || statusInfo.type?.statusPrimary ? { displayClock: statusInfo.displayClock ?? statusInfo.type.statusPrimary } : {}),
    ...(statusInfo.type?.shortDetail || statusInfo.type?.detail ? { statusDetail: statusInfo.type.shortDetail ?? statusInfo.type.detail } : {}),
  } : game
  const odds = data.pickcenter?.find((item) => finite(item?.homeTeamOdds?.moneyLine) !== null && finite(item?.awayTeamOdds?.moneyLine) !== null)
  const projection = finite(data.predictor?.homeTeam?.gameProjection)
  const probabilities = Array.isArray(data.winprobability) ? data.winprobability : []
  const initial = probability(probabilities[0]?.homeWinPercentage)
  const latest = probability(probabilities.at(-1)?.homeWinPercentage)
  const pregameProbability = projection === null ? initial : probability(projection)
  return {
    ...updatedGame,
    predictorHome: pregameProbability,
    homeMoneyline: finite(odds?.homeTeamOdds?.moneyLine),
    awayMoneyline: finite(odds?.awayTeamOdds?.moneyLine),
    matchupQuality: finite(data.matchupQuality ?? data.game?.matchupQuality ?? updatedGame.matchupQuality),
    homeWinProbability: updatedGame.status === 'live' ? latest : null,
    awayWinProbability: updatedGame.status === 'live' && latest !== null ? 1 - latest : null,
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
  const response = await fetcher(cacheBusted(`${FPI}?season=${encodeURIComponent(season)}`), { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`ESPN FPI HTTP ${response.status}`)
  const payload = await response.json()
  return { ratings: normalizeFpiRatings(payload), asOf: payload?.lastUpdated ?? new Date().toISOString() }
}

export async function fetchEspnPool(pool, { fetcher = fetch, signal, includeFpi = true } = {}) {
  const query = `&dates=${pool.espnSeason}&seasontype=${pool.espnSeasonType}&week=${pool.espnWeek}`
  const scoreboardResponse = await fetcher(cacheBusted(`${SCOREBOARD}${query}`), { signal, cache: 'no-store' })
  if (!scoreboardResponse.ok) throw new Error(`ESPN scoreboard HTTP ${scoreboardResponse.status}`)
  const games = normalizeScoreboard(await scoreboardResponse.json())
  if (!games.length) return { games: [], asOf: new Date().toISOString(), source: 'ESPN' }
  const fpiPromise = includeFpi ? fetchFpiRatings({ fetcher, season: pool.espnSeason, signal }).catch(() => null) : Promise.resolve(null)
  const enriched = await Promise.all(games.map(async (game) => {
    try {
      const response = await fetcher(cacheBusted(`${GAME}${game.id}`), { signal, cache: 'no-store' })
      return response.ok ? mergeLatestGame(game, addPregameData(game, await response.json())) : game
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
