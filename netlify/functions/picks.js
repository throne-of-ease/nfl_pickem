import { authenticatedUser, response, supabase } from './utils/response.js'

export async function handler(event) {
  const pool = event.queryStringParameters?.pool
  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!pool || !token) return response(400, { code: 'BAD_REQUEST' })
  try {
    if (event.httpMethod === 'GET') {
      const result = await supabase(`rpc/get_my_draft`, { method: 'POST', token, body: { p_pool_key: pool } })
      return response(200, result)
    }
    if (event.httpMethod === 'PUT') {
      const { expectedDraftRevision, picks } = JSON.parse(event.body ?? '{}')
      const user = await authenticatedUser(token)
      const result = await supabase('rpc/replace_picks_service', { method: 'POST', service: true, body: { p_user_id: user.id, p_pool_key: pool, p_expected_revision: expectedDraftRevision, p_picks: picks } })
      return response(200, result)
    }
    return response(405, { code: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    const code = error.data?.code ?? error.data?.message ?? 'SERVER_ERROR'
    const status = code === 'STALE_DRAFT' ? 409 : ['INVALID_CONFIDENCE_SET', 'INVALID_TEAM', 'LOCKED_GAME_CHANGED', 'UNKNOWN_GAME', 'POOL_CLOSED'].includes(code) ? 422 : error.status === 401 ? 401 : 500
    return response(status, { code })
  }
}
