export const response = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) })

export const requiredEnv = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export async function supabase(path, { method = 'GET', body, token, service = false } = {}) {
  const key = requiredEnv(service ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY')
  const result = await fetch(`${requiredEnv('SUPABASE_URL')}/rest/v1/${path}`, { method, headers: { apikey: key, authorization: `Bearer ${service ? key : token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
  const data = await result.json().catch(() => null)
  if (!result.ok) throw Object.assign(new Error(data?.message ?? 'Database request failed'), { status: result.status, data })
  return data
}

export async function authenticatedUser(token) {
  const key = requiredEnv('SUPABASE_ANON_KEY')
  const result = await fetch(`${requiredEnv('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` } })
  if (!result.ok) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  return result.json()
}
