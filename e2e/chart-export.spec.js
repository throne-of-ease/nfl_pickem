import { test, expect } from '@playwright/test'

async function pngBytes(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function verifyExport(page, card, testInfo, name) {
  await card.scrollIntoViewIfNeeded()
  const reference = await card.locator('svg.chart').screenshot()
  const layout = await card.locator('svg.chart').evaluate(async svg => {
    const entry = document.querySelector('script[type="module"][src$="/src/main.jsx"]')
    const { buildChartExport } = await import(new URL('chartExport.js', entry.src).href)
    const canvas = document.createElement('canvas')
    const result = buildChartExport(svg, canvas.getContext('2d'))
    const title = svg.closest('.chart-card').querySelector('h3').textContent
    const description = svg.closest('.chart-card').querySelector('.chart-description').textContent
    return { width: result.width, height: result.height, plot: result.plot, source: new XMLSerializer().serializeToString(result.svg), title, description, originalText: [...svg.querySelectorAll('text')].map(node => node.textContent) }
  })
  const pending = page.waitForEvent('download', { timeout: 10000 })
  await card.getByRole('button', { name: 'Download chart as PNG' }).click()
  const download = await pending
  const png = await pngBytes(download)
  expect(png.readUInt32BE(16)).toBe(Math.ceil(layout.width * 2))
  expect(png.readUInt32BE(20)).toBe(Math.ceil(layout.height * 2))
  expect(layout.plot.width / layout.plot.height).not.toBeNaN()
  const results = await page.evaluate(async ({ reference, png, layout }) => {
    const decode = async base64 => createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const [original, exported] = await Promise.all([decode(reference), decode(png)])
    const width = Math.round(layout.plot.width), height = Math.round(layout.plot.height)
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(original, 0, 0, width, height)
    const expected = context.getImageData(0, 0, width, height).data
    context.clearRect(0, 0, width, height)
    context.drawImage(exported, layout.plot.x * 2, layout.plot.y * 2, layout.plot.width * 2, layout.plot.height * 2, 0, 0, width, height)
    const actual = context.getImageData(0, 0, width, height).data
    let difference = 0
    for (let index = 0; index < actual.length; index++) difference += Math.abs(actual[index] - expected[index])
    const parsed = new DOMParser().parseFromString(layout.source, 'image/svg+xml')
    const texts = [...parsed.querySelectorAll('text')].map(node => node.textContent)
    const headingText = [...parsed.documentElement.children].filter(node => node.tagName === 'text').map(node => node.textContent).join(' ')
    return { difference: difference / actual.length, texts, headingText }
  }, { reference: reference.toString('base64'), png: png.toString('base64'), layout })
  // Device screenshots and the 2x PNG use different pixel grids; allow
  // font antialiasing/resampling differences below 2.4% per color channel.
  expect(results.difference).toBeLessThan(6)
  expect(results.headingText.replace(/\s+/g, ' ')).toContain(layout.title)
  expect(results.headingText.replace(/\s+/g, ' ')).toContain(layout.description.replace(/\s+/g, ' '))
  for (const text of layout.originalText) expect(results.texts).toContain(text)
  await download.saveAs(testInfo.outputPath(`${name}.png`))
  return png
}

for (const theme of ['dark', 'light']) test(`every chart downloads and shares faithfully in ${theme} mode`, async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?scenario=final&pool=week-01')
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  await page.getByLabel('Include model picks', { exact: true }).check()
  if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => { window.chartSharedFile = files[0] } })
  })
  const cards = page.locator('.chart-card').filter({ has: page.locator('svg.chart') })
  expect(await cards.count()).toBe(7)
  for (let index = 0; index < await cards.count(); index++) {
    const card = cards.nth(index)
    const id = await card.getAttribute('aria-labelledby')
    const png = await verifyExport(page, card, testInfo, `${theme}-${id}`)
    await page.evaluate(() => { window.chartSharedFile = null })
    await card.getByRole('button', { name: 'Share chart as PNG' }).click()
    await expect.poll(() => page.evaluate(() => window.chartSharedFile?.type)).toBe('image/png')
    const shared = await page.evaluate(async () => [...new Uint8Array(await window.chartSharedFile.arrayBuffer())])
    expect(Buffer.from(shared)).toEqual(png)
  }
  // Both alternate geometry and additional labels/controls use the same export path.
  await page.getByLabel('Aggressiveness index view').selectOption('season_average')
  await verifyExport(page, page.locator('.chart-card-aggressiveness'), testInfo, `${theme}-aggressiveness-bars`)
  await page.getByLabel('Current week display mode').selectOption('points_lost')
  await verifyExport(page, page.locator('.chart-card-current-week'), testInfo, `${theme}-losses`)
  await page.getByLabel('Prime-time games view').selectOption('model')
  await verifyExport(page, page.locator('.chart-card-prime-time-points'), testInfo, `${theme}-prime-impact`)
  await page.getByLabel('Net points vs benchmark view').selectOption('exposure')
  await page.getByLabel('Net points vs benchmark week').selectOption('week-01')
  await verifyExport(page, page.locator('.chart-card-team-net-vs-model'), testInfo, `${theme}-team-exposure`)
  expect(errors).toEqual([])
})

test('division winners, tall team charts and long legends keep their full content', async ({ page }, testInfo) => {
  await page.goto('/?scenario=final&pool=week-01')
  await page.evaluate(async () => {
    const entry = document.querySelector('script[type="module"][src$="/src/main.jsx"]')
    const base = new URL('../', entry.src)
    const React = (await import(new URL('node_modules/.vite/deps/react.js', base).href)).default
    const { createRoot } = (await import(new URL('node_modules/.vite/deps/react-dom_client.js', base).href)).default
    const { DivisionWinnersChart, WeeklyPointsChart, TeamModelRelativeChart } = await import(new URL('src/charts.jsx', base).href)
    const container = document.createElement('div')
    // Preserve Vite's entry URL while replacing the app with edge-case fixtures.
    document.head.append(entry)
    document.body.replaceChildren(container)
    const names = ['A very long player name that should never be truncated', 'Another extraordinarily long legend label', 'Marek']
    const users = names.map((name, index) => ({ id: `u${index}`, name, points: index * 5, correct: index, values: [index, index + 2] }))
    const teams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH']
    const games = Array.from({ length: 16 }, (_, index) => ({ id: `game${index}`, kickoff: '2020-01-01T18:00:00Z', away: teams[index * 2], home: teams[index * 2 + 1], status: 'final', homeScore: 21, awayScore: 7, predictorHome: .7, homeMoneyline: -150, awayMoneyline: 130 }))
    const picksByUser = { u0: { 'week-01': games.map((game, index) => ({ gameId: game.id, team: game.away, confidence: index + 1 })) } }
    createRoot(container).render(React.createElement('main', {},
      React.createElement(DivisionWinnersChart, { rows: users, pointsPerCorrect: 5 }),
      React.createElement(WeeklyPointsChart, { history: { users: users.map(user => ({ ...user, weekly: user.values })), weeks: ['W1', 'W2'] } }),
      React.createElement(TeamModelRelativeChart, { players: users, viewerId: 'u0', gamesByPool: { 'week-01': games }, picksByUser, poolKeys: ['week-01'], weekLabels: ['W1'] }),
    ))
  })
  await expect(page.locator('svg.chart')).toHaveCount(3)
  for (let index = 0; index < 2; index++) await verifyExport(page, page.locator('.chart-card').nth(index), testInfo, `long-content-${index}`)
  await page.getByLabel('Net points vs benchmark view').selectOption('exposure')
  await expect(page.locator('[data-team-row]')).toHaveCount(32)
  await verifyExport(page, page.locator('.chart-card-team-net-vs-model'), testInfo, 'tall-32-team-chart')
})

test('sharing fallback, cancellation and PNG failures are handled', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?scenario=final&pool=week-01')
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  const card = page.locator('.chart-card-weekly-points')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError') } })
  })
  const fallback = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Share chart as PNG' }).click()
  expect((await fallback).suggestedFilename()).toBe('weekly-points.png')
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true }))
  await card.getByRole('button', { name: 'Share chart as PNG' }).click()
  await expect(card.getByRole('button', { name: 'Share chart as PNG' })).toBeEnabled()
  await expect(card.getByRole('alert')).toHaveCount(0)
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = callback => callback(null) })
  await card.getByRole('button', { name: 'Download chart as PNG' }).click()
  await expect(card.getByRole('alert')).toHaveText('Could not export the chart. Please try again.')
  expect(errors).toEqual([])
})
