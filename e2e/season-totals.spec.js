import { test, expect } from '@playwright/test'

test('production season totals recover historical scores while viewing an unplayed week', async ({ page }) => {
  const kickoff = new Date(Date.now() - 14 * 86400000).toISOString()
  const players = [{ id: 'pat', name: 'Pat' }]
  const old = { id: 'old', pool_key: 'week-01', kickoff, away_team: 'PIT', home_team: 'BUF', status: 'scheduled', away_score: 0, home_score: 0, gotw: true, locked_at: kickoff }
  const upcoming = { ...old, id: 'next', pool_key: 'week-02', kickoff: '2099-09-20T17:00:00Z', gotw: false, locked_at: null }
  await page.route('**/rest/v1/rpc/get_registration_status', route => route.fulfill({ json: { registrationOpen: true } }))
  await page.route('**/auth/v1/signup', route => route.fulfill({ json: { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: 'pat' } } }))
  await page.route('**/rest/v1/rpc/get_chart_data', route => route.fulfill({ json: { profiles: players, games: [old, upcoming], revealedPicks: [{ userId: 'pat', poolKey: 'week-01', gameId: 'old', team: 'BUF', confidence: 1 }] } }))
  await page.route('**/rest/v1/rpc/get_season_data', route => {
    const week = route.request().postDataJSON().p_pool_key
    return route.fulfill({ json: { profiles: players, games: [week === 'week-01' ? old : upcoming], revealedPicks: [], viewer: { id: 'pat', name: 'Pat', isAdmin: false } } })
  })
  await page.route('**/rest/v1/rpc/get_my_draft', route => route.fulfill({ json: { draftRevision: 0, picks: route.request().postDataJSON().p_pool_key === 'week-01' ? [{ gameId: 'old', team: 'BUF', confidence: 1 }] : [] } }))
  await page.route('**/cdn.espn.com/core/nfl/scoreboard*', route => route.fulfill({ json: { content: { sbData: { events: [{
    id: 'old', date: kickoff, status: { type: { state: 'post' } }, competitions: [{ competitors: [
      { homeAway: 'home', score: '24', team: { abbreviation: 'BUF' } },
      { homeAway: 'away', score: '17', team: { abbreviation: 'PIT' } },
    ] }],
  }] } } } }))
  await page.route('**/site.web.api.espn.com/**', route => route.fulfill({ json: {} }))
  await page.goto('/?pool=week-02')
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Display name').fill('Pat')
  await page.getByLabel('Password').fill('long-enough')
  await page.getByRole('button', { name: 'Register and play' }).click()
  // Select explicitly: the hosted-base redirect can drop the initial query string.
  await page.getByLabel('Week', { exact: true }).selectOption('week-02')
  await expect(page.getByTestId('overview-row-next')).toBeVisible()
  await expect(page.locator('.overview-player b')).toHaveText('6')
  await expect(page.locator('.overview-player small')).toHaveText('0/-0/1')
  await page.getByRole('button', { name: 'Charts', exact: true }).click()
  await expect(page.getByTestId('total-points-pat')).toHaveText('6')
  await expect(page.getByTestId('correct-pat')).toHaveText('1')
  await expect(page.getByTestId('incorrect-pat')).toHaveText('0')
  await expect(page.getByLabel('Current week display mode')).toHaveValue('vs_total_leader')
  await expect(page.getByRole('img', { name: 'Game of the Week points, absolute' })).toContainText('6')
})
