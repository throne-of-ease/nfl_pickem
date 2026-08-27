import { describe, expect, it } from 'vitest'
import { addPregameData, applyLiveSample, fetchEspnPool, ingestEspnResponse, normalizeEvent, normalizeScoreboard } from '../src/espnAdapter.js'

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

  it('normalizes every real scoreboard event and enriches pregame probabilities', async () => {
    const scoreboard = { content: { sbData: { events: [{
      id: '401', date: '2026-08-21T00:00Z', status: { type: { state: 'post' } }, competitions: [{ competitors: [
        { homeAway: 'home', score: '20', team: { abbreviation: 'HOU' } },
        { homeAway: 'away', score: '22', team: { abbreviation: 'LV' } },
      ] }],
    }] } } }
    const summary = { gamepackageJSON: {
      pickcenter: [{ homeTeamOdds: { moneyLine: 114 }, awayTeamOdds: { moneyLine: -135 } }],
      winprobability: [{ homeWinPercentage: .5257 }],
    } }
    const fetcher = async (url) => ({ ok: true, json: async () => url.includes('scoreboard') ? scoreboard : summary })
    const pool = { espnSeason: 2026, espnSeasonType: 1, espnWeek: 3 }

    expect(normalizeScoreboard(scoreboard)).toHaveLength(1)
    expect(addPregameData(normalizeScoreboard(scoreboard)[0], summary)).toMatchObject({ predictorHome: .5257, homeMoneyline: 114, awayMoneyline: -135 })
    expect(addPregameData(normalizeScoreboard(scoreboard)[0], { gamepackageJSON: { predictor: { homeTeam: { gameProjection: null } } } })).toMatchObject({ predictorHome: null, homeMoneyline: null, awayMoneyline: null })
    await expect(fetchEspnPool(pool, { fetcher })).resolves.toMatchObject({ games: [{ id: '401', away: 'LV', home: 'HOU', status: 'final', predictorHome: .5257 }] })
  })
})
