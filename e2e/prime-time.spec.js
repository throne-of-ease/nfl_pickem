import { test, expect } from '@playwright/test'

test('prime-time season totals, filters, live scoring, models and export work on every viewport', async ({ page }, testInfo) => {
  const session = { access_token: 'prime-time-test', refresh_token: 'prime-time-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'alex' } }
  const profiles = [{ id: 'alex', name: 'Alex' }, { id: 'blair', name: 'Blair' }, { id: 'casey', name: 'Casey' }, { id: 'devon', name: 'Devon' }]
  const games = [
    ['thu', 'week-01', '2026-09-11T00:20:00Z', true],
    ['fri', 'week-01', '2026-09-12T00:00:00Z'],
    ['sun', 'week-01', '2026-09-14T00:20:00Z'],
    ['mon1', 'week-01', '2026-09-14T23:00:00Z'],
    ['mon2', 'week-01', '2026-09-15T02:00:00Z'],
    ['day', 'week-01', '2026-09-13T17:00:00Z'],
    ['wed', 'week-02', '2024-12-25T18:00:00Z'],
    ['live', 'week-02', '2026-09-21T00:20:00Z'],
  ].map(([id, pool_key, kickoff, gotw]) => ({ id, pool_key, kickoff, gotw: Boolean(gotw), away_team: 'DAL', home_team: 'PHI', status: id === 'live' ? 'live' : 'final', away_score: 10, home_score: 20, predictor_home: .7, home_moneyline: -200, away_moneyline: 170 }))
  const revealedPicks = games.flatMap((game, index) => profiles.slice(0, 3).map(profile => ({ userId: profile.id, poolKey: game.pool_key, gameId: game.id, team: profile.id === 'blair' ? 'DAL' : 'PHI', confidence: game.pool_key === 'week-01' ? index + 1 : index - 5 })))
  await page.addInitScript(value => localStorage.setItem('nfl-pickem-session-v1', JSON.stringify(value)), session)
  await page.route('**/auth/v1/token?grant_type=refresh_token', route => route.fulfill({ json: session }))
  await page.route('**/cdn.espn.com/**', route => route.fulfill({ json: { content: { sbData: { season: { year: 2026, type: 2 }, week: { number: 2 }, events: [] } } } }))
  await page.route('**/site.api.espn.com/**', route => route.fulfill({ json: { events: [] } }))
  await page.route('**/a.espncdn.com/**', route => route.fulfill({ status: 204 }))
  await page.route('**/rest/v1/rpc/get_season_data', route => route.fulfill({ json: { games: games.filter(game => game.pool_key === route.request().postDataJSON().p_pool_key), profiles, revealedPicks, viewer: { id: 'alex', name: 'Alex' } } }))
  await page.route('**/rest/v1/rpc/get_my_draft', route => route.fulfill({ json: { draftRevision: 0, picks: revealedPicks.filter(pick => pick.userId === 'alex' && pick.poolKey === route.request().postDataJSON().p_pool_key) } }))
  await page.route('**/rest/v1/rpc/get_chart_data', route => route.fulfill({ json: { games, profiles, revealedPicks } }))
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?pool=week-02')
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  const card = page.locator('.chart-card-prime-time-points')
  const filter = card.getByLabel('Prime-time games filter')
  await expect(filter).toHaveValue('all')
  await expect(filter.locator('option')).toHaveCount(4)
  await expect(card.getByRole('img', { name: 'Prime-time games points, all' })).toBeVisible()
  await card.getByRole('button', { name: 'View chart data' }).click()
  const table = card.getByRole('table', { name: 'Prime-time games points' })
  const points = name => table.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) }).getByRole('cell').last()
  await expect(points('Alex')).toHaveText('23.0')
  await expect(points('Blair')).toHaveText('0.0')
  await expect(points('Devon')).toHaveText('0.0')
  for (const [category, total] of [['tnf', '9.0'], ['snf', '5.0'], ['mnf', '9.0'], ['all', '23.0']]) {
    await filter.selectOption(category)
    await expect(points('Alex')).toHaveText(total)
  }
  await page.getByRole('checkbox', { name: 'Include provisional live scores' }).uncheck()
  await expect(points('Alex')).toHaveText('21.0')
  await filter.selectOption('snf')
  await expect(points('Alex')).toHaveText('3.0')
  await page.getByRole('checkbox', { name: 'Include model picks' }).check()
  await expect(table.locator('tbody tr')).toHaveCount(7)
  await expect(points('FPI')).toHaveText('4.0')
  await filter.selectOption('all')
  await expect(points('FPI')).toHaveText('24.0')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await card.screenshot({ path: testInfo.outputPath('prime-time-light.png') })
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await card.screenshot({ path: testInfo.outputPath('prime-time-dark.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await card.locator('.chart-scroll').evaluate(scroll => scroll.scrollWidth <= scroll.clientWidth + 1)).toBe(true)
  const pending = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Download chart as PNG' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('prime-time-points.png')
  expect(await download.failure()).toBeNull()
  expect(errors).toEqual([])
})
