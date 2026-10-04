import { test, expect } from '@playwright/test'

const player = { id: 'player-1', name: 'Alexandria Montgomery', username: 'alexandria_montgomery_pickem', contactEmail: 'alexandria.montgomery+football@example.com' }
const game = { id: 'g1', pool_key: 'week-02', away_team: 'PIT', home_team: 'BUF', kickoff: '2099-09-20T17:00:00Z', status: 'scheduled', gotw: true, matchup_quality: 91.2 }

async function openAdmin(page) {
  const session = { access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, user: { id: 'admin-user' } }
  await page.addInitScript(value => localStorage.setItem('nfl-pickem-session-v1', JSON.stringify(value)), session)
  await page.route('**/a.espncdn.com/**', route => route.abort())
  await page.route('**/cdn.espn.com/**', route => route.abort())
  await page.route('**/auth/v1/token*', route => route.fulfill({ json: session }))
  const responses = {
    get_season_data: { profiles: [player], games: [game], revealedPicks: [], viewer: { id: 'admin-user', name: 'Admin', isAdmin: true } },
    get_my_draft: { draftRevision: 1, picks: [] },
    get_admin_data: { registrationOpen: true, players: [player], games: [game], picks: [] },
    get_admin_gotw_data: { games: [game] },
    get_admin_override_history: { overrides: [{ id: 1, createdAt: '2026-09-02T00:00:00Z', playerName: player.name, playerId: player.id, poolKey: 'conference', adminName: 'Administrator Longdisplayname', picks: [{ gameId: 'a-long-game-identifier-to-test-wrapping', team: 'BUF', confidence: 16 }] }] },
    get_division_winner_data: { settings: { lockWeek: 5, lockAt: '2026-10-11T17:00:00Z', pointsPerCorrect: 5 }, players: [], drafts: [] },
  }
  for (const [name, json] of Object.entries(responses)) await page.route(`**/rest/v1/rpc/${name}`, route => route.fulfill({ json }))
  await page.goto('/?pool=week-02')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Registered players' })).toBeVisible()
}

async function expectFits(page) {
  const overflow = await page.locator('.admin-panel').evaluate(panel => {
    const nodes = [panel, ...panel.querySelectorAll('table, .table-scroll, th, td, .admin-cell-value, form, select, button, .admin-tabs')]
    return nodes.filter(node => node.getBoundingClientRect().width > 1 && (node.scrollWidth > node.clientWidth + 2 || node.getBoundingClientRect().right > window.innerWidth + 1 || node.getBoundingClientRect().left < -1)).map(node => `${node.tagName}.${node.className}: ${node.scrollWidth}/${node.clientWidth}`)
  })
  expect(overflow).toEqual([])
  expect(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().right > window.innerWidth + 1).map(node => `${node.tagName}.${node.className}`))).toEqual([])
}

test('all admin tables and controls fit without horizontal scrolling, including expanded records', async ({ page }, testInfo) => {
  await openAdmin(page)
  const widths = testInfo.project.name === 'desktop' ? [1280, 768, 700] : testInfo.project.name === 'mobile' ? [375, 320] : [390]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    for (const tab of ['Players', 'Game of the Week', 'GOTW overview', 'Pick overrides', 'Division winners']) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      if (tab === 'Players') {
        await expect(page.getByRole('cell', { name: player.contactEmail, exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: `Reset password for ${player.name}` })).toBeVisible()
      }
      if (tab === 'Game of the Week') {
        const header = page.getByTestId('gotw-sort-game').locator('..')
        const nextOrder = await header.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending'
        await page.getByTestId('gotw-sort-game').click()
        await expect(header).toHaveAttribute('aria-sort', nextOrder)
      }
      if (tab === 'GOTW overview') await expect(page.getByTestId('gotw-overview-table').getByRole('row')).toHaveCount(23)
      if (tab === 'Pick overrides') {
        await page.getByText('1 picks', { exact: true }).click()
        await expect(page.getByText('a-long-game-identifier-to-test-wrapping: BUF (#16)', { exact: true })).toBeVisible()
      }
      await expectFits(page)
      if (width === 390) await page.locator('.admin-panel').screenshot({ path: testInfo.outputPath(`admin-${tab.replaceAll(' ', '-')}.png`) })
    }
  }
})
