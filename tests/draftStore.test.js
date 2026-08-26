import { describe, expect, it } from 'vitest'
import { DraftStore } from '../src/draftStore.js'

const games = [{ id: 'g1', kickoff: '2027-01-01T00:00:00Z' }, { id: 'g2', kickoff: '2027-01-02T00:00:00Z' }]

describe('atomic per-user draft revisions', () => {
  it('isolates four users and does not confuse pool data with draft revisions', () => {
    const store = new DraftStore()
    for (const user of ['u1', 'u2', 'u3', 'u4']) {
      expect(store.replace(user, 'week-01', games, 0, [{ gameId: 'g1', team: 'A', confidence: 1 }], new Date('2026-01-01')).draftRevision).toBe(1)
    }
    expect(store.get('u1', 'week-01', games).draftRevision).toBe(1)
    expect(store.get('u1', 'week-02', games).draftRevision).toBe(0)
  })

  it('allows only one writer to win a revision race', () => {
    const store = new DraftStore()
    const first = store.replace('u1', 'week-01', games, 0, [{ gameId: 'g1', team: 'A', confidence: 1 }], new Date('2026-01-01'))
    const stale = store.replace('u1', 'week-01', games, 0, [{ gameId: 'g1', team: 'B', confidence: 1 }], new Date('2026-01-01'))
    expect(first.status).toBe(200)
    expect(stale).toMatchObject({ status: 409, code: 'STALE_DRAFT', draftRevision: 1 })
  })
})
