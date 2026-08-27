import { response, supabase } from './utils/response.js'
import { POOLS } from '../../src/domain.js'
import { fetchEspnPool } from '../../src/espnAdapter.js'

export async function handler(event) {
  const pool = event.queryStringParameters?.pool
  if (!pool) return response(400, { code: 'BAD_REQUEST' })
  try {
    const metadata = POOLS.find((item) => item.key === pool)
    if (!metadata) return response(404, { code: 'UNKNOWN_POOL' })
    try {
      const { games } = await fetchEspnPool(metadata, { signal: AbortSignal.timeout(12000) })
      await supabase('pools?on_conflict=key', { method: 'POST', service: true, headers: { prefer: 'resolution=merge-duplicates' }, body: [{ key: metadata.key, label: metadata.label, phase: metadata.phase, espn_season: metadata.espnSeason, espn_season_type: metadata.espnSeasonType, espn_week: metadata.espnWeek, counts_toward_season: metadata.countsTowardSeason, accepts_late_picks: Boolean(metadata.acceptsLatePicks), updated_at: new Date().toISOString() }] })
      if (games.length) await supabase('games?on_conflict=id', { method: 'POST', service: true, headers: { prefer: 'resolution=merge-duplicates' }, body: games.map((game) => ({ id: game.id, pool_key: pool, kickoff: game.kickoff, away_team: game.away, home_team: game.home, status: game.status, away_score: game.awayScore, home_score: game.homeScore, gotw: Boolean(game.gotw), predictor_home: game.predictorHome, home_moneyline: game.homeMoneyline, away_moneyline: game.awayMoneyline })) })
    } catch { /* serve the last synchronized slate when ESPN is unavailable */ }
    const data = await supabase('rpc/get_season_data', { method: 'POST', service: true, body: { p_pool_key: pool } })
    if (!data) return response(503, { code: 'NO_SCHEDULE_AVAILABLE' })
    return response(200, data)
  } catch (error) {
    return response(error.status === 404 ? 404 : 500, { code: 'SERVER_ERROR' })
  }
}
