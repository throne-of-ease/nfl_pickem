import { test, expect } from '@playwright/test'

test('team records remain visible and contained across phone widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Checks an explicit range of phone viewport sizes')
  await page.route('**/a.espncdn.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }))
  for (const scenario of ['scheduled', 'live', 'final']) {
    await page.goto(`/?scenario=${scenario}&pool=week-02`)
    await page.getByRole('button', { name: 'My picks', exact: true }).click()
    await expect(page.locator('.teams .team-record')).toHaveCount(6)
    for (const width of [320, 360, 375, 390, 414, 430, 480, 600, 760]) {
      await page.setViewportSize({ width, height: 844 })
      const layout = await page.locator('.teams .team-record').evaluateAll(records => records.map(record => {
        const label = record.closest('label')
        const bounds = label.getBoundingClientRect()
        const rect = record.getBoundingClientRect()
        const logo = label.querySelector('.team-logo').getBoundingClientRect()
        return {
          text: record.textContent.trim(),
          visible: getComputedStyle(record).display !== 'none' && rect.width > 0 && rect.height > 0,
          readable: parseFloat(getComputedStyle(record).fontSize) >= 9,
          contained: rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom,
          afterLogo: rect.left >= logo.right,
          fitsLabel: label.scrollWidth <= label.clientWidth + 1,
        }
      }))
      expect(layout.every(record => record.visible && record.readable && record.contained && record.afterLogo && record.fitsLabel), `${scenario} at ${width}px: ${JSON.stringify(layout)}`).toBe(true)
      expect(layout.some(record => record.text === '(5-6-1)')).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scenario} at ${width}px`).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath(`phone-records-${scenario}.png`), fullPage: true })
  }
})
