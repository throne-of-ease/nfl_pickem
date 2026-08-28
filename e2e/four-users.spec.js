import { test, expect } from '@playwright/test'

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

test.beforeEach(async ({ page }) => {
  await page.route('**/a.espncdn.com/**', (route) => route.fulfill({ contentType: 'image/png', body: ONE_PIXEL_PNG }))
})

test('registers three Week 3 players with isolated persistent picks', async ({ page }, testInfo) => {
  await page.goto('/?scenario=scheduled&pool=preseason-03')
  await page.getByRole('button', { name: 'Set up 3 players' }).click()
  await page.getByLabel('Player 1 name').fill('Pat')
  await page.getByLabel('Player 2 name').fill('Quinn')
  await page.getByLabel('Player 3 name').fill('Riley')
  await page.getByRole('button', { name: 'Create players' }).click()
  await page.getByRole('button', { name: 'My picks' }).click()

  const switcher = page.getByLabel('Active user')
  await expect(page.locator('.game')).toHaveCount(16)
  await expect(page.getByRole('img', { name: /logo$/ })).toHaveCount(32)
  await expect.poll(() => page.getByRole('img', { name: /logo$/ }).evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true)
  await expect(page.getByRole('heading', { name: 'Preseason 3' })).toBeVisible()

  await page.getByRole('radio', { name: /PIT/ }).check()
  await page.getByLabel('PIT at BUF confidence').selectOption('16')
  await switcher.selectOption({ label: 'Quinn' })
  await page.getByRole('radio', { name: /BUF/ }).check()
  await page.getByLabel('PIT at BUF confidence').selectOption('15')
  await switcher.selectOption({ label: 'Riley' })
  await page.getByRole('radio', { name: /PIT/ }).check()
  await page.getByLabel('PIT at BUF confidence').selectOption('14')

  await page.reload()
  await expect(switcher).toHaveValue(/local-/)
  await page.getByRole('button', { name: 'My picks' }).click()
  await expect(page.getByRole('radio', { name: /PIT/ })).toBeChecked()
  await expect(page.getByLabel('PIT at BUF confidence')).toHaveValue('16')
  await switcher.selectOption({ label: 'Quinn' })
  await expect(page.getByRole('radio', { name: /BUF/ })).toBeChecked()
  await expect(page.getByLabel('PIT at BUF confidence')).toHaveValue('15')
  await switcher.selectOption({ label: 'Riley' })
  await expect(page.getByRole('radio', { name: /PIT/ })).toBeChecked()
  await expect(page.getByLabel('PIT at BUF confidence')).toHaveValue('14')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('week-3-three-players.png'), fullPage: true })
})

test('four users, charts, pools, and responsive states work', async ({ page }, testInfo) => {
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?scenario=preseason-rehearsal&pool=preseason-01')
  await expect(page.getByRole('heading', { name: 'Game overview' })).toBeVisible()
  await expect(page.locator('[data-testid^="overview-row-"]')).toHaveCount(4)
  await expect(page.getByRole('img', { name: /logo$/ })).toHaveCount(24)
  await expect.poll(() => page.getByRole('img', { name: /logo$/ }).evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (testInfo.project.name === 'mobile') {
    await page.locator('.overview-scroll').evaluate((element) => { element.scrollLeft = element.scrollWidth })
    expect(await page.locator('.overview-scroll').evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  }
  await page.getByRole('checkbox', { name: 'Include model picks' }).check()
  await expect(page.getByRole('columnheader', { name: /Predictor/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /Moneyline/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /Aggregate/ })).toBeVisible()
  const switcher = page.getByLabel('Active user')
  for (const name of ['Alex', 'Blair', 'Casey', 'Devon']) {
    await switcher.selectOption({ label: name })
    await expect(switcher).toHaveValue(`u${['Alex', 'Blair', 'Casey', 'Devon'].indexOf(name) + 1}`)
  }
  await expect(page.getByText('Rehearsal — does not count.')).toBeVisible()
  await page.getByLabel('Pool').selectOption('week-02')
  await page.getByRole('button', { name: 'Charts' }).click()
  await expect(page.locator('svg.chart')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Download PNG' })).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Share PNG' })).toHaveCount(4)
  for (const mode of ['points_percentage', 'correct_percentage', 'vs_leader', 'vs_total_leader']) {
    await page.getByLabel('Current week display mode').selectOption(mode)
    await expect(page.getByRole('img', { name: `Current week points, ${mode}` })).toBeVisible()
  }
  for (const mode of ['points_percentage', 'correct_percentage']) {
    await page.getByLabel('Points per week display mode').selectOption(mode)
    await expect(page.getByRole('img', { name: `Points per week, ${mode}` })).toBeVisible()
    await page.getByLabel('Game of the Week display mode').selectOption(mode)
    await expect(page.getByRole('img', { name: `Game of the Week points, ${mode}` })).toBeVisible()
  }
  await page.getByLabel('Current week display mode').selectOption('absolute')
  await page.getByLabel('Points per week display mode').selectOption('absolute')
  await page.getByLabel('Game of the Week display mode').selectOption('absolute')
  await page.screenshot({ path: testInfo.outputPath('charts.png'), fullPage: true })
  await page.getByRole('button', { name: 'Standings' }).click()
  await expect(page.locator('.leaderboard li')).toHaveCount(4)
  await page.getByRole('button', { name: 'Models' }).click()
  await expect(page.getByRole('columnheader', { name: 'Predictor' })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(4)
  await page.screenshot({ path: testInfo.outputPath('models.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('overview hides scheduled picks and scores live picks for all four users', async ({ page }) => {
  await page.goto('/?scenario=scheduled&pool=week-02')
  await expect(page.getByLabel('Pick hidden until kickoff')).toHaveCount(16)

  await page.goto('/?scenario=live&pool=week-02')
  await expect(page.locator('.overview-pick')).toHaveCount(4)
  await page.getByRole('checkbox', { name: 'Include provisional live scores' }).uncheck()
  await expect(page.locator('.overview-pick.pending')).toHaveCount(4)
  await expect(page.locator('.overview-pick.correct, .overview-pick.incorrect')).toHaveCount(0)
})

test('production registration starts a session without email confirmation', async ({ page }) => {
  const directEspnRequests = []
  page.on('request', (request) => { if (request.url().includes('cdn.espn.com')) directEspnRequests.push(request.url()) })
  await page.route('**/cdn.espn.com/**', (route) => route.abort())
  await page.route('**/rest/v1/rpc/get_registration_status', (route) => route.fulfill({ json: { registrationOpen: true } }))
  await page.route('**/auth/v1/signup', (route) => route.fulfill({ json: { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: 'real-user', email: 'pat@example.com' } } }))
  await page.route('**/rest/v1/rpc/get_season_data', (route) => route.fulfill({ json: { games: [{ id: 'g1', pool_key: 'preseason-03', kickoff: '2026-08-27T23:00:00Z', away_team: 'PIT', home_team: 'BUF', status: 'scheduled', away_score: 0, home_score: 0, gotw: false, locked_at: null }], profiles: [{ id: 'real-user', name: 'Pat' }], revealedPicks: [], viewer: { id: 'real-user', name: 'Pat', username: 'pat', isAdmin: false }, asOf: '2026-08-27T18:00:00Z' } }))
  await page.route('**/rest/v1/rpc/get_my_draft', (route) => route.fulfill({ json: { draftRevision: 0, picks: [] } }))
  await page.goto('/')
  await expect(page.getByText('Email is optional and never required.')).toBeVisible()
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Display name').fill('Pat')
  await page.getByLabel('Password').fill('long-enough')
  await page.getByRole('button', { name: 'Register and play' }).click()
  await expect(page.getByRole('heading', { name: 'Preseason 3' })).toBeVisible()
  await expect(page.locator('.signed-in')).toContainText('Pat')
  await expect(page.getByLabel('Active user')).toHaveCount(0)
  expect(directEspnRequests.length).toBeGreaterThan(0)
})

test('admin manages registration and overrides a submitted pick', async ({ page }) => {
  const session = { access_token: 'admin-access', refresh_token: 'admin-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'admin-user', email: 'admin@accounts.nfl-pickem.invalid' } }
  await page.addInitScript((value) => localStorage.setItem('nfl-pickem-session-v1', JSON.stringify(value)), session)
  await page.route('**/auth/v1/token?grant_type=refresh_token', (route) => route.fulfill({ json: session }))
  await page.route('**/cdn.espn.com/**', (route) => route.abort())
  await page.route('**/rest/v1/rpc/get_season_data', (route) => route.fulfill({ json: { games: [{ id: 'g1', pool_key: 'week-01', kickoff: '2026-09-01T23:00:00Z', away_team: 'A', home_team: 'B', status: 'final', away_score: 3, home_score: 7, gotw: false, locked_at: '2026-09-01T23:00:00Z' }], profiles: [{ id: 'player-1', name: 'Pat', username: 'pat' }], revealedPicks: [{ userId: 'player-1', gameId: 'g1', team: 'A', confidence: 1 }], viewer: { id: 'admin-user', name: 'Admin', username: 'admin', isAdmin: true }, registrationOpen: true, asOf: '2026-09-02T00:00:00Z' } }))
  await page.route('**/rest/v1/rpc/get_my_draft', (route) => route.fulfill({ json: { draftRevision: 0, picks: [] } }))
  await page.route('**/rest/v1/rpc/get_admin_data', (route) => route.fulfill({ json: { registrationOpen: true, players: [{ id: 'player-1', name: 'Pat', username: 'pat', contactEmail: null }], games: [{ id: 'g1', pool_key: 'week-01', kickoff: '2026-09-01T23:00:00Z', away_team: 'A', home_team: 'B', status: 'final', away_score: 3, home_score: 7, gotw: false, locked_at: '2026-09-01T23:00:00Z' }], picks: [{ userId: 'player-1', gameId: 'g1', team: 'A', confidence: 1 }] } }))
  await page.route('**/rest/v1/rpc/set_registration_open', (route) => route.fulfill({ json: { registrationOpen: false } }))
  await page.route('**/rest/v1/rpc/admin_replace_picks', async (route) => {
    const body = JSON.parse(route.request().postData())
    expect(body.p_user_id).toBe('player-1')
    expect(body.p_picks).toEqual([{ gameId: 'g1', team: 'B', confidence: 1 }])
    await route.fulfill({ json: { draftRevision: 1, picks: body.p_picks } })
  })
  await page.goto('/?pool=week-01')
  await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible()
  await page.getByRole('button', { name: 'Admin' }).click()
  await expect(page.getByRole('heading', { name: 'Registered players' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Pat', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop new registrations' }).click()
  await expect(page.getByText('NEW REGISTRATIONS STOPPED')).toBeVisible()
  await page.getByLabel('Pick').selectOption('B')
  await page.getByRole('button', { name: 'Save override' }).click()
  await expect(page.getByText('PICK OVERRIDE SAVED')).toBeVisible()
})

for (const state of ['scheduled', 'live', 'final', 'playoff', 'missing-data', 'stale-data', 'validation-error', 'preseason-rehearsal']) {
  test(`captures ${state} state`, async ({ page }, testInfo) => {
    await page.goto(`/?scenario=${state}`)
    if (state === 'playoff') await page.getByLabel('Pool').selectOption('super-bowl')
    await page.screenshot({ path: testInfo.outputPath(`${state}.png`), fullPage: true })
  })
}
