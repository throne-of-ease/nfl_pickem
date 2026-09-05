export const DIVISION_DEFINITIONS = [
  { id: 'afc-east', name: 'AFC East', conference: 'AFC', teams: ['BUF', 'MIA', 'NE', 'NYJ'] },
  { id: 'afc-north', name: 'AFC North', conference: 'AFC', teams: ['BAL', 'CIN', 'CLE', 'PIT'] },
  { id: 'afc-south', name: 'AFC South', conference: 'AFC', teams: ['HOU', 'IND', 'JAX', 'TEN'] },
  { id: 'afc-west', name: 'AFC West', conference: 'AFC', teams: ['DEN', 'KC', 'LV', 'LAC'] },
  { id: 'nfc-east', name: 'NFC East', conference: 'NFC', teams: ['DAL', 'NYG', 'PHI', 'WAS'] },
  { id: 'nfc-north', name: 'NFC North', conference: 'NFC', teams: ['CHI', 'DET', 'GB', 'MIN'] },
  { id: 'nfc-south', name: 'NFC South', conference: 'NFC', teams: ['ATL', 'CAR', 'NO', 'TB'] },
  { id: 'nfc-west', name: 'NFC West', conference: 'NFC', teams: ['ARI', 'LAR', 'SF', 'SEA'] },
]

export const DEFAULT_DIVISION_SETTINGS = {
  lockWeek: 5,
  lockAt: '2026-10-11T17:00:00.000Z',
  pointsPerCorrect: 5,
}

const ESPN_STANDINGS = 'https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings'
const ESPN_SCHEDULE = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
const CACHE_PREFIX = 'nfl-pickem-division-standings-v1'
const ESPN_TEAM_ALIASES = { WSH: 'WAS' }

export const normalizeDivisionTeam = (team) => ESPN_TEAM_ALIASES[String(team ?? '').toUpperCase()] ?? String(team ?? '').toUpperCase()

export function buildDivisionStandingsUrl({ season = 2026, seasonType = 2 } = {}) {
  const params = new URLSearchParams({ region: 'us', lang: 'en', season: String(season), seasonType: String(seasonType), seasontype: String(seasonType), level: '3' })
  return `${ESPN_STANDINGS}?${params}`
}

export function buildDivisionScheduleUrl({ season = 2026, seasonType = 2, week } = {}) {
  const params = new URLSearchParams({ region: 'us', lang: 'en', dates: String(season), seasontype: String(seasonType), week: String(week) })
  return `${ESPN_SCHEDULE}?${params}`
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null
const stat = (entry, names) => {
  const item = (entry?.stats ?? []).find((candidate) => names.includes(String(candidate?.name ?? '').toLowerCase()) || names.includes(String(candidate?.type ?? '').toLowerCase()))
  return item?.value ?? item?.displayValue ?? null
}

const clinchedMarker = (entry) => {
  if (entry?.clinched === true || entry?.team?.clinched === true || entry?.team?.isClinched === true) return true
  const candidates = [entry?.note, entry?.team?.note, entry?.status, entry?.team?.status]
  return candidates.some((value) => {
    if (!value) return false
    if (typeof value === 'object') return [value.symbol, value.shortText, value.displayValue, value.text, value.type, value.abbreviation].some((item) => /^(z|\*)$/i.test(String(item ?? '').trim()) || /clinched|division/i.test(String(item ?? '')))
    return /^(z|\*)$/i.test(String(value).trim()) || /clinched|division/i.test(String(value))
  })
}

const divisionName = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

function findRawDivision(payload, definition) {
  const conferences = Array.isArray(payload?.children) ? payload.children : []
  return conferences.flatMap((conference) => conference?.children ?? []).find((division) => {
    const name = divisionName(division?.name ?? division?.abbreviation)
    return name === divisionName(definition.name) || name === divisionName(definition.id)
  })
}

export function parseDivisionStandings(payload) {
  if (!payload || !Array.isArray(payload.children)) throw new Error('INVALID_STANDINGS_RESPONSE')
  const recognized = DIVISION_DEFINITIONS.filter((definition) => findRawDivision(payload, definition)).length
  if (!recognized) throw new Error('INVALID_STANDINGS_RESPONSE')
  return DIVISION_DEFINITIONS.map((definition) => {
    const raw = findRawDivision(payload, definition)
    const entries = Array.isArray(raw?.standings?.entries) ? raw.standings.entries : []
    const teams = definition.teams.map((code) => {
      const entry = entries.find((item) => normalizeDivisionTeam(item?.team?.abbreviation) === code)
      return {
        team: code,
        wins: finite(stat(entry, ['wins', 'w'])),
        losses: finite(stat(entry, ['losses', 'l'])),
        ties: finite(stat(entry, ['ties', 't'])),
        clinched: clinchedMarker(entry),
      }
    })
    const allZero = entries.length > 0 && entries.every((entry) => ['wins', 'losses', 'ties'].every((name) => (finite(stat(entry, [name, name[0]])) ?? 0) === 0))
    const sortedEntries = [...entries].sort((a, b) => {
      const aSeed = finite(stat(a, ['playoffseed', 'seed']))
      const bSeed = finite(stat(b, ['playoffseed', 'seed']))
      return aSeed !== null && bSeed !== null && aSeed !== bSeed ? aSeed - bSeed : 0
    })
    const clinched = entries.find(clinchedMarker)
    const leaderEntry = clinched ?? (!allZero ? sortedEntries[0] : null)
    const leader = normalizeDivisionTeam(leaderEntry?.team?.abbreviation)
    return {
      ...definition,
      teams,
      evaluated: definition.teams.includes(leader),
      leader: definition.teams.includes(leader) ? leader : null,
      allZero,
      sourceName: raw?.name ?? null,
    }
  })
}

const eventList = (payload) => Array.isArray(payload?.events) ? payload.events : Array.isArray(payload?.content?.sbData?.events) ? payload.content.sbData.events : []

export function resolveDivisionDeadlineFromEvents(events, { timeZone = 'America/New_York' } = {}) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date())
  if (!parts.length) throw new Error('TIMEZONE_UNAVAILABLE')
  const candidates = (events ?? []).map((event) => new Date(event?.date ?? event?.kickoff)).filter((date) => !Number.isNaN(date.valueOf())).filter((date) => {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date).map(({ type, value }) => [type, value]))
    return values.weekday === 'Sun' && Number(values.hour) >= 13
  })
  if (!candidates.length) throw new Error('DIVISION_DEADLINE_NOT_FOUND')
  return candidates.sort((a, b) => a - b)[0].toISOString()
}

export async function resolveDivisionDeadline({ week, season = 2026, fetcher = fetch, signal } = {}) {
  if (!Number.isInteger(Number(week)) || Number(week) < 1 || Number(week) > 18) throw new Error('INVALID_LOCK_WEEK')
  const response = await fetcher(buildDivisionScheduleUrl({ season, week }), { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`ESPN schedule HTTP ${response.status}`)
  return resolveDivisionDeadlineFromEvents(eventList(await response.json()))
}

const storageFor = (storage) => storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
const cacheKey = (season) => `${CACHE_PREFIX}:${season}`

export function readDivisionStandingsCache({ season = 2026, storage } = {}) {
  try { return JSON.parse(storageFor(storage)?.getItem(cacheKey(season)) ?? 'null') } catch { return null }
}

function writeDivisionStandingsCache(value, { season = 2026, storage } = {}) {
  try { storageFor(storage)?.setItem(cacheKey(season), JSON.stringify(value)) } catch { /* cache is an optimization */ }
}

export async function fetchDivisionStandings({ season = 2026, seasonType = 2, fetcher = fetch, signal, storage } = {}) {
  try {
    const response = await fetcher(`${buildDivisionStandingsUrl({ season, seasonType })}&_nfl_pickem=${Date.now()}`, { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`ESPN standings HTTP ${response.status}`)
    const divisions = parseDivisionStandings(await response.json())
    const result = { divisions, asOf: new Date().toISOString(), freshness: 'fresh' }
    writeDivisionStandingsCache(result, { season, storage })
    return result
  } catch (error) {
    const cached = readDivisionStandingsCache({ season, storage })
    if (cached?.divisions?.length) return { ...cached, freshness: 'stale', error: error.message }
    throw error
  }
}

export function evaluateDivisionPick(team, division) {
  if (!division?.evaluated || !division.leader) return null
  return team === division.leader
}

export function evaluateDivisionDraft(picks = {}, divisions = DIVISION_DEFINITIONS, pointsPerCorrect = 5) {
  const results = divisions.map((division) => evaluateDivisionPick(picks[division.id], division))
  const correct = results.filter((value) => value === true).length
  const evaluated = results.filter((value) => value !== null).length
  return { correct, evaluated, points: correct * Number(pointsPerCorrect || 0), results }
}

export function isCompleteDivisionDraft(picks = {}) {
  return DIVISION_DEFINITIONS.every((division) => division.teams.includes(normalizeDivisionTeam(picks[division.id])))
}

export function validateDivisionPicks(picks = {}) {
  if (!picks || typeof picks !== 'object' || Array.isArray(picks)) return { code: 'MALFORMED_DIVISION_PICKS' }
  const allowed = new Map(DIVISION_DEFINITIONS.map((division) => [division.id, new Set(division.teams)]))
  const teams = []
  for (const [division, rawTeam] of Object.entries(picks)) {
    if (!allowed.has(division)) return { code: 'UNKNOWN_DIVISION' }
    const team = normalizeDivisionTeam(rawTeam)
    if (!allowed.get(division).has(team)) return { code: 'INVALID_DIVISION_TEAM' }
    teams.push(team)
  }
  if (new Set(teams).size !== teams.length) return { code: 'DUPLICATE_DIVISION_TEAM' }
  return { ok: true }
}
