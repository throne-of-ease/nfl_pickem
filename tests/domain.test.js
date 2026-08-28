import { describe, expect, it } from 'vitest'
import { POOLS, buildSeasonHistory, freezePregameSnapshot, gameQuality, modelDisagreement, modelPicks, noVigProbabilities, pickDeviation, poolMetrics, presetConfidencePicks, scorePick, standings, validateDraft } from '../src/domain.js'
import { gamesByPool, picksByUser, users } from '../src/fixtures.js'

const games = [
  { id: 'b', away: 'B', home: 'BB', kickoff: '2026-09-01T12:00:00Z', predictorHome: .6, homeMoneyline: -120, awayMoneyline: 110, status: 'final', awayScore: 7, homeScore: 7, gotw: true },
  { id: 'a', away: 'A', home: 'AA', kickoff: '2026-09-01T12:00:00Z', predictorHome: .4, homeMoneyline: 120, awayMoneyline: -140, status: 'scheduled', awayScore: 0, homeScore: 0 },
  { id: 'c', away: 'C', home: 'CC', kickoff: '2026-09-02T12:00:00Z', predictorHome: null, homeMoneyline: null, awayMoneyline: null, status: 'scheduled', awayScore: 0, homeScore: 0 },
]

describe('pool contract', () => {
  it('maps all 26 pools without ESPN defaults or Pro Bowl week', () => {
    expect(POOLS).toHaveLength(26)
    expect(POOLS.every((pool) => pool.espnSeason === 2026 && pool.espnSeasonType && pool.espnWeek)).toBe(true)
    expect(POOLS.find((pool) => pool.key === 'super-bowl').espnWeek).toBe(5)
    expect(POOLS.filter((pool) => pool.phase === 'preseason').every((pool) => !pool.countsTowardSeason)).toBe(true)
    expect(POOLS.find((pool) => pool.key === 'preseason-hof')).toMatchObject({ label: 'Hall of Fame Game', espnWeek: 1 })
    expect(POOLS.find((pool) => pool.key === 'preseason-03')).toMatchObject({ label: 'Preseason 3', espnWeek: 4 })
    expect(POOLS.filter((pool) => pool.acceptsLatePicks).map((pool) => pool.key)).toEqual(['preseason-01', 'preseason-02'])
    expect(POOLS.some((pool) => pool.phase === 'postseason' && pool.espnWeek === 4)).toBe(false)
  })

  it('presets every confidence while preserving valid saved values', () => {
    expect(presetConfidencePicks(games, [{ gameId: 'b', team: 'B', confidence: 3 }])).toEqual([
      { gameId: 'b', team: 'B', confidence: 3 },
      { gameId: 'a', team: null, confidence: 1 },
      { gameId: 'c', team: null, confidence: 2 },
    ])
  })

  it('contains the official 16-game 2026 preseason Week 3 slate', () => {
    const week = gamesByPool['preseason-03']
    expect(week).toHaveLength(16)
    expect(week[0]).toMatchObject({ id: '401873298', away: 'PIT', home: 'BUF', kickoff: '2026-08-27T23:00:00Z' })
    expect(week.at(-1)).toMatchObject({ id: '401874394', away: 'CHI', home: 'TEN', kickoff: '2026-08-29T22:00:00Z' })
    expect(new Set(week.flatMap((game) => [game.away, game.home])).size).toBe(32)
    expect(week.every((game) => Number.isFinite(game.homeMoneyline) && Number.isFinite(game.awayMoneyline))).toBe(true)
  })
})

describe('models', () => {
  it('removes vig by normalization', () => {
    const result = noVigProbabilities(-110, -110)
    expect(result.home).toBeCloseTo(.5)
    expect(result.home + result.away).toBeCloseTo(1)
    expect(noVigProbabilities(null, -110)).toBeNull()
  })

  it('ranks only complete finite model inputs with deterministic ties', () => {
    expect(modelPicks(games, 'predictor').map((pick) => pick.gameId)).toEqual(['a', 'b'])
    expect(modelPicks(games, 'aggregate')).toHaveLength(2)
    expect(modelDisagreement(games[2])).toBeNull()
  })

  it('keeps GQ unavailable when ESPN does not provide it', () => {
    expect(gameQuality({ matchupQuality: 87.4 })).toBe(87.4)
    expect(gameQuality({ predictorHome: .6 })).toBeNull()
  })
})

describe('drafts and scoring', () => {
  it('accepts unique partial drafts and requires 1..N for completion', () => {
    expect(validateDraft(games, [{ gameId: 'a', team: 'A', confidence: 2 }]).ok).toBe(true)
    expect(validateDraft(games, [{ gameId: 'a', confidence: 2 }, { gameId: 'b', confidence: 2 }]).code).toBe('INVALID_CONFIDENCE_SET')
    expect(validateDraft(games, [{ gameId: 'a', confidence: 1 }], { complete: true }).code).toBe('INVALID_CONFIDENCE_SET')
    expect(validateDraft(games, [{ gameId: 'x', confidence: 1 }]).code).toBe('UNKNOWN_GAME')
  })

  it('preserves locked rows', () => {
    const previous = [{ gameId: 'b', team: 'B', confidence: 1 }]
    const changed = [{ gameId: 'b', team: 'BB', confidence: 1 }]
    expect(validateDraft(games, changed, { previous, now: new Date('2026-09-02') }).code).toBe('LOCKED_GAME_CHANGED')
  })

  it('allows the explicitly reopened preseason weeks to change after kickoff', () => {
    const previous = [{ gameId: 'b', team: 'B', confidence: 1 }]
    const changed = [{ gameId: 'b', team: 'BB', confidence: 1 }]
    expect(validateDraft(games, changed, { previous, now: new Date('2026-09-02'), acceptsLatePicks: true }).ok).toBe(true)
  })

  it('awards final ties and GOTW bonus to either submitted team', () => {
    expect(scorePick({ team: 'B', confidence: 3 }, games[0]).points).toBe(8)
    expect(scorePick({ team: 'BB', confidence: 2 }, games[0]).points).toBe(7)
  })

  it('uses win probability only for a provisional live tie', () => {
    const live = { ...games[0], status: 'live', homeWinProbability: .6 }
    expect(scorePick({ team: 'BB', confidence: 2 }, live, true)).toMatchObject({ points: 7, potential: 0, scored: true, correct: true })
    expect(scorePick({ team: 'BB', confidence: 2 }, live, false)).toMatchObject({ points: 0, potential: 7, scored: false, correct: null })
  })

  it('never awards official points for a live score leader or double-counts live potential', () => {
    const live = { ...games[0], status: 'live', homeScore: 14, awayScore: 7 }
    expect(scorePick({ team: 'BB', confidence: 2 }, live, false)).toMatchObject({ points: 0, potential: 7 })
    expect(scorePick({ team: 'BB', confidence: 2 }, live, true)).toMatchObject({ points: 7, potential: 0 })
    expect(scorePick({ team: 'B', confidence: 3 }, live, true)).toMatchObject({ points: 0, potential: 0, correct: false })
  })

  it('orders four users by earned then potential points', () => {
    const users = ['A', 'B', 'C', 'D'].map((name, index) => ({ id: `${index}`, name }))
    const picks = Object.fromEntries(users.map((user, index) => [user.id, [{ gameId: 'b', team: index < 2 ? 'B' : 'BB', confidence: index + 1 }]]))
    const board = standings(users, [games[0]], picks)
    expect(board).toHaveLength(4)
    expect(board[0].name).toBe('D')
  })

  it('calculates tracker-compatible signed pick deviation across players', () => {
    const game = { id: 'dev', away: 'A', home: 'B', gotw: false }
    expect(pickDeviation(game, {
      one: [{ gameId: 'dev', team: 'B', confidence: 4 }],
      two: [{ gameId: 'dev', team: 'A', confidence: 2 }],
      three: [{ gameId: 'dev', team: 'B', confidence: 1 }],
    })).toBeCloseTo(3)
    expect(pickDeviation(game, { one: [{ gameId: 'dev', team: 'B', confidence: 4 }] })).toBeNull()
  })
})

describe('tracker-compatible analytics', () => {
  it('provides all 26 fixture pools and complete seeded drafts', () => {
    expect(Object.keys(gamesByPool)).toHaveLength(26)
    expect(POOLS.every((pool) => gamesByPool[pool.key]?.length > 0)).toBe(true)
    expect(users.every((user) => POOLS.every((pool) => picksByUser[user.id][pool.key].length === gamesByPool[pool.key].length))).toBe(true)
  })

  it('tracks earned, lost, and remaining points from the same scored outcomes', () => {
    const liveGames = [
      { id: 'one', away: 'A', home: 'B', status: 'final', awayScore: 3, homeScore: 7, gotw: true },
      { id: 'two', away: 'C', home: 'D', status: 'live', awayScore: 10, homeScore: 7 },
      { id: 'three', away: 'E', home: 'F', status: 'scheduled' },
    ]
    const metrics = poolMetrics([{ id: 'p', name: 'Pat' }], liveGames, { p: [
      { gameId: 'one', team: 'A', confidence: 1 },
      { gameId: 'two', team: 'C', confidence: 2 },
      { gameId: 'three', team: 'F', confidence: 3 },
    ] }, true)[0]
    expect(metrics).toMatchObject({ points: 2, pointsLost: 6, potential: 3, correct: 1, played: 2, maximum: 11 })
  })

  it('keeps still-assignable confidence available in a partial draft', () => {
    const partialGames = [
      { id: 'done', away: 'A', home: 'B', status: 'final', awayScore: 3, homeScore: 7, kickoff: '2026-01-01T00:00:00Z' },
      { id: 'open', away: 'C', home: 'D', status: 'scheduled', kickoff: '2099-01-01T00:00:00Z' },
    ]
    expect(poolMetrics([{ id: 'p', name: 'Pat' }], partialGames, { p: [] })[0].potential).toBe(2)
    expect(poolMetrics([{ id: 'p', name: 'Pat' }], partialGames.map((game) => ({ ...game, status: 'scheduled', kickoff: '2099-01-01T00:00:00Z' })), { p: [] })[0].potential).toBe(3)
  })

  it('excludes preseason, includes playoffs, and computes points versus leader', () => {
    const history = buildSeasonHistory(users, gamesByPool, picksByUser, true, 'super-bowl')
    expect(history.weeks).toHaveLength(22)
    expect(history.weeks.slice(-4)).toEqual(['WC', 'DIV', 'CONF', 'SB'])
    expect(history.pools.some((pool) => pool.startsWith('preseason'))).toBe(false)
    history.weeks.forEach((_, index) => expect(Math.max(...history.users.map((user) => user.relative[index]))).toBe(0))
  })
})

describe('pregame snapshots', () => {
  it('freezes the first valid sample and never replaces it', () => {
    const first = freezePregameSnapshot({}, { predictorHome: .55, source: 'first-live', capturedAt: 't1' })
    const second = freezePregameSnapshot(first, { predictorHome: .8, source: 'later', capturedAt: 't2' })
    expect(second.pregameSnapshot).toEqual(first.pregameSnapshot)
  })
})
