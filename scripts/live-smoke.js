const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=1&week=1'

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  console.log(`ESPN preseason diagnostic: ${data.events?.length ?? 0} events received.`)
} catch (error) {
  console.warn(`ESPN preseason diagnostic unavailable: ${error.message}. Recorded fixtures remain active.`)
}
