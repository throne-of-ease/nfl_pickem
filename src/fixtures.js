import { POOLS } from './domain.js'

const now = Date.now()
export const users = [
  { id: 'u1', name: 'Alex' }, { id: 'u2', name: 'Blair' }, { id: 'u3', name: 'Casey' }, { id: 'u4', name: 'Devon' },
]

const baseGames = [
  { id: 'g1', away: 'DAL', home: 'PHI', kickoff: new Date(now - 3 * 3600000).toISOString(), predictorHome: .61, homeMoneyline: -150, awayMoneyline: 130, matchupQuality: 84.2, gotw: true, status: 'final', awayScore: 20, homeScore: 27, period: 3, displayClock: '04:12', statusDetail: '3rd 04:12' },
  { id: 'g2', away: 'KC', home: 'LAC', kickoff: new Date(now - 2 * 3600000).toISOString(), predictorHome: .43, homeMoneyline: 120, awayMoneyline: -140, matchupQuality: 79.5, status: 'live', awayScore: 17, homeScore: 17, homeWinProbability: .58, period: 2, displayClock: '07:42', statusDetail: '2nd 07:42' },
  { id: 'g3', away: 'TB', home: 'ATL', kickoff: new Date(now + 5 * 3600000).toISOString(), predictorHome: .52, homeMoneyline: -105, awayMoneyline: -105, status: 'scheduled', awayScore: 0, homeScore: 0 },
  { id: 'g4', away: 'CIN', home: 'CLE', kickoff: new Date(now + 8 * 3600000).toISOString(), predictorHome: .47, homeMoneyline: null, awayMoneyline: null, status: 'scheduled', awayScore: 0, homeScore: 0 },
]

export const gamesByPool = Object.fromEntries(POOLS.map((pool) => {
  const week = pool.phase === 'regular' ? pool.espnWeek : 18 + pool.espnWeek
  const status = pool.key === 'week-01' ? 'final' : pool.key === 'week-02' ? null : 'scheduled'
  return [pool.key, baseGames.map((game, index) => ({
    ...game,
    id: `${pool.key}-${game.id}`,
    week: pool.espnWeek,
    kickoff: new Date(now + ((week - 2) * 7 * 86400000) + index * 3600000).toISOString(),
    status: status ?? game.status,
  }))]
}))

export const picksByUser = Object.fromEntries(users.map((user, userIndex) => [user.id, Object.fromEntries(Object.entries(gamesByPool).map(([pool, games]) => [pool, games.map((game, i) => ({ gameId: game.id, team: (i + userIndex) % 2 ? game.away : game.home, confidence: ((i + userIndex) % games.length) + 1 }))]))]))

export const fixtureScenarios = ['scheduled', 'live', 'final', 'missing-predictor', 'missing-odds', 'malformed', 'stale-response']
