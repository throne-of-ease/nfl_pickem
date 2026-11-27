import { POOLS } from './domain.js'
import { espnCalendarScoreboardUrl, espnSummaryUrl, fetchFpiRatings } from './espnAdapter.js'

export const WATCH_COMPONENTS = [
  { key: 'uncertainty', label: 'Uncertainty', weight: 27 },
  { key: 'swings', label: 'WP Swings', weight: 22 },
  { key: 'suspense', label: 'Late-Game Suspense', weight: 32 },
  { key: 'scoring', label: 'Scoring Action', weight: 10 },
  { key: 'quality', label: 'Team Quality', weight: 9 },
]

export const DEFAULT_WATCH_WEIGHTS = Object.fromEntries(WATCH_COMPONENTS.map(({ key, weight }) => [key, weight]))

export function watchSeasonRival(seasonHistory, players, viewerId) {
  const rivals = new Set(players.filter(({ id }) => id !== viewerId).map(({ id }) => id))
  // Match Standings: earned season points, then potential total, then name.
  return seasonHistory?.users.filter(({ id }) => rivals.has(id)).sort((a, b) => {
    const pointsA = a.cumulative.at(-1) ?? 0
    const pointsB = b.cumulative.at(-1) ?? 0
    return pointsB - pointsA || (b.remaining.at(-1) ?? 0) - (a.remaining.at(-1) ?? 0) ||
      a.name.localeCompare(b.name)
  })[0]?.id
}

export function watchRootingTeam(game, playerPick, otherPicks, gotw) {
  if (!playerPick || !otherPicks.length) return null
  const signedStake = ({ team, confidence }) => (team === game.home ? 1 : -1) * (confidence + (gotw ? 5 : 0))
  const edge = signedStake(playerPick) * otherPicks.length -
    otherPicks.reduce((total, pick) => total + signedStake(pick), 0)
  return edge > 0 ? game.home : edge < 0 ? game.away : null
}

const CACHE_VERSION = 'nfl-pickem-watch-v1'
const RATING_VERSION = 3
const QUARTER = 15 * 60
const REGULATION = 4 * QUARTER
const SCOREBOARD_MAX_AGE = 2 * 60 * 1000
const FPI_MAX_AGE = 60 * 60 * 1000
const REQUEST_LIMIT = 3
const newestFirst = (a, b) => b.kickoff.localeCompare(a.kickoff) || a.id.localeCompare(b.id)
const completed = (type) => type?.state === 'post' && type.completed === true && /^STATUS_FINAL(?:_|$)/.test(type.name ?? '')
const active = (type) => type?.state === 'in' && !type.completed && !/SUSPEND|DELAY|POSTPON/.test(type.name ?? '')
const swingScore = (total) => -100 * Math.expm1(-total / 2.5)
const unit = (value) => Math.max(0, Math.min(1, value))
const scoringActionRating = (effectivePoints) => -100 * Math.expm1(-effectivePoints / 34)

function scoringAction(scoringPlays, points, opening, end, isFinal) {
  if (!Array.isArray(scoringPlays)) return null
  const scoring = new Map(scoringPlays.map((play) => [String(play.id), play]))
  let home = 0
  let away = 0
  let previousWp = opening
  let effective = 0
  for (const { id, wp } of points) {
    const play = scoring.get(id)
    if (play) {
      const { homeScore, awayScore } = play
      if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return null
      const homeGain = homeScore - home
      const awayGain = awayScore - away
      if (homeGain < 0 || awayGain < 0) return null
      const close = unit((.5 - Math.abs(previousWp - .5)) / .4)
      const wpGain = wp - previousWp
      const homeComeback = home < away ? unit(wpGain / .2) : 0
      const awayComeback = away < home ? unit(-wpGain / .2) : 0
      effective += homeGain * Math.max(close, homeComeback) + awayGain * Math.max(close, awayComeback)
      home = homeScore
      away = awayScore
      scoring.delete(id)
    }
    previousWp = wp
  }
  if (scoring.size) return null
  const elapsed = isFinal ? 1 : unit(end / REGULATION)
  return elapsed ? 50 * (1 - elapsed) + elapsed * scoringActionRating(effective / elapsed) : 50
}

export function watchGame(game, poolKey) {
  const { id, away, home, kickoff, status } = game
  if (!id || !away || !home || !Number.isFinite(Date.parse(kickoff))) return null
  return { id: String(id), away, home, kickoff: new Date(kickoff).toISOString(), poolKey, live: ['live', 'in'].includes(status) }
}

export function mergeWatchGames(...lists) {
  return [...new Map(lists.flat().map((game) => [game.id, game])).values()].sort(newestFirst)
}

function seasonGames(payload, season) {
  if (!Array.isArray(payload?.events)) throw new Error('Invalid ESPN scoreboard')
  return payload.events.flatMap((event) => {
    const type = event.status?.type
    if (event.season?.year !== season || (!completed(type) && !active(type))) return []
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
      status: active(type) ? 'live' : 'final',
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
  const type = competition?.status?.type
  const isFinal = completed(type)
  if ((!isFinal && !active(type)) || home?.team?.abbreviation !== game.home || away?.team?.abbreviation !== game.away) return null
  if (!Array.isArray(data.winprobability)) return null

  const overtimeLength = POOLS.find(({ key }) => key === game.poolKey)?.phase === 'postseason' ? QUARTER : 10 * 60
  const drives = [...(data.drives?.previous ?? []), data.drives?.current]
  const clockByPlay = new Map(drives.flatMap((drive) => drive?.plays ?? []).map((play) => [String(play.id), elapsedSeconds(play, overtimeLength)]))
  const opening = data.winprobability[0]?.homeWinPercentage
  const points = data.winprobability.flatMap(({ playId, homeWinPercentage: wp }) => {
    const time = clockByPlay.get(String(playId))
    return time != null && Number.isFinite(wp) && wp >= 0 && wp <= 1 ? [{ id: String(playId), time, wp }] : []
  }).sort((a, b) => a.time - b.time)
  if (!points.length || points[0].time > QUARTER || (isFinal && (points.length < 2 || points.at(-1).time < REGULATION - 120))) return null

  const first = Number.isFinite(opening) && opening >= 0 && opening <= 1 ? opening : points[0].wp
  const end = isFinal ? Math.max(REGULATION, points.at(-1).time) : points.at(-1).time
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
    uncertainty: end > 0 ? 100 * uncertainty / end : null,
    swings: swingScore(swings),
    suspense: end > lateStart ? 100 * suspense / (end - lateStart) : null,
    scoring: scoringAction(data.scoringPlays, points, first, end, isFinal),
  }
}

export function excitementScore(components, weights) {
  let weighted = 0
  let total = 0
  for (const { key } of WATCH_COMPONENTS) {
    if (!Number.isFinite(components[key])) continue
    const weight = weights[key] ?? 0
    weighted += components[key] * weight
    total += weight
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
  const rating = { ...row, version: RATING_VERSION }
  if (writeCache(key, rating)) ratingMemory.delete(key)
  else ratingMemory.set(key, rating)
}

function readWatchRating(key) {
  const row = ratingMemory.get(key) ?? readCache(key)
  if (!row?.game || !row?.components) return null
  if (row.version === RATING_VERSION) return row
  if (row.version === 2) {
    const { scoring, ...components } = row.components
    if (scoring === null) return row
    // The former scale was linear up to 45 effective points. Re-fetch capped games.
    if (Number.isFinite(scoring) && scoring >= 0 && scoring < 100) {
      return { ...row, components: { ...components, scoring: scoringActionRating(scoring * .45) } }
    }
    return { ...row, components }
  }
  const { swings } = row.components
  if (row.version !== undefined || !Number.isFinite(swings) || swings < 0 || swings >= 100) return null
  // The old scale was linear below 100. Only capped games need their play data again.
  return { ...row, components: { ...row.components, swings: swingScore(2.5 * (swings / 100)) } }
}

export function cachedWatchRatings(season, games) {
  const prefix = ratingPrefix(season)
  if (games) return games.flatMap(({ id }) => {
    const row = readWatchRating(prefix + id)
    return row ? [row] : []
  })
  const rows = new Map()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const row = readWatchRating(key)
      if (row) rows.set(key, row)
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
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
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

export async function analyzeWatchGames(season, games, signal, onResult, concurrency = REQUEST_LIMIT) {
  let next = 0
  async function worker() {
    while (!signal.aborted && next < games.length) {
      const game = games[next++]
      let row = null
      let rateLimited = false
      try {
        const payload = await espnJson(espnSummaryUrl(game.id), signal)
        const components = calculateWatchComponents(payload, game)
        const type = (payload?.gamepackageJSON ?? payload)?.header?.competitions?.[0]?.status?.type
        if (components) row = { game: { ...game, live: active(type) }, components }
      } catch (error) {
        rateLimited = error.message === 'ESPN_RATE_LIMIT'
      }
      if (signal.aborted) return
      if (row && !row.game.live) cacheWatchRating(season, row)
      onResult(game.id, row, rateLimited)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, games.length) }, worker))
}
