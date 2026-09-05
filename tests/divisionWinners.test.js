import { describe, expect, it } from 'vitest'
import { DIVISION_DEFINITIONS, buildDivisionStandingsUrl, evaluateDivisionDraft, fetchDivisionStandings, parseDivisionStandings, resolveDivisionDeadlineFromEvents, validateDivisionPicks } from '../src/divisionWinners.js'

const entry = (team, wins = 1, losses = 0, note) => ({ team: { abbreviation: team }, ...(note ? { note } : {}), stats: [
  { name: 'wins', value: wins }, { name: 'losses', value: losses }, { name: 'ties', value: 0 },
] })

const payload = (overrides = {}) => ({ children: [
  { name: 'American Football Conference', children: DIVISION_DEFINITIONS.slice(0, 4).map((division) => ({ name: division.name, standings: { seasonType: 2, entries: (overrides[division.id] ?? division.teams.map((team, index) => entry(team, index === 0 ? 2 : 1, index === 0 ? 0 : 1)) ) } })) },
  { name: 'National Football Conference', children: DIVISION_DEFINITIONS.slice(4).map((division) => ({ name: division.name, standings: { seasonType: 2, entries: (overrides[division.id] ?? division.teams.map((team, index) => entry(team, index === 0 ? 2 : 1, index === 0 ? 0 : 1)) ) } })) },
] })

describe('division winner ESPN data', () => {
  it('builds the browser standings URL with camel-case seasonType and division level', () => {
    const url = buildDivisionStandingsUrl({ season: 2026, seasonType: 2 })
    expect(url).toContain('seasonType=2')
    expect(url).toContain('level=3')
  })

  it('parses eight divisions and 32 fixed teams, normalizing ESPN WSH to WAS', () => {
    const divisions = parseDivisionStandings(payload({ 'nfc-east': ['DAL', 'NYG', 'PHI', 'WSH'].map((team, index) => entry(team, index === 0 ? 4 : 1, index === 0 ? 0 : 2)) }))
    expect(divisions).toHaveLength(8)
    expect(divisions.flatMap((division) => division.teams)).toHaveLength(32)
    expect(divisions.find((division) => division.id === 'nfc-east')).toMatchObject({ leader: 'DAL', evaluated: true })
    expect(divisions.find((division) => division.id === 'nfc-east').teams.map((team) => team.team)).toContain('WAS')
  })

  it('prefers a z or star clincher over the first sorted entry', () => {
    const divisions = parseDivisionStandings(payload({ 'afc-east': [entry('BUF', 2, 2), entry('MIA', 8, 0, { symbol: 'z' }), entry('NE', 1, 6), entry('NYJ', 0, 7)] }))
    expect(divisions.find((division) => division.id === 'afc-east').leader).toBe('MIA')
  })

  it('uses the explicitly sorted first-place team for ties, but not for all-zero data', () => {
    const tied = parseDivisionStandings(payload({ 'afc-north': ['BAL', 'CIN', 'CLE', 'PIT'].map((team) => entry(team, 2, 2)) }))
    expect(tied.find((division) => division.id === 'afc-north')).toMatchObject({ leader: 'BAL', evaluated: true })
    const zero = parseDivisionStandings(payload({ 'afc-south': ['HOU', 'IND', 'JAX', 'TEN'].map((team) => entry(team, 0, 0)) }))
    expect(zero.find((division) => division.id === 'afc-south')).toMatchObject({ leader: null, evaluated: false, allZero: true })
  })

  it('keeps missing divisions unevaluated and rejects schema drift with no divisions', () => {
    const missing = parseDivisionStandings({ children: [{ name: 'AFC', children: [{ name: 'AFC East', standings: { entries: [] } }] }] })
    expect(missing.find((division) => division.id === 'afc-east')).toMatchObject({ evaluated: false, leader: null })
    expect(() => parseDivisionStandings({ children: [] })).toThrow('INVALID_STANDINGS_RESPONSE')
  })

  it('resolves the earliest Sunday kickoff at or after 13:00 New York time', () => {
    expect(resolveDivisionDeadlineFromEvents([
      { date: '2026-10-11T16:00:00Z' },
      { date: '2026-10-11T17:00:00Z' },
      { date: '2026-10-11T20:20:00Z' },
    ])).toBe('2026-10-11T17:00:00.000Z')
  })

  it('falls back to the last-good standings cache', async () => {
    const values = new Map()
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
    const fresh = await fetchDivisionStandings({ storage, fetcher: async () => ({ ok: true, json: async () => payload() }) })
    expect(fresh.freshness).toBe('fresh')
    const stale = await fetchDivisionStandings({ storage, fetcher: async () => ({ ok: false, status: 503 }) })
    expect(stale).toMatchObject({ freshness: 'stale', divisions: expect.any(Array) })
  })
})

describe('division winner evaluation', () => {
  it('validates partial unique drafts and keeps season scoring separate', () => {
    expect(validateDivisionPicks({ 'afc-east': 'BUF' })).toEqual({ ok: true })
    expect(validateDivisionPicks({ 'afc-east': 'BUF', 'nfc-east': 'BUF' }).code).toBe('INVALID_DIVISION_TEAM')
    expect(validateDivisionPicks({ 'afc-east': 'WSH' }).code).toBe('INVALID_DIVISION_TEAM')
    const divisions = DIVISION_DEFINITIONS.map((division, index) => ({ ...division, evaluated: index < 2, leader: index === 0 ? 'BUF' : 'CIN' }))
    expect(evaluateDivisionDraft({ 'afc-east': 'BUF', 'afc-north': 'PIT' }, divisions, 5)).toMatchObject({ correct: 1, evaluated: 2, points: 5 })
  })
})
