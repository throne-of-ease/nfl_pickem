const regular = Array.from({ length: 18 }, (_, i) => ({
  key: `week-${String(i + 1).padStart(2, '0')}`,
  label: `Week ${i + 1}`,
  phase: 'regular',
  espnSeason: 2026,
  espnSeasonType: 2,
  espnWeek: i + 1,
  countsTowardSeason: true,
}))

export const POOLS = [
  ...Array.from({ length: 4 }, (_, i) => ({
    key: `preseason-${String(i + 1).padStart(2, '0')}`,
    label: `Preseason ${i + 1}`,
    phase: 'preseason',
    espnSeason: 2026,
    espnSeasonType: 1,
    espnWeek: i + 1,
    countsTowardSeason: false,
  })),
  ...regular,
  ...[
    ['wild-card', 'Wild Card', 1],
    ['divisional', 'Divisional', 2],
    ['conference', 'Conference', 3],
    ['super-bowl', 'Super Bowl', 5],
  ].map(([key, label, espnWeek]) => ({ key, label, phase: 'postseason', espnSeason: 2026, espnSeasonType: 3, espnWeek, countsTowardSeason: true })),
]

export const impliedProbability = (odds) => {
  if (!Number.isFinite(odds) || odds === 0) return null
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
}

export function noVigProbabilities(homeMoneyline, awayMoneyline) {
  const home = impliedProbability(homeMoneyline)
  const away = impliedProbability(awayMoneyline)
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null
  return { home: home / (home + away), away: away / (home + away) }
}

export function modelPicks(games, kind) {
  const valid = games.flatMap((game) => {
    const predictor = Number.isFinite(game.predictorHome) ? game.predictorHome : null
    const moneyline = noVigProbabilities(game.homeMoneyline, game.awayMoneyline)?.home ?? null
    const homeProbability = kind === 'predictor' ? predictor : kind === 'moneyline' ? moneyline :
      Number.isFinite(predictor) && Number.isFinite(moneyline) ? (predictor + moneyline) / 2 : null
    return Number.isFinite(homeProbability) ? [{ ...game, homeProbability, separation: Math.abs(homeProbability - 0.5) }] : []
  }).sort((a, b) => a.separation - b.separation || new Date(a.kickoff) - new Date(b.kickoff) || a.id.localeCompare(b.id))
  return valid.map((game, index) => ({ gameId: game.id, team: game.homeProbability >= 0.5 ? game.home : game.away, confidence: index + 1, probability: game.homeProbability }))
}

export const modelDisagreement = (game) => {
  const ml = noVigProbabilities(game.homeMoneyline, game.awayMoneyline)?.home
  return Number.isFinite(game.predictorHome) && Number.isFinite(ml) ? Math.abs(game.predictorHome - ml) : null
}

export const isLocked = (game, now = new Date()) => game.locked || new Date(game.kickoff) <= new Date(now)

export function validateDraft(games, picks, { complete = false, previous = [], now = new Date() } = {}) {
  const ids = new Set(games.map((game) => game.id))
  if (picks.some((pick) => !ids.has(pick.gameId))) return { code: 'UNKNOWN_GAME' }
  const values = picks.flatMap((pick) => Number.isInteger(pick.confidence) ? [pick.confidence] : [])
  if (new Set(values).size !== values.length || values.some((value) => value < 1 || value > games.length) || (complete && values.length !== games.length)) return { code: 'INVALID_CONFIDENCE_SET' }
  const old = new Map(previous.map((pick) => [pick.gameId, pick]))
  if (games.some((game) => isLocked(game, now) && JSON.stringify(old.get(game.id) ?? null) !== JSON.stringify(picks.find((pick) => pick.gameId === game.id) ?? null))) return { code: 'LOCKED_GAME_CHANGED' }
  return { ok: true }
}

export function scorePick(pick, game, provisional = false) {
  if (!pick?.team || !Number.isFinite(pick.confidence)) return { points: 0, potential: 0 }
  if (game.status === 'scheduled') return { points: 0, potential: pick.confidence + (game.gotw ? 5 : 0) }
  let winner
  if (game.status === 'final' && game.homeScore === game.awayScore) winner = 'tie'
  else if (game.homeScore === game.awayScore && provisional) winner = game.homeWinProbability >= 0.5 ? game.home : game.away
  else winner = game.homeScore > game.awayScore ? game.home : game.away
  const correct = winner === 'tie' || pick.team === winner
  return { points: correct ? pick.confidence + (game.gotw ? 5 : 0) : 0, potential: game.status === 'final' ? 0 : pick.confidence + (game.gotw ? 5 : 0) }
}

export function standings(users, games, picksByUser, provisional = false) {
  return users.map((user) => {
    const scores = games.map((game) => scorePick(picksByUser[user.id]?.find((pick) => pick.gameId === game.id), game, provisional))
    return { ...user, points: scores.reduce((sum, score) => sum + score.points, 0), potential: scores.reduce((sum, score) => sum + score.potential, 0) }
  }).sort((a, b) => b.points - a.points || b.potential - a.potential || a.name.localeCompare(b.name))
}

export function freezePregameSnapshot(game, sample) {
  if (game.pregameSnapshot) return game
  const valid = Number.isFinite(sample.predictorHome) || (Number.isFinite(sample.homeMoneyline) && Number.isFinite(sample.awayMoneyline))
  return valid ? { ...game, pregameSnapshot: { predictorHome: sample.predictorHome ?? null, homeMoneyline: sample.homeMoneyline ?? null, awayMoneyline: sample.awayMoneyline ?? null, source: sample.source, capturedAt: sample.capturedAt } } : game
}
