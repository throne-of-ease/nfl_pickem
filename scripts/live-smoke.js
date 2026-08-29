import { POOLS } from '../src/domain.js'
import { fetchEspnPool } from '../src/espnAdapter.js'

try {
  const pool = POOLS.find((item) => item.key === 'preseason-03')
  const { games } = await fetchEspnPool(pool, { signal: AbortSignal.timeout(30000) })
  const probabilities = games.filter((game) => Number.isFinite(game.predictorHome) || Number.isFinite(game.homeMoneyline) && Number.isFinite(game.awayMoneyline)).length
  const liveGames = games.filter((game) => game.status === 'live')
  const liveProbabilities = liveGames.filter((game) => Number.isFinite(game.homeWinProbability)).length
  if (!games.length) throw new Error('no games returned')
  console.log(`ESPN ${pool.label} diagnostic: ${games.length} real games, ${probabilities} with pregame probabilities, ${liveGames.length} live, ${liveProbabilities} with live win probabilities.`)
} catch (error) {
  console.warn(`ESPN preseason diagnostic unavailable: ${error.message}. Recorded fixtures remain active.`)
}
