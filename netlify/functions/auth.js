import { response, supabaseAuth } from './utils/response.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return response(405, { code: 'METHOD_NOT_ALLOWED' })
  try {
    const { action, username, email, password, displayName, refreshToken } = JSON.parse(event.body ?? '{}')
    if (action === 'refresh' && refreshToken) return response(200, await supabaseAuth('token?grant_type=refresh_token', { body: { refresh_token: refreshToken } }))
    const identifier = username?.trim() || email?.trim()
    if (!identifier || !password) return response(400, { code: 'USERNAME_AND_PASSWORD_REQUIRED' })
    const authEmail = username?.trim() ? `${username.trim().toLowerCase()}@accounts.nfl-pickem.invalid` : email.trim()
    if (action === 'register') {
      const name = displayName?.trim()
      if (!username?.trim() || !/^[a-z0-9][a-z0-9_.-]{2,31}$/i.test(username.trim()) || !name || name.length > 40 || password.length < 8) return response(422, { code: 'INVALID_REGISTRATION' })
      await supabaseAuth('admin/users', { service: true, body: { email: authEmail, password, email_confirm: true, user_metadata: { display_name: name, username: username.trim().toLowerCase(), contact_email: email?.trim() || null } } })
    } else if (action !== 'login') return response(400, { code: 'UNKNOWN_ACTION' })
    return response(action === 'register' ? 201 : 200, await supabaseAuth('token?grant_type=password', { body: { email: authEmail, password } }))
  } catch (error) {
    const duplicate = /already|registered|exists/i.test(error.message)
    return response(duplicate ? 409 : error.status === 400 ? 401 : 500, { code: duplicate ? 'USERNAME_ALREADY_REGISTERED' : error.status === 400 ? 'INVALID_LOGIN' : 'AUTH_ERROR' })
  }
}
