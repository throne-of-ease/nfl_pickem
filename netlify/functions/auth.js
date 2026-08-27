import { response, supabaseAuth } from './utils/response.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return response(405, { code: 'METHOD_NOT_ALLOWED' })
  try {
    const { action, email, password, displayName, refreshToken } = JSON.parse(event.body ?? '{}')
    if (action === 'refresh' && refreshToken) return response(200, await supabaseAuth('token?grant_type=refresh_token', { body: { refresh_token: refreshToken } }))
    if (!email || !password) return response(400, { code: 'EMAIL_AND_PASSWORD_REQUIRED' })
    if (action === 'register') {
      const name = displayName?.trim()
      if (!name || name.length > 40 || password.length < 8) return response(422, { code: 'INVALID_REGISTRATION' })
      await supabaseAuth('admin/users', { service: true, body: { email, password, email_confirm: true, user_metadata: { display_name: name } } })
    } else if (action !== 'login') return response(400, { code: 'UNKNOWN_ACTION' })
    return response(action === 'register' ? 201 : 200, await supabaseAuth('token?grant_type=password', { body: { email, password } }))
  } catch (error) {
    const duplicate = /already|registered|exists/i.test(error.message)
    return response(duplicate ? 409 : error.status === 400 ? 401 : 500, { code: duplicate ? 'EMAIL_ALREADY_REGISTERED' : error.status === 400 ? 'INVALID_LOGIN' : 'AUTH_ERROR' })
  }
}
