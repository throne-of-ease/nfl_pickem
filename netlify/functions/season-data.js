import { response, supabase } from './utils/response.js'

export async function handler(event) {
  const pool = event.queryStringParameters?.pool
  if (!pool) return response(400, { code: 'BAD_REQUEST' })
  try {
    const data = await supabase('rpc/get_season_data', { method: 'POST', service: true, body: { p_pool_key: pool } })
    return response(200, data)
  } catch (error) {
    return response(error.status === 404 ? 404 : 500, { code: 'SERVER_ERROR' })
  }
}
