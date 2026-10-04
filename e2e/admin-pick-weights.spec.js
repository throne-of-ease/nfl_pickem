import { test, expect } from '@playwright/test'

const games = [
  { id: 'g1', away_team: 'PIT', home_team: 'BUF', predictor_home: .9, home_moneyline: 150, away_moneyline: -180, gotw: true },
  { id: 'g2', away_team: 'DAL', home_team: 'PHI', predictor_home: .6, home_moneyline: -180, away_moneyline: 150 },
  { id: 'g3', away_team: 'ATL', home_team: 'TB', predictor_home: .7, home_moneyline: -130, away_moneyline: 110 },
  { id: 'g4', away_team: 'SEA', home_team: 'SF', predictor_home: null, home_moneyline: null, away_moneyline: null },
].map((game, index) => ({ ...game, pool_key: 'week-02', kickoff: `2099-09-20T${17 + index}:00:00Z`, status: 'scheduled' }))
const picks = games.map((game, index) => ({ gameId: game.id, team: index === 2 ? null : game.home_team, confidence: index + 1 }))

async function openPicks(page, admin) {
  // User metadata is deliberately untrusted; the server viewer role controls access.
  const session = { access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, user: { id: 'viewer', user_metadata: { isAdmin: true } } }
  await page.addInitScript(value => localStorage.setItem('nfl-pickem-session-v1', JSON.stringify(value)), session)
  await page.route('**/a.espncdn.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }))
  await page.route('**/auth/v1/token*', route => route.fulfill({ json: session }))
  await page.route('**/rest/v1/rpc/get_season_data', route => route.fulfill({ json: { profiles: [{ id: 'viewer', name: 'Pat' }], games, revealedPicks: [], viewer: { id: 'viewer', name: 'Pat', isAdmin: admin } } }))
  await page.route('**/rest/v1/rpc/get_my_draft', route => route.fulfill({ json: { draftRevision: 1, picks } }))
  await page.route('**/rest/v1/rpc/get_chart_data', route => route.fulfill({ json: { profiles: [{ id: 'viewer', name: 'Pat' }], games, revealedPicks: [] } }))
  await page.route('**/rest/v1/rpc/replace_picks', route => route.fulfill({ json: { draftRevision: 2 } }))
  await page.goto('/?pool=week-02')
  await expect(page.getByTestId('overview-row-g1')).toBeVisible()
  await page.getByRole('button', { name: 'My picks', exact: true }).click()
  await expect(page.getByTestId('game-row-g1')).toBeVisible()
}

async function checkLayout(page) {
  const layout = await page.locator('.game.with-weights').evaluateAll(rows => rows.map(row => {
    const confidence = row.querySelector('.confidence').getBoundingClientRect()
    const weight = row.querySelector('.pick-weight').getBoundingClientRect()
    const bounds = row.getBoundingClientRect()
    const elements = [...row.querySelectorAll('.pick-weight, .pick-weight span, .teams label, .confidence select')]
    return { rightOfConfidence: weight.left >= confidence.right, contained: elements.every(element => {
      const rect = element.getBoundingClientRect()
      return rect.left >= bounds.left && rect.right <= bounds.right && rect.right <= innerWidth && element.scrollWidth <= element.clientWidth + 1
    }) }
  }))
  expect(layout).toHaveLength(4)
  expect(layout.every(row => row.rightOfConfidence && row.contained)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('admin comparisons follow model, team and confidence changes and fit iPhone widths', async ({ page }, testInfo) => {
  await openPicks(page, true)
  const first = page.getByTestId('pick-weight-g1')
  await expect(first).toHaveAttribute('aria-label', 'Overweight PIT by 2; underweight BUF by 2 versus AVG')
  await expect(page.getByTestId('pick-weight-g3')).toHaveAttribute('aria-label', 'Select a team to compare with the model')
  await expect(page.getByTestId('pick-weight-g4')).toHaveAttribute('aria-label', 'AVG model unavailable')
  await checkLayout(page)
  await page.getByLabel('Pick probability model').selectOption('moneyline')
  await expect(first).toHaveAttribute('aria-label', 'Overweight BUF by 13; underweight PIT by 13 versus ML')
  await page.getByLabel('Pick probability model').selectOption('predictor')
  await expect(first).toHaveAttribute('aria-label', 'Overweight PIT by 2; underweight BUF by 2 versus FPI')
  await page.getByLabel('PIT at BUF confidence').selectOption('3')
  await expect(first).toHaveText('vs FPIMatched 0')
  await page.getByTestId('game-row-g1').getByRole('radio', { name: /PIT/ }).check()
  await expect(first).toHaveAttribute('aria-label', 'Overweight PIT by 16; underweight BUF by 16 versus FPI')
  await checkLayout(page)
  await page.screenshot({ path: testInfo.outputPath('admin-my-picks.png'), fullPage: true })
  if (testInfo.project.name === 'iphone12pro') {
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await checkLayout(page)
    }
  }
})

test('regular players never receive weight cells, headers or admin layout even with spoofed metadata', async ({ page }) => {
  await openPicks(page, false)
  await expect(page.locator('.pick-weight, .pick-weight-help, .with-weights')).toHaveCount(0)
  await expect(page.getByText(/Weight vs/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0)
  await page.getByLabel('Pick probability model').selectOption('predictor')
  await expect(page.locator('.pick-weight, .with-weights')).toHaveCount(0)
})
