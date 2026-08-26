import { describe, expect, it } from 'vitest'
import { applyLiveSample, ingestEspnResponse, normalizeEvent } from '../src/espnAdapter.js'

describe('ESPN fixture ingestion', () => {
  it.each([['pre','scheduled'],['in','live'],['post','final']])('normalizes %s to %s', (input, expected) => {
    expect(normalizeEvent({ id: 1, date: '2026-08-27T18:00:00Z', status: { type: { state: input } } }).status).toBe(expected)
  })

  it.each([undefined, {}, { events: [] }, { events: [{ id: null, status: 'wat' }] }])('retains last-good data for malformed or empty input', (payload) => {
    const result = ingestEspnResponse(payload, [{ id: 'last-good' }], new Date('2026-01-01'))
    expect(result.games).toEqual([{ id: 'last-good' }])
    expect(result.freshness).toBe('stale')
  })

  it('locks and freezes valid pregame input at the first live transition', () => {
    const scheduled = { id: 'g1', status: 'scheduled', predictorHome: .6, homeMoneyline: -120, awayMoneyline: 110 }
    const live = applyLiveSample(scheduled, { status: 'live', capturedAt: 't1' })
    const later = applyLiveSample(live, { status: 'live', predictorHome: .9, capturedAt: 't2' })
    expect(live.locked).toBe(true)
    expect(later.pregameSnapshot).toEqual(live.pregameSnapshot)
  })
})
