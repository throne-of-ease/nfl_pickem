import { test, expect } from '@playwright/test'

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
  await page.route('**/api/auth', (route) => route.fulfill({ json: { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: 'real-user', email: 'pat@example.com' } } }))
  await page.route('**/api/season-data?pool=*', (route) => route.fulfill({ json: { games: [], profiles: [{ id: 'real-user', name: 'Pat' }], revealedPicks: [], asOf: '2026-08-27T18:00:00Z' } }))
  await page.route('**/api/picks?pool=*', (route) => route.fulfill({ json: { draftRevision: 0, picks: [] } }))
  await page.goto('/')
  await expect(page.getByText('No email confirmation is required.')).toBeVisible()
  await page.getByLabel('Display name').fill('Pat')
  await page.getByLabel('Email').fill('pat@example.com')
  await page.getByLabel('Password').fill('long-enough')
  await page.getByRole('button', { name: 'Register and play' }).click()
  await expect(page.getByRole('heading', { name: 'Preseason 3' })).toBeVisible()
  await expect(page.locator('.signed-in')).toContainText('Pat')
  await expect(page.getByLabel('Active user')).toHaveCount(0)
})

for (const state of ['scheduled', 'live', 'final', 'playoff', 'missing-data', 'stale-data', 'validation-error', 'preseason-rehearsal']) {
  test(`captures ${state} state`, async ({ page }, testInfo) => {
    await page.goto(`/?scenario=${state}`)
    if (state === 'playoff') await page.getByLabel('Pool').selectOption('super-bowl')
    await page.screenshot({ path: testInfo.outputPath(`${state}.png`), fullPage: true })
  })
}
