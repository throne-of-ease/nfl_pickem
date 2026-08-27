import { POOLS } from './domain.js'

const now = Date.now()
export const users = [
  { id: 'u1', name: 'Alex' }, { id: 'u2', name: 'Blair' }, { id: 'u3', name: 'Casey' }, { id: 'u4', name: 'Devon' },
]

const baseGames = [
  { id: 'g1', away: 'DAL', home: 'PHI', kickoff: new Date(now - 3 * 3600000).toISOString(), predictorHome: .61, homeMoneyline: -150, awayMoneyline: 130, gotw: true, status: 'final', awayScore: 20, homeScore: 27 },
  { id: 'g2', away: 'KC', home: 'LAC', kickoff: new Date(now - 2 * 3600000).toISOString(), predictorHome: .43, homeMoneyline: 120, awayMoneyline: -140, status: 'live', awayScore: 17, homeScore: 17, homeWinProbability: .58 },
  { id: 'g3', away: 'TB', home: 'ATL', kickoff: new Date(now + 5 * 3600000).toISOString(), predictorHome: .52, homeMoneyline: -105, awayMoneyline: -105, status: 'scheduled', awayScore: 0, homeScore: 0 },
  { id: 'g4', away: 'CIN', home: 'CLE', kickoff: new Date(now + 8 * 3600000).toISOString(), predictorHome: .47, homeMoneyline: null, awayMoneyline: null, status: 'scheduled', awayScore: 0, homeScore: 0 },
]

export const gamesByPool = Object.fromEntries(POOLS.map((pool) => {
  const week = pool.phase === 'regular' ? pool.espnWeek : pool.phase === 'preseason' ? pool.espnWeek - 4 : 18 + pool.espnWeek
  const status = pool.key === 'preseason-01' || pool.key === 'week-01' ? 'final' : pool.key === 'week-02' ? null : 'scheduled'
  return [pool.key, baseGames.map((game, index) => ({
    ...game,
    id: `${pool.key}-${game.id}`,
    week: pool.espnWeek,
    kickoff: new Date(now + ((week - 2) * 7 * 86400000) + index * 3600000).toISOString(),
    status: status ?? game.status,
  }))]
}))

gamesByPool['preseason-03'] = [
  ['401873298', 'PIT', 'BUF', '2026-08-27T23:00:00Z', -146, 122],
  ['401873299', 'NE', 'CLE', '2026-08-28T00:00:00Z', 119, -143],
  ['401873641', 'SF', 'LV', '2026-08-28T00:00:00Z', -159, 132],
  ['401873300', 'LAR', 'LAC', '2026-08-28T02:00:00Z', -182, 151],
  ['401873302', 'WSH', 'BAL', '2026-08-28T22:00:00Z', -146, 121],
  ['401873304', 'ATL', 'MIA', '2026-08-28T23:00:00Z', 143, -173],
  ['401873307', 'HOU', 'CAR', '2026-08-28T23:00:00Z', 102, -123],
  ['401873303', 'NYG', 'NYJ', '2026-08-28T23:30:00Z', 143, -172],
  ['401873306', 'TB', 'JAX', '2026-08-28T23:30:00Z', 128, -155],
  ['401874048', 'NO', 'DAL', '2026-08-29T00:00:00Z', -144, 120],
  ['401874102', 'ARI', 'GB', '2026-08-29T00:00:00Z', -123, 103],
  ['401873305', 'SEA', 'KC', '2026-08-29T00:00:00Z', 121, -145],
  ['401873301', 'CIN', 'PHI', '2026-08-29T00:00:00Z', -152, 127],
  ['401873614', 'MIN', 'DEN', '2026-08-29T01:00:00Z', -190, 156],
  ['401873308', 'DET', 'IND', '2026-08-29T17:00:00Z', -165, 137],
  ['401874394', 'CHI', 'TEN', '2026-08-29T22:00:00Z', -146, 121],
].map(([id, away, home, kickoff, homeMoneyline, awayMoneyline]) => ({ id, away, home, kickoff, status: 'scheduled', awayScore: 0, homeScore: 0, gotw: false, predictorHome: null, homeMoneyline, awayMoneyline, source: 'Recorded ESPN 2026 preseason Week 3' }))

export const picksByUser = Object.fromEntries(users.map((user, userIndex) => [user.id, Object.fromEntries(Object.entries(gamesByPool).map(([pool, games]) => [pool, games.map((game, i) => ({ gameId: game.id, team: (i + userIndex) % 2 ? game.away : game.home, confidence: ((i + userIndex) % games.length) + 1 }))]))]))

export const fixtureScenarios = ['scheduled', 'live', 'final', 'missing-predictor', 'missing-odds', 'malformed', 'stale-response']
