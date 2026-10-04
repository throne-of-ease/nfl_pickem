import { test, expect } from '@playwright/test'

test('iPhone 12 charts keep readable labels, compact spacing, and controls in view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone12pro')
  await page.goto('/?scenario=final&pool=week-01')
  await page.getByRole('button', { name: 'Charts' }).click()
  const card = page.locator('.chart-card-cumulative-points')
  const potential = card.getByRole('checkbox', { name: 'Show potential' })
  await expect(potential).toBeChecked()
  expect(await card.locator('svg.chart text').filter({ hasText: /^0$/ }).count()).toBeGreaterThanOrEqual(1)
  const layout = await page.evaluate(() => {
    const card = document.querySelector('.chart-card-cumulative-points')
    const heading = card.querySelector('.chart-heading').getBoundingClientRect()
    const toggle = card.querySelector('.potential-toggle').getBoundingClientRect()
    const svg = card.querySelector('svg.chart').getBoundingClientRect()
    const description = card.querySelector('.chart-description').getBoundingClientRect()
    const charts = [...document.querySelectorAll('.chart-scroll')].map((scroll) => {
      const chart = scroll.querySelector('svg.chart')
      return { fontSize: parseFloat(getComputedStyle(chart.querySelector('text')).fontSize) * chart.getBoundingClientRect().width / chart.viewBox.baseVal.width, width: scroll.clientWidth, contentWidth: scroll.scrollWidth }
    })
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, headingBottom: heading.bottom, toggleX: toggle.x, cardMiddle: card.getBoundingClientRect().x + card.getBoundingClientRect().width / 2, svgTop: svg.top, svgBottom: svg.bottom, descriptionTop: description.top, charts }
  })
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport)
  expect(layout.toggleX).toBeGreaterThan(layout.cardMiddle)
  expect(layout.svgTop - layout.headingBottom).toBeLessThan(16)
  expect(layout.descriptionTop - layout.svgBottom).toBeLessThan(12)
  expect(layout.charts.every((chart) => chart.fontSize >= 10)).toBe(true)
  expect(layout.charts.every((chart) => chart.contentWidth >= chart.width)).toBe(true)
  await card.screenshot({ path: testInfo.outputPath('iphone12-chart.png') })
  await page.locator('.chart-card-current-week').screenshot({ path: testInfo.outputPath('iphone12-current-week.png') })
  await page.locator('.chart-card-weekly-points').screenshot({ path: testInfo.outputPath('iphone12-weekly-points.png') })
  await page.locator('.chart-card-team-net-vs-model').screenshot({ path: testInfo.outputPath('iphone12-team-chart.png') })
  await potential.uncheck()
  await expect(card.locator('svg.chart polyline')).toHaveCount(4)
})
