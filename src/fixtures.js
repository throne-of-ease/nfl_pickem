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

export const gamesByPool = Object.fromEntries(['preseason-01', ...Array.from({ length: 18 }, (_, i) => `week-${String(i + 1).padStart(2, '0')}`)].map((key, week) => [key, baseGames.map((game, index) => ({ ...game, id: `${key}-${game.id}`, week: week || 1, kickoff: new Date(now + ((week - 2) * 7 * 86400000) + index * 3600000).toISOString(), status: week < 2 ? 'final' : week === 2 ? game.status : 'scheduled' }))]))

gamesByPool['preseason-03'] = [
  ['PIT', 'BUF', '2026-08-27T23:00:00Z'],
  ['NE', 'CLE', '2026-08-28T00:00:00Z'],
  ['SF', 'LV', '2026-08-28T00:00:00Z'],
  ['LAR', 'LAC', '2026-08-28T02:00:00Z'],
  ['WAS', 'BAL', '2026-08-28T22:00:00Z'],
  ['HOU', 'CAR', '2026-08-28T23:00:00Z'],
  ['ATL', 'MIA', '2026-08-28T23:00:00Z'],
  ['TB', 'JAX', '2026-08-28T23:30:00Z'],
  ['NYG', 'NYJ', '2026-08-28T23:30:00Z'],
  ['NO', 'DAL', '2026-08-29T00:00:00Z'],
  ['SEA', 'KC', '2026-08-29T00:00:00Z'],
  ['CIN', 'PHI', '2026-08-29T00:00:00Z'],
  ['ARI', 'GB', '2026-08-29T00:00:00Z'],
  ['MIN', 'DEN', '2026-08-29T01:00:00Z'],
  ['DET', 'IND', '2026-08-29T17:00:00Z'],
  ['CHI', 'TEN', '2026-08-29T22:00:00Z'],
].map(([away, home, kickoff], index) => ({ id: `preseason-03-g${index + 1}`, away, home, kickoff, status: 'scheduled', awayScore: 0, homeScore: 0, gotw: false, predictorHome: null, homeMoneyline: null, awayMoneyline: null, source: 'NFL.com 2026 preseason Week 3 schedule' }))

export const picksByUser = Object.fromEntries(users.map((user, userIndex) => [user.id, Object.fromEntries(Object.entries(gamesByPool).map(([pool, games]) => [pool, games.map((game, i) => ({ gameId: game.id, team: (i + userIndex) % 2 ? game.away : game.home, confidence: ((i + userIndex) % games.length) + 1 }))]))]))

export const fixtureScenarios = ['scheduled', 'live', 'final', 'missing-predictor', 'missing-odds', 'malformed', 'stale-response']
