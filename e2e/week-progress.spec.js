import { test, expect } from '@playwright/test'

test('weekly progress supports metrics, multiple players, grouping and week changes', async ({ page }, testInfo) => {
  await page.goto('/?scenario=final&pool=week-01')
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  const card = page.locator('.chart-card-week-progress')
  await expect(card.locator('svg.chart polyline')).toHaveCount(4)
  for (const metric of ['earned', 'lost', 'potential', 'net']) {
    await card.getByLabel('Week progress display mode').selectOption(metric)
    const individual = await card.locator('[data-end-label] text').allTextContents()
    await card.getByLabel('Week progress grouping').selectOption('kickoff')
    expect(await card.locator('[data-end-label] text').allTextContents()).toEqual(individual)
    await card.getByLabel('Week progress grouping').selectOption('game')
  }
  await expect(card.locator('[data-x-label]')).toHaveCount(5)
  expect(await card.locator('[data-x-label]').nth(1).textContent()).toContain(' @ ')
  expect(await card.locator('[data-x-label]').nth(1).getAttribute('transform')).toContain('rotate(90')
  for (const order of ['predictor', 'moneyline', 'aggregate', 'dev']) {
    const endpoint = await card.locator('[data-end-label] text').allTextContents()
    await card.getByLabel('Week progress order', { exact: true }).selectOption(order)
    expect(await card.locator('[data-end-label] text').allTextContents()).toEqual(endpoint)
    await card.getByLabel('Week progress sort direction').selectOption('ascending')
    expect(await card.locator('[data-end-label] text').allTextContents()).toEqual(endpoint)
  }
  await card.getByLabel('Week progress order', { exact: true }).selectOption('kickoff')
  await card.locator('summary').click()
  const choices = card.getByRole('checkbox')
  const remainingColor = await card.locator('polyline').nth(1).getAttribute('stroke')
  await choices.nth(0).uncheck()
  await expect(card.locator('polyline')).toHaveCount(3)
  expect(await card.locator('polyline').first().getAttribute('stroke')).toBe(remainingColor)
  await card.getByRole('button', { name: 'All players' }).click()
  await expect(card.locator('polyline')).toHaveCount(4)
  await card.locator('summary').click()
  await page.getByLabel('Include model picks', { exact: true }).check()
  await expect(card.locator('polyline')).toHaveCount(7)
  await page.getByLabel('Week', { exact: true }).selectOption('week-02')
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', 'Week 2 cumulative net impact')
  await card.getByRole('button', { name: 'View chart data' }).click()
  await expect(card.getByRole('table')).toBeVisible()
  const layout = await card.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth, pageWidth: document.documentElement.clientWidth, pageContent: document.documentElement.scrollWidth }))
  expect(layout.content).toBeLessThanOrEqual(layout.width + 1)
  expect(layout.pageContent).toBeLessThanOrEqual(layout.pageWidth + 1)
  await card.screenshot({ path: testInfo.outputPath('week-progress.png') })
})

test('correlation legend follows the actual off-diagonal sample range', async ({ page }, testInfo) => {
  await page.goto('/?scenario=final&pool=week-01')
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  const matrix = page.getByTestId('pick-correlation-matrix')
  const readScale = () => matrix.evaluate((element) => {
    const cells = [...element.querySelectorAll('[data-correlation-cell]')].filter((cell) => {
      const ids = cell.dataset.correlationCell.split(':')
      return ids[0] !== ids[1] && cell.textContent !== '—'
    })
    const scale = element.querySelector('[data-testid="correlation-scale"]')
    return { min: Number(scale.dataset.min), max: Number(scale.dataset.max), values: cells.map((cell) => Number(cell.textContent)), colors: new Set(cells.map((cell) => cell.style.background)).size }
  })
  for (const includeModels of [false, true]) {
    await page.getByLabel('Include model picks', { exact: true }).setChecked(includeModels)
    const sample = await readScale()
    expect(sample.min).toBeCloseTo(Math.min(...sample.values), 2)
    expect(sample.max).toBeCloseTo(Math.max(...sample.values), 2)
    if (sample.max > sample.min) expect(sample.colors).toBeGreaterThan(1)
  }
  await matrix.screenshot({ path: testInfo.outputPath('correlation-heatmap.png') })
})
