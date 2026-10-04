import { test, expect } from '@playwright/test'

test('chart updates show losses, natural ranges, and live team outcomes', async ({ page }, testInfo) => {
  const session = { access_token: 'chart-check', refresh_token: 'chart-check-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'chart-player' } }
  const profiles = [{ id: 'chart-player', name: 'Player' }, { id: 'chart-benchmark', name: 'Benchmark' }]
  const games = [
    { id: 'finished', away_team: 'DAL', home_team: 'PHI', status: 'final', away_score: 10, home_score: 20, gotw: true },
    { id: 'ongoing', away_team: 'KC', home_team: 'BUF', status: 'live', away_score: 7, home_score: 14 },
    { id: 'future', away_team: 'NYJ', home_team: 'NE', status: 'scheduled', away_score: 0, home_score: 0 },
  ].map(game => ({ ...game, pool_key: 'week-01', kickoff: game.status === 'scheduled' ? '2099-10-01T17:00:00Z' : '2026-01-01T17:00:00Z', predictor_home: .7, home_moneyline: -200, away_moneyline: 170 }))
  const revealedPicks = games.flatMap((game, index) => profiles.map(profile => ({ userId: profile.id, poolKey: 'week-01', gameId: game.id, team: profile.id === 'chart-player' ? game.away_team : game.home_team, confidence: index + 1 })))
  await page.addInitScript(value => localStorage.setItem('nfl-pickem-session-v1', JSON.stringify(value)), session)
  await page.route('**/auth/v1/token?grant_type=refresh_token', route => route.fulfill({ json: session }))
  await page.route('**/cdn.espn.com/**', route => route.fulfill({ json: { content: { sbData: { season: { year: 2026, type: 2 }, week: { number: 1 }, events: [] } } } }))
  await page.route('**/a.espncdn.com/**', route => route.fulfill({ status: 204 }))
  await page.route('**/rest/v1/rpc/get_season_data', route => route.fulfill({ json: { games, profiles, revealedPicks, viewer: { id: 'chart-player', name: 'Player' } } }))
  await page.route('**/rest/v1/rpc/get_my_draft', route => route.fulfill({ json: { draftRevision: 0, picks: revealedPicks.filter(pick => pick.userId === 'chart-player') } }))
  await page.route('**/rest/v1/rpc/get_chart_data', route => route.fulfill({ json: { games, profiles, revealedPicks } }))
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('?pool=week-01')
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  const current = page.locator('.chart-card-current-week')
  await current.getByLabel('Current week display mode').selectOption('points_lost')
  await expect(current.locator('[data-potential="Player"]')).toBeVisible()
  await expect(current).toContainText('maximum possible losses')
  const losses = await current.locator('svg.chart > g > rect > title').allTextContents()
  expect(losses[0]).toMatch(/^Benchmark: 0/)
  expect(losses[1]).toMatch(/^Player: -/)
  await expect(current.locator('[data-potential="Player"]')).toContainText('-')
  const ticks = await page.locator('.chart-card-weekly-points [data-axis-tick]').evaluateAll(elements => elements.map(el => Number(el.getAttribute('data-axis-tick'))))
  expect(ticks.length).toBeGreaterThan(1)
  expect(ticks.every(Number.isInteger)).toBe(true)
  const team = page.locator('.chart-card-team-net-vs-model')
  await team.getByLabel('Net points benchmark', { exact: true }).selectOption('player:chart-benchmark')
  await team.getByLabel('Net points vs benchmark week').selectOption('week-01')
  await expect(team.getByRole('checkbox', { name: 'Include live games' })).toBeChecked()
  await expect(team.locator('[data-live-bar="KC"]')).toBeVisible()
  await expect(team.locator('[data-team-row="KC"] [data-team-outcome="Trailing"]')).toBeVisible()
  await expect(team.locator('[data-team-row="KC"] [data-team-label]')).toHaveText('KC')
  await team.getByLabel('Net points vs benchmark view').selectOption('exposure')
  await expect(team.locator('[data-live-bar]')).toHaveCount(2)
  await expect(team.locator('[data-team-row="BUF"] [data-team-outcome="Leading"]')).toBeVisible()
  await expect(team.locator('[data-team-row="DAL"] [data-team-outcome="Lost"]')).toBeVisible()
  await team.screenshot({ path: testInfo.outputPath('live-exposure.png') })
  await team.getByLabel('Net points vs benchmark week').selectOption('all')
  await expect(team.locator('[data-team-row="DAL"] [data-team-label]')).toHaveText('DAL (W:0/L:1)')
  await expect(team.locator('[data-team-outcome]')).toHaveCount(0)
  await team.screenshot({ path: testInfo.outputPath('compact-total-exposure.png') })
  await team.getByRole('checkbox', { name: 'Include live games' }).uncheck()
  await expect(team.locator('[data-live-bar]')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
