import { response, supabase } from './utils/response.js'
import { POOLS } from '../../src/domain.js'

export async function handler(event) {
  const pool = event.queryStringParameters?.pool
  if (!pool) return response(400, { code: 'BAD_REQUEST' })
  try {
    const metadata = POOLS.find((item) => item.key === pool)
    if (!metadata) return response(404, { code: 'UNKNOWN_POOL' })
    // The browser owns ESPN reads, including live scores. This legacy endpoint
    // is read-only; schedule/admin synchronization uses the protected Edge Function.
    const data = await supabase('rpc/get_season_data', { method: 'POST', service: true, body: { p_pool_key: pool } })
    if (!data) return response(503, { code: 'NO_SCHEDULE_AVAILABLE' })
    return response(200, data)
  } catch (error) {
    return response(error.status === 404 ? 404 : 500, { code: 'SERVER_ERROR' })
  }
}
