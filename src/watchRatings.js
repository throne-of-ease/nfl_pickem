import { POOLS } from './domain.js'
import { espnCalendarScoreboardUrl, espnSummaryUrl, fetchFpiRatings } from './espnAdapter.js'

export const WATCH_COMPONENTS = [
  { key: 'uncertainty', label: 'Uncertainty', weight: 30 },
  { key: 'swings', label: 'WP Swings', weight: 25 },
  { key: 'suspense', label: 'Late-Game Suspense', weight: 35 },
  { key: 'quality', label: 'Team Quality', weight: 10 },
]

export const DEFAULT_WATCH_WEIGHTS = Object.fromEntries(WATCH_COMPONENTS.map(({ key, weight }) => [key, weight]))

export function adjustWatchWeights(weights, changedKey, percentage) {
  const others = WATCH_COMPONENTS.map(({ key }) => key).filter((key) => key !== changedKey)
  const basis = others.some((key) => weights[key] > 0) ? weights : DEFAULT_WATCH_WEIGHTS
  const adjusted = Object.fromEntries(others.map((key) => [key, 0]))
  // Allocate whole points proportionally. With a fixed basis, taking points
  // away reverses the allocation order, so no other weight can increase.
  const priority = (key) => basis[key] / (adjusted[key] + 0.5)
  for (let total = percentage; total < 100; total += 1) {
    const recipient = others.reduce((best, key) => priority(key) > priority(best) ? key : best)
    adjusted[recipient] += 1
  }
  return { ...adjusted, [changedKey]: percentage }
}

const CACHE_VERSION = 'nfl-pickem-watch-v1'
const QUARTER = 15 * 60
const REGULATION = 4 * QUARTER
const SCOREBOARD_MAX_AGE = 2 * 60 * 1000
const FPI_MAX_AGE = 60 * 60 * 1000
const REQUEST_LIMIT = 3
const newestFirst = (a, b) => b.kickoff.localeCompare(a.kickoff) || a.id.localeCompare(b.id)
const completed = (type) => type?.state === 'post' && type.completed === true && /^STATUS_FINAL(?:_|$)/.test(type.name ?? '')

export function watchGame(game, poolKey) {
  const { id, away, home, kickoff } = game
  if (!id || !away || !home || !Number.isFinite(Date.parse(kickoff))) return null
  return { id: String(id), away, home, kickoff: new Date(kickoff).toISOString(), poolKey }
}

export function mergeWatchGames(...lists) {
  return [...new Map(lists.flat().map((game) => [game.id, game])).values()].sort(newestFirst)
}

function seasonGames(payload, season) {
  if (!Array.isArray(payload?.events)) throw new Error('Invalid ESPN scoreboard')
  return payload.events.flatMap((event) => {
    if (event.season?.year !== season || !completed(event.status?.type)) return []
    const competition = event.competitions?.[0]
    // ESPN also lists the Super Bowl as postseason week 4 on its calendar scoreboard.
    const isSuperBowl = event.season.type === 3 && competition?.notes?.some(({ headline }) => /^super bowl\b/i.test(headline ?? ''))
    const pool = POOLS.find((item) => item.espnSeason === season && item.countsTowardSeason &&
      item.espnSeasonType === event.season.type && (isSuperBowl ? item.key === 'super-bowl' : item.espnWeek === event.week?.number))
    if (!pool) return []
    const teams = competition?.competitors ?? []
    const game = watchGame({
      id: event.id,
      kickoff: event.date,
      away: teams.find(({ homeAway }) => homeAway === 'away')?.team?.abbreviation,
      home: teams.find(({ homeAway }) => homeAway === 'home')?.team?.abbreviation,
    }, pool.key)
    return game ? [game] : []
  })
}

function elapsedSeconds(play, overtimeLength) {
  const period = play.period?.number
  const clock = /^(\d+):([0-5]\d)$/.exec(play.clock?.displayValue ?? '')
  if (!Number.isInteger(period) || period < 1 || !clock) return null
  const length = period <= 4 ? QUARTER : overtimeLength
  const remaining = Number(clock[1]) * 60 + Number(clock[2])
  if (remaining > length) return null
  const start = period <= 4 ? (period - 1) * QUARTER : REGULATION + (period - 5) * overtimeLength
  return start + length - remaining
}

export function watchTeamQuality(game, ratings) {
  const home = ratings.get(game.home)
  const away = ratings.get(game.away)
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null
  return Math.max(0, Math.min(100, 50 + 5 * ((home + away) / 2)))
}

export function calculateWatchComponents(payload, game) {
  const data = payload?.gamepackageJSON ?? payload
  const competition = data?.header?.competitions?.[0]
  const teams = competition?.competitors ?? []
  const home = teams.find(({ homeAway }) => homeAway === 'home')
  const away = teams.find(({ homeAway }) => homeAway === 'away')
  if (!completed(competition?.status?.type) || home?.team?.abbreviation !== game.home || away?.team?.abbreviation !== game.away) return null
  if (!Array.isArray(data.winprobability) || !Array.isArray(data.drives?.previous)) return null

  const overtimeLength = POOLS.find(({ key }) => key === game.poolKey)?.phase === 'postseason' ? QUARTER : 10 * 60
  const clockByPlay = new Map(data.drives.previous.flatMap(({ plays }) => plays ?? []).map((play) => [String(play.id), elapsedSeconds(play, overtimeLength)]))
  const opening = data.winprobability[0]?.homeWinPercentage
  const points = data.winprobability.flatMap(({ playId, homeWinPercentage: wp }) => {
    const time = clockByPlay.get(String(playId))
    return time != null && Number.isFinite(wp) && wp >= 0 && wp <= 1 ? [{ time, wp }] : []
  }).sort((a, b) => a.time - b.time)
  if (points.length < 2 || points[0].time > QUARTER || points.at(-1).time < REGULATION - 120) return null

  const first = Number.isFinite(opening) && opening >= 0 && opening <= 1 ? opening : points[0].wp
  const end = Math.max(REGULATION, points.at(-1).time)
  const lateStart = REGULATION - 5 * 60
  let previous = { time: 0, wp: first }
  let uncertainty = 0
  let suspense = 0
  let swings = 0
  for (const point of [...points, { time: end, wp: points.at(-1).wp }]) {
    const closeness = 1 - 2 * Math.abs(previous.wp - 0.5)
    uncertainty += (point.time - previous.time) * closeness
    suspense += Math.max(0, point.time - Math.max(lateStart, previous.time)) * closeness
    swings += Math.max(0, Math.abs(point.wp - previous.wp) - 0.015)
    previous = point
  }
  return {
    uncertainty: 100 * uncertainty / end,
    swings: 100 * Math.min(1, swings / 2.5),
    suspense: 100 * suspense / (end - lateStart),
  }
}

export function excitementScore(components, weights) {
  let weighted = 0
  let total = 0
  for (const { key } of WATCH_COMPONENTS) {
    if (!Number.isFinite(components[key])) continue
    weighted += components[key] * weights[key]
    total += weights[key]
  }
  return total ? weighted / total : null
}

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const watchFpiKey = (season) => `${CACHE_VERSION}:fpi:${season}`
export const cachedWatchFpi = (season) => new Map(readCache(watchFpiKey(season))?.ratings ?? [])

export async function loadWatchFpi(season, signal) {
  const key = watchFpiKey(season)
  const cached = readCache(key)
  if (cached?.ratings?.length && Date.now() - cached.fetchedAt < FPI_MAX_AGE) return new Map(cached.ratings)
  try {
    const { ratings } = await fetchFpiRatings({ season, signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) })
    if (ratings.size) {
      writeCache(key, { fetchedAt: Date.now(), ratings: [...ratings] })
      return ratings
    }
  } catch { /* Reuse the latest saved FPI during an ESPN outage. */ }
  return new Map(cached?.ratings ?? [])
}

const ratingPrefix = (season) => `${CACHE_VERSION}:rating:${season}:`
const ratingMemory = new Map()

export function cacheWatchRating(season, row) {
  const key = ratingPrefix(season) + row.game.id
  if (writeCache(key, row)) ratingMemory.delete(key)
  else ratingMemory.set(key, row)
}

export function cachedWatchRatings(season, games) {
  const prefix = ratingPrefix(season)
  if (games) return games.flatMap(({ id }) => {
    const row = ratingMemory.get(prefix + id) ?? readCache(prefix + id)
    return row?.game && row?.components ? [row] : []
  })
  const rows = new Map()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const row = readCache(key)
      if (row?.game && row?.components) rows.set(key, row)
    }
  } catch { /* use the current session's ratings */ }
  for (const [key, row] of ratingMemory) if (key.startsWith(prefix)) rows.set(key, row)
  return [...rows.values()]
}

const scheduleCacheKey = (season) => `${CACHE_VERSION}:schedule:${season}`
export const cachedWatchSchedule = (season) => readCache(scheduleCacheKey(season))

let pausedUntil = 0

async function waitForEspn(signal) {
  while (!signal.aborted) {
    const wait = pausedUntil - Date.now()
    if (wait <= 0) return
    if (wait > 15000) throw new Error('ESPN_RATE_LIMIT')
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, wait)
      signal.addEventListener('abort', finish, { once: true })
    })
  }
}

async function espnJson(url, signal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await waitForEspn(signal)
    signal.throwIfAborted()
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
    if (response.ok) return response.json()
    if (response.status !== 429) throw new Error(`ESPN_HTTP_${response.status}`)
    const header = response.headers.get('Retry-After')
    const delay = header && (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now())
    pausedUntil = Math.max(pausedUntil, Date.now() + Math.max(1000, delay || 2000))
  }
  throw new Error('ESPN_RATE_LIMIT')
}

export async function fetchWatchSchedule(season, signal, refresh) {
  const years = [season, season + 1].filter((year) => year <= new Date().getUTCFullYear())
  const cached = cachedWatchSchedule(season)
  if (!refresh && cached?.years === years.length && Date.now() - cached.asOf < SCOREBOARD_MAX_AGE) return { games: cached.games }
  // Request both calendar years once the NFL season has crossed into January.
  const results = await Promise.allSettled(years.map(async (year) => seasonGames(await espnJson(espnCalendarScoreboardUrl(year), signal), season)))
  signal.throwIfAborted()
  const failure = results.find(({ status }) => status === 'rejected')
  const games = mergeWatchGames(...results.map(({ value }) => value ?? []))
  if (failure) return { games: mergeWatchGames(cached?.games ?? [], games), error: failure.reason }
  writeCache(scheduleCacheKey(season), { asOf: Date.now(), years: years.length, games })
  return { games }
}

// Wait for aborted requests to settle before starting work for the next scope.
let activeRun = Promise.resolve()
export function queueWatchRun(signal, run) {
  activeRun = activeRun.catch(() => {}).then(() => { if (!signal.aborted) return run() })
  return activeRun
}

export async function analyzeWatchGames(season, games, signal, onResult) {
  let next = 0
  async function worker() {
    while (!signal.aborted && next < games.length) {
      const game = games[next++]
      let row = null
      let rateLimited = false
      try {
        const components = calculateWatchComponents(await espnJson(espnSummaryUrl(game.id), signal), game)
        if (components) row = { game, components }
      } catch (error) {
        rateLimited = error.message === 'ESPN_RATE_LIMIT'
      }
      if (signal.aborted) return
      if (row) cacheWatchRating(season, row)
      onResult(game.id, row, rateLimited)
    }
  }
  await Promise.all(Array.from({ length: Math.min(REQUEST_LIMIT, games.length) }, worker))
}
