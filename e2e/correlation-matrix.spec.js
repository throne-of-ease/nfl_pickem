import { test, expect } from '@playwright/test'

test('Division winner matrix fits the viewport without horizontal scrolling', async ({ page }) => {
  await page.goto('/?scenario=division-locked&pool=week-02')
  await page.getByRole('button', { name: 'My picks' }).click()
  await page.getByRole('button', { name: 'Division winners' }).click()
  const table = page.getByTestId('division-matrix-table')
  await expect(table).toBeVisible()
  const layout = await table.evaluate((node) => {
    const scroller = node.closest('.table-scroll')
    return {
      tableWidth: node.getBoundingClientRect().width,
      scrollerWidth: scroller.clientWidth,
      scrollerContentWidth: scroller.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  })
  expect(layout.tableWidth).toBeLessThanOrEqual(layout.scrollerWidth + 1)
  expect(layout.scrollerContentWidth).toBeLessThanOrEqual(layout.scrollerWidth + 1)
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1)
})

test('correlation matrix is the last chart and follows Include model picks', async ({ page }) => {
  await page.goto('/?scenario=final&pool=week-01')
  await page.getByRole('button', { name: 'Charts' }).click()
  const matrix = page.getByTestId('pick-correlation-matrix')
  await expect(matrix).toBeVisible()
  await expect(page.locator('.charts > .chart-card').last()).toHaveAttribute('data-testid', 'pick-correlation-matrix')
  await expect(matrix).toHaveAttribute('data-entity-count', '4')
  await expect(matrix.locator('[data-correlation-cell]')).toHaveCount(16)

  const includeModels = page.getByRole('checkbox', { name: 'Include model picks' })
  await includeModels.check()
  await expect(matrix).toHaveAttribute('data-entity-count', '7')
  await expect(matrix.locator('[data-correlation-cell]')).toHaveCount(49)
  await expect(matrix).toContainText('FPI')
  await expect(matrix).toContainText('Moneyline')
  await expect(matrix).toContainText('AVG')

  await includeModels.uncheck()
  await expect(matrix).toHaveAttribute('data-entity-count', '4')
})
