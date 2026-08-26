import { test, expect } from '@playwright/test'

test('registers three Week 3 players with isolated persistent picks', async ({ page }, testInfo) => {
  await page.goto('/?pool=preseason-03')
  await page.getByRole('button', { name: 'Set up 3 players' }).click()
  await page.getByLabel('Player 1 name').fill('Pat')
  await page.getByLabel('Player 2 name').fill('Quinn')
  await page.getByLabel('Player 3 name').fill('Riley')
  await page.getByRole('button', { name: 'Create players' }).click()

  const switcher = page.getByLabel('Active user')
  await expect(page.locator('.game')).toHaveCount(16)
  await expect(page.getByText('Official 2026 NFL preseason Week 3 schedule · 16 games · August 27–29')).toBeVisible()

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
  await expect(page.getByRole('radio', { name: /PIT/ })).toBeChecked()
  await expect(page.getByLabel('PIT at BUF confidence')).toHaveValue('16')
  await switcher.selectOption({ label: 'Quinn' })
  await expect(page.getByRole('radio', { name: /BUF/ })).toBeChecked()
  await expect(page.getByLabel('PIT at BUF confidence')).toHaveValue('15')
  await switcher.selectOption({ label: 'Riley' })
  await expect(page.getByRole('radio', { name: /PIT/ })).toBeChecked()
  await expect(page.getByLabel('PIT at BUF confidence')).toHaveValue('14')
  await page.screenshot({ path: testInfo.outputPath('week-3-three-players.png'), fullPage: true })
})

test('four users, charts, pools, and responsive states work', async ({ page }, testInfo) => {
  await page.goto('/')
  const switcher = page.getByLabel('Active user')
  for (const name of ['Alex', 'Blair', 'Casey', 'Devon']) {
    await switcher.selectOption({ label: name })
    await expect(switcher).toHaveValue(`u${['Alex', 'Blair', 'Casey', 'Devon'].indexOf(name) + 1}`)
  }
  await expect(page.getByText('Rehearsal — does not count.')).toBeVisible()
  await page.getByRole('button', { name: 'Charts' }).click()
  await expect(page.locator('svg.chart')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Download PNG' })).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Share PNG' })).toHaveCount(4)
  await page.screenshot({ path: testInfo.outputPath('charts.png'), fullPage: true })
  await page.getByRole('button', { name: 'Standings' }).click()
  await expect(page.locator('.leaderboard li')).toHaveCount(4)
})

for (const state of ['scheduled', 'live', 'final', 'playoff', 'missing-data', 'stale-data', 'validation-error', 'preseason-rehearsal']) {
  test(`captures ${state} state`, async ({ page }, testInfo) => {
    await page.goto(`/?scenario=${state}`)
    if (state === 'playoff') await page.getByLabel('Pool').selectOption('super-bowl')
    await page.screenshot({ path: testInfo.outputPath(`${state}.png`), fullPage: true })
  })
}
