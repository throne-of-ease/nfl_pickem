import { test, expect } from '@playwright/test'

test('theme defaults dark, persists, and renders all views without overflow', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/a.espncdn.com/**', route => route.abort())
  await page.goto('/?scenario=final&pool=week-01')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
  for (const view of ['Overview', 'My picks', 'Charts', 'Win probs.']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (view === 'Charts') {
      await expect(page.locator('.chart text').first()).toHaveCSS('fill', 'rgb(23, 34, 49)')
      await expect(page.locator('.chart > rect').first()).toHaveCSS('fill', 'rgb(240, 240, 240)')
    }
    await page.screenshot({ path: testInfo.outputPath(`light-${view.replaceAll(' ', '-')}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.reload()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 17, 24)')
  expect(errors).toEqual([])
})

test('theme switch sits beside mobile player menu and at desktop right', async ({ page }, testInfo) => {
  const session = { access_token: 'theme-access', refresh_token: 'theme-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'theme-user' } }
  await page.addInitScript(value => localStorage.setItem('nfl-pickem-session-v1', JSON.stringify(value)), session)
  await page.route('**/auth/v1/token?grant_type=refresh_token', route => route.fulfill({ json: session }))
  await page.route('**/cdn.espn.com/**', route => route.fulfill({ json: { content: { sbData: { season: { year: 2026, type: 2 }, week: { number: 3 }, events: [] } } } }))
  await page.route('**/rest/v1/rpc/get_season_data', route => route.fulfill({ json: { games: [], profiles: [{ id: 'theme-user', name: 'Christopher' }], revealedPicks: [], viewer: { id: 'theme-user', name: 'Christopher', isAdmin: false } } }))
  await page.route('**/rest/v1/rpc/get_my_draft', route => route.fulfill({ json: { draftRevision: 0, picks: [] } }))
  await page.goto('/?pool=week-03')
  const toggle = page.getByRole('button', { name: 'Switch to light mode' })
  await expect(page.locator('.signed-in')).toBeVisible()
  await toggle.click()
  const box = await page.locator('.theme-toggle').boundingBox()
  const brand = await page.locator('header .brand').boundingBox()
  expect(Math.abs(box.y - brand.y)).toBeLessThan(12)
  if (testInfo.project.name !== 'desktop') {
    const menu = await page.getByRole('button', { name: 'Player options' }).boundingBox()
    expect(menu.x).toBeGreaterThanOrEqual(box.x + box.width)
    expect(menu.x - box.x - box.width).toBeLessThan(15)
  } else {
    const actions = await page.locator('.account-actions').boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(actions.x + actions.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('light-signed-in.png'), fullPage: true })
})
