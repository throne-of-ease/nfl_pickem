import { afterEach, describe, expect, it, vi } from 'vitest'
import { handler } from '../netlify/functions/auth.js'

describe('registration function', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates an already-confirmed user and immediately returns a session', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable'
    process.env.SUPABASE_SECRET_KEY = 'secret'
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, JSON.parse(options.body), options.headers])
      return { ok: true, json: async () => url.includes('admin/users') ? { id: 'user-1' } : { access_token: 'access', refresh_token: 'refresh', user: { id: 'user-1' } } }
    }))
    const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ action: 'register', email: 'pat@example.com', password: 'long-enough', displayName: 'Pat' }) })
    expect(result.statusCode).toBe(201)
    expect(calls[0][1]).toMatchObject({ email: 'pat@example.com', email_confirm: true, user_metadata: { display_name: 'Pat' } })
    expect(calls[0][2]).toMatchObject({ apikey: 'secret' })
    expect(calls[0][2]).not.toHaveProperty('authorization')
    expect(JSON.parse(result.body)).toMatchObject({ access_token: 'access', user: { id: 'user-1' } })
  })
})
