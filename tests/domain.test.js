import { describe, expect, it } from 'vitest'
import { POOLS, freezePregameSnapshot, modelDisagreement, modelPicks, noVigProbabilities, scorePick, standings, validateDraft } from '../src/domain.js'
import { gamesByPool } from '../src/fixtures.js'

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
    expect(POOLS.some((pool) => pool.phase === 'postseason' && pool.espnWeek === 4)).toBe(false)
  })

  it('contains the official 16-game 2026 preseason Week 3 slate', () => {
    const week = gamesByPool['preseason-03']
    expect(week).toHaveLength(16)
    expect(week[0]).toMatchObject({ away: 'PIT', home: 'BUF', kickoff: '2026-08-27T23:00:00Z' })
    expect(week.at(-1)).toMatchObject({ away: 'CHI', home: 'TEN', kickoff: '2026-08-29T22:00:00Z' })
    expect(new Set(week.flatMap((game) => [game.away, game.home])).size).toBe(32)
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

  it('awards final ties and GOTW bonus to either submitted team', () => {
    expect(scorePick({ team: 'B', confidence: 3 }, games[0]).points).toBe(8)
    expect(scorePick({ team: 'BB', confidence: 2 }, games[0]).points).toBe(7)
  })

  it('uses win probability only for a provisional live tie', () => {
    const live = { ...games[0], status: 'live', homeWinProbability: .6 }
    expect(scorePick({ team: 'BB', confidence: 2 }, live, true).points).toBe(7)
    expect(scorePick({ team: 'BB', confidence: 2 }, live, false).points).toBe(0)
  })

  it('orders four users by earned then potential points', () => {
    const users = ['A', 'B', 'C', 'D'].map((name, index) => ({ id: `${index}`, name }))
    const picks = Object.fromEntries(users.map((user, index) => [user.id, [{ gameId: 'b', team: index < 2 ? 'B' : 'BB', confidence: index + 1 }]]))
    const board = standings(users, [games[0]], picks)
    expect(board).toHaveLength(4)
    expect(board[0].name).toBe('D')
  })
})

describe('pregame snapshots', () => {
  it('freezes the first valid sample and never replaces it', () => {
    const first = freezePregameSnapshot({}, { predictorHome: .55, source: 'first-live', capturedAt: 't1' })
    const second = freezePregameSnapshot(first, { predictorHome: .8, source: 'later', capturedAt: 't2' })
    expect(second.pregameSnapshot).toEqual(first.pregameSnapshot)
  })
})
