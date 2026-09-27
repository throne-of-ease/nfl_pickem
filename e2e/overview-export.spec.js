import { test, expect } from '@playwright/test'

const names = ['Hicham', 'Istvan', 'Marek', 'NFLsuperfan']
const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

test.beforeEach(async ({ page }) => {
  await page.route('**/a.espncdn.com/**', route => route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: ONE_PIXEL_PNG }))
  await page.addInitScript((names) => {
    localStorage.setItem('nfl-pickem-rehearsal-v1', JSON.stringify({
      users: names.map((name, index) => ({ id: `u${index + 1}`, name })), picksByUser: {},
    }))
  }, names)
})

test('full names and model columns fit without horizontal scrolling', async ({ page }) => {
  await page.goto('/?scenario=scheduled&pool=week-01')
  for (const width of [320, 375, 390, 430, 540, 1024]) {
    await page.setViewportSize({ width, height: 850 })
    for (const models of [false, true]) {
      await page.getByLabel('Include model picks', { exact: true }).setChecked(models)
      for (const metrics of [false, true]) {
        await page.getByLabel('Show GQ / Dev').setChecked(metrics)
        expect(await page.locator('.overview-player > strong').allTextContents()).toEqual(models ? [...names, 'FPI', 'Moneyline', 'AVG'] : names)
        expect(await page.locator('.overview-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.locator('.overview-player > strong').evaluateAll(elements => elements.every(el => {
          const style = getComputedStyle(el)
          const cell = el.closest('th').getBoundingClientRect()
          const box = el.getBoundingClientRect()
          return style.textOverflow !== 'ellipsis' && el.scrollWidth <= el.clientWidth + 1 && box.left >= cell.left - 1 && box.right <= cell.right + 1
        }))).toBe(true)
      }
    }
  }
})

test('exports PNG, shares a file, falls back to download and handles cancellation and errors', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?scenario=scheduled&pool=week-01')
  await page.getByLabel('Include model picks', { exact: true }).check()
  // Record the visible canvas content to check names, rows and logos.
  await page.evaluate(() => {
    window.exportText = []
    window.exportImageCount = 0
    const fillText = CanvasRenderingContext2D.prototype.fillText
    const drawImage = CanvasRenderingContext2D.prototype.drawImage
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) { window.exportText.push(text); return fillText.call(this, text, ...args) }
    CanvasRenderingContext2D.prototype.drawImage = function(...args) { window.exportImageCount += 1; return drawImage.apply(this, args) }
  })
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download table as PNG' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/^nfl-overview-.*\.png$/)
  await download.saveAs(testInfo.outputPath('overview.png'))
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const png = Buffer.concat(chunks)
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.readUInt32BE(16)).toBeGreaterThan(600)
  const text = await page.evaluate(() => window.exportText)
  expect(text[0]).toContain('NFL Pick’em 2026')
  expect(text).toContain('GAME')
  expect(text).toContain('SCORE ▲')
  expect(text).toContain('GQ')
  expect(text).toContain('DEV')
  for (const name of names) expect(text).toContain(name.toUpperCase())
  expect(text).toContain('MONEYLINE')
  expect(text.some(value => value.startsWith('DAL@'))).toBe(true)
  expect(text.some(value => value.startsWith('CIN@'))).toBe(true)
  expect(text.filter(value => value === '–').length).toBeGreaterThanOrEqual(16)
  expect(await page.evaluate(() => window.exportImageCount)).toBe(await page.locator('.overview-table img').count())
  await expect(page.getByRole('button', { name: 'Share table as PNG' })).toBeEnabled()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => { window.shared = { name: files[0].name, type: files[0].type, size: files[0].size, file: files[0] } } })
  })
  await page.getByRole('button', { name: 'Share table as PNG' }).click()
  await expect.poll(() => page.evaluate(() => window.shared?.type), { timeout: 15000 }).toBe('image/png')
  expect(await page.evaluate(() => window.shared.size)).toBeGreaterThan(1000)
  const darkPixels = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(window.shared.file)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    const table = document.querySelector('.overview-table')
    const tableRect = table.getBoundingClientRect()
    const headerRect = table.tHead.rows[0].cells[0].getBoundingClientRect()
    const sample = (x, y) => {
      context.clearRect(0, 0, 1, 1)
      context.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    return {
      page: sample(4, 4),
      tableHeader: sample(Math.round((headerRect.left - tableRect.left + 5) * 2), Math.round((48 + headerRect.top - tableRect.top + 5) * 2)),
    }
  })
  expect(darkPixels).toEqual({ page: [11, 17, 24, 255], tableHeader: [23, 34, 49, 255] })
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.evaluate(() => { window.shared = null })
  await page.getByRole('button', { name: 'Share table as PNG' }).click()
  await expect.poll(() => page.evaluate(() => window.shared?.type), { timeout: 15000 }).toBe('image/png')
  const lightPixels = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(window.shared.file)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    const table = document.querySelector('.overview-table')
    const tableRect = table.getBoundingClientRect()
    const headerRect = table.tHead.rows[0].cells[0].getBoundingClientRect()
    const sample = (x, y) => {
      context.clearRect(0, 0, 1, 1)
      context.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    return {
      page: sample(4, 4),
      tableHeader: sample(Math.round((headerRect.left - tableRect.left + 5) * 2), Math.round((48 + headerRect.top - tableRect.top + 5) * 2)),
    }
  })
  expect(lightPixels).toEqual({ page: [255, 255, 255, 255], tableHeader: [233, 238, 244, 255] })
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }))
  const fallback = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Share table as PNG' }).click()
  expect((await fallback).suggestedFilename()).toMatch(/\.png$/)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError') } })
  })
  await page.getByRole('button', { name: 'Share table as PNG' }).click()
  await expect(page.getByRole('button', { name: 'Share table as PNG' })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  const chartDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download chart as PNG' }).first().click()
  expect((await chartDownload).suggestedFilename()).toMatch(/\.png$/)
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = callback => callback(null) })
  await page.getByRole('button', { name: 'Download table as PNG' }).click()
  await expect(page.getByRole('alert')).toHaveText('Could not export the table. Please try again.')
  expect(errors).toEqual([])
})
