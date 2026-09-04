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
  return valid.map((game, index) => ({
    gameId: game.id,
    team: game.homeProbability >= 0.5 ? game.home : game.away,
    confidence: index + 1,
    probability: Math.max(game.homeProbability, 1 - game.homeProbability),
  }))
}

export function modelAutopick(games, kind, existing = [], { now = new Date(), acceptsLatePicks = false } = {}) {
  const old = new Map(existing.map((pick) => [pick.gameId, pick]))
  const model = modelPicks(games, kind)
  const modelByGame = new Map(model.map((pick) => [pick.gameId, pick]))
  const preserved = new Map()
  const used = new Set()
  for (const game of games) {
    const previous = old.get(game.id)
    const confidence = Number.isInteger(previous?.confidence) && previous.confidence >= 1 && previous.confidence <= games.length ? previous.confidence : null
    if (confidence !== null && (isLocked(game, now, acceptsLatePicks) || !modelByGame.has(game.id))) {
      preserved.set(game.id, confidence)
      used.add(confidence)
    }
  }
  const available = Array.from({ length: games.length }, (_, index) => index + 1).filter((value) => !used.has(value))
  const assigned = new Map(preserved)
  for (const pick of model) {
    const game = games.find((item) => item.id === pick.gameId)
    if (!game || isLocked(game, now, acceptsLatePicks)) continue
    assigned.set(pick.gameId, available.shift())
  }
  return games.map((game) => {
    const previous = old.get(game.id)
    const modelPick = modelByGame.get(game.id)
    if (!modelPick || isLocked(game, now, acceptsLatePicks)) {
      return { gameId: game.id, team: previous && [game.away, game.home].includes(previous.team) ? previous.team : null, confidence: assigned.get(game.id) ?? previous?.confidence ?? null }
    }
    return { gameId: game.id, team: modelPick.team, confidence: assigned.get(game.id) }
  })
}

export const modelDisagreement = (game) => {
  const ml = noVigProbabilities(game.homeMoneyline, game.awayMoneyline)?.home
  return Number.isFinite(game.predictorHome) && Number.isFinite(ml) ? Math.abs(game.predictorHome - ml) : null
}

export const gameQuality = (game) => {
  if (Number.isFinite(game?.homeFpi) && Number.isFinite(game?.awayFpi)) return (game.homeFpi + game.awayFpi) / 2
  return Number.isFinite(game?.matchupQuality) ? game.matchupQuality : null
}

export function pickDeviation(game, picksByUser) {
  const picks = Object.values(picksByUser ?? {}).flatMap((userPicks) => {
    const pick = userPicks?.find((item) => item.gameId === game.id)
    if (!pick || !Number.isInteger(pick.confidence) || ![game.away, game.home].includes(pick.team)) return []
    const stake = pick.confidence + (game.gotw ? 5 : 0)
    return [pick.team === game.home ? stake : -stake]
  })
  if (picks.length < 2) return null
  const total = picks.reduce((sum, value) => sum + value, 0)
  return picks.reduce((sum, value) => sum + Math.abs(value - (total - value) / (picks.length - 1)), 0) / picks.length
}

export const isLocked = (game, now = new Date(), acceptsLatePicks = false) => !acceptsLatePicks && (game.locked || new Date(game.kickoff) <= new Date(now))

export function presetConfidencePicks(games, existing = []) {
  const old = new Map(existing.map((pick) => [pick.gameId, pick]))
  const used = new Set()
  const preserved = new Map()
  for (const game of games) {
    const value = old.get(game.id)?.confidence
    if (Number.isInteger(value) && value >= 1 && value <= games.length && !used.has(value)) {
      preserved.set(game.id, value)
      used.add(value)
    }
  }
  const aggregateRank = new Map(modelPicks(games, 'aggregate').map((pick, index) => [pick.gameId, index]))
  const defaultOrder = [...games].sort((a, b) => {
    const aRank = aggregateRank.get(a.id) ?? games.length
    const bRank = aggregateRank.get(b.id) ?? games.length
    return aRank - bRank || new Date(a.kickoff) - new Date(b.kickoff) || a.id.localeCompare(b.id)
  })
  const available = Array.from({ length: games.length }, (_, index) => index + 1).filter((value) => !used.has(value))
  const assigned = new Map(preserved)
  for (const game of defaultOrder) if (!assigned.has(game.id)) assigned.set(game.id, available.shift())
  return games.map((game) => {
    const previous = old.get(game.id)
    const team = previous && (previous.team === game.home || previous.team === game.away) ? previous.team : null
    return { gameId: game.id, team, confidence: assigned.get(game.id) }
  })
}

export function validateDraft(games, picks, { complete = false, previous = [], now = new Date(), acceptsLatePicks = false } = {}) {
  const ids = new Set(games.map((game) => game.id))
  if (picks.some((pick) => !ids.has(pick.gameId))) return { code: 'UNKNOWN_GAME' }
  if (new Set(picks.map((pick) => pick.gameId)).size !== picks.length) return { code: 'INVALID_CONFIDENCE_SET' }
  if (picks.some((pick) => {
    const game = games.find((item) => item.id === pick.gameId)
    return pick.team != null && game.away && game.home && ![game.away, game.home].includes(pick.team)
  })) return { code: 'INVALID_TEAM' }
  const values = picks.flatMap((pick) => Number.isInteger(pick.confidence) ? [pick.confidence] : [])
  if (new Set(values).size !== values.length || values.some((value) => value < 1 || value > games.length) || (complete && values.length !== games.length)) return { code: 'INVALID_CONFIDENCE_SET' }
  const old = new Map(previous.map((pick) => [pick.gameId, pick]))
  if (games.some((game) => isLocked(game, now, acceptsLatePicks) && JSON.stringify(old.get(game.id) ?? null) !== JSON.stringify(picks.find((pick) => pick.gameId === game.id) ?? null))) return { code: 'LOCKED_GAME_CHANGED' }
  return { ok: true }
}

export function scorePick(pick, game, provisional = false) {
  const final = game.status === 'final' || game.status === 'post'
  const live = game.status === 'live' || game.status === 'in'
  const scored = final || (provisional && live)
  if (!pick?.team || !Number.isFinite(pick.confidence)) return { points: 0, potential: 0, stake: 0, scored, correct: scored ? false : null }
  const stake = pick.confidence + (game.gotw ? 5 : 0)
  if (!scored) return { points: 0, potential: stake, stake, scored: false, correct: null }

  let winner = null
  if (final && game.homeScore === game.awayScore) winner = 'tie'
  else if (game.homeScore > game.awayScore) winner = game.home
  else if (game.awayScore > game.homeScore) winner = game.away
  else if (live && Number.isFinite(game.homeWinProbability)) winner = game.homeWinProbability > 0.5 ? game.home : game.homeWinProbability < 0.5 ? game.away : null

  const correct = winner === 'tie' || pick.team === winner
  return { points: correct ? stake : 0, potential: 0, stake, scored: true, correct }
}

export function remainingPotential(games, picks, scores) {
  const assigned = new Set(picks.flatMap((pick) => Number.isInteger(pick.confidence) ? [pick.confidence] : []))
  const openUnpicked = games.filter((game, index) => !scores[index].scored && !isLocked(game) && !Number.isFinite(picks.find((pick) => pick.gameId === game.id)?.confidence))
  const available = Array.from({ length: games.length }, (_, index) => index + 1).filter((value) => !assigned.has(value)).sort((a, b) => b - a)
  return scores.reduce((sum, score) => sum + score.potential, 0)
    + available.slice(0, openUnpicked.length).reduce((sum, value) => sum + value, 0)
    + openUnpicked.filter((game) => game.gotw).length * 5
}

export function poolMetrics(users, games, picksByUser, provisional = false) {
  return users.map((user) => {
    const picks = picksByUser[user.id] ?? []
    const scores = games.map((game) => scorePick(picks.find((pick) => pick.gameId === game.id), game, provisional))
    return {
      ...user,
      points: scores.reduce((sum, score) => sum + score.points, 0),
      potential: remainingPotential(games, picks, scores),
      pointsLost: scores.reduce((sum, score) => sum + (score.scored && !score.correct ? score.stake : 0), 0),
      correct: scores.filter((score) => score.correct).length,
      played: scores.filter((score) => score.scored).length,
      picksMade: picks.filter((pick) => pick.team).length,
      maximum: games.length * (games.length + 1) / 2 + games.filter((game) => game.gotw).length * 5,
      scores,
    }
  })
}

export function standings(users, games, picksByUser, provisional = false) {
  return poolMetrics(users, games, picksByUser, provisional)
    .sort((a, b) => b.points - a.points || b.potential - a.potential || a.name.localeCompare(b.name))
}

export function buildSeasonHistory(users, gamesByPool, picksByUser, provisional = false, throughPoolKey = null) {
  const seasonPools = POOLS.filter((pool) => pool.countsTowardSeason && gamesByPool[pool.key])
  const selectedIndex = seasonPools.findIndex((pool) => pool.key === throughPoolKey)
  const lastPlayedIndex = seasonPools.reduce((last, pool, index) => gamesByPool[pool.key].some((game) => game.status !== 'scheduled') ? index : last, 0)
  const includedPools = seasonPools.slice(0, (selectedIndex >= 0 ? selectedIndex : lastPlayedIndex) + 1)
  const labels = includedPools.map((pool) => pool.phase === 'regular' ? `W${pool.espnWeek}` : ({ 'wild-card': 'WC', divisional: 'DIV', conference: 'CONF', 'super-bowl': 'SB' })[pool.key])
  const rows = Object.fromEntries(users.map((user) => [user.id, includedPools.map((pool) => {
    const games = gamesByPool[pool.key]
    const picks = picksByUser[user.id]?.[pool.key] ?? []
    const scores = games.map((game) => scorePick(picks.find((pick) => pick.gameId === game.id), game, provisional))
    return {
      points: scores.reduce((sum, score) => sum + score.points, 0),
      correct: scores.filter((score) => score.correct).length,
      played: scores.filter((score) => score.scored).length,
      possible: games.length * (games.length + 1) / 2 + games.filter((game) => game.gotw).length * 5,
      remaining: remainingPotential(games, picks, scores),
      lost: scores.reduce((sum, score) => sum + (score.scored && !score.correct ? score.stake : 0), 0),
      games: games.length,
      gotw: games.flatMap((game, index) => game.gotw ? [scores[index]] : []),
    }
  })]))

  const cumulative = Object.fromEntries(users.map((user) => [user.id, rows[user.id].reduce((values, row) => [...values, row.points + (values.at(-1) ?? 0)], [])]))
  const leaders = includedPools.map((_, index) => Math.max(0, ...users.map((user) => cumulative[user.id][index])))
  const potentialLeaders = includedPools.map((_, index) => Math.max(0, ...users.map((user) => cumulative[user.id][index] + rows[user.id][index].remaining)))

  return {
    weeks: labels,
    pools: includedPools.map((pool) => pool.key),
    users: users.map((user) => {
      const userRows = rows[user.id]
      const gotwScores = userRows.flatMap((row) => row.gotw)
      return {
        id: user.id,
        name: user.name,
        weekly: userRows.map((row) => row.points),
        correct: userRows.map((row) => row.correct),
        played: userRows.map((row) => row.played),
        possible: userRows.map((row) => row.possible),
        remaining: userRows.map((row) => row.remaining),
        lost: userRows.map((row) => row.lost),
        gameCounts: userRows.map((row) => row.games),
        cumulative: cumulative[user.id],
        relative: cumulative[user.id].map((value, index) => value - leaders[index]),
        relativePotential: cumulative[user.id].map((value, index) => value + userRows[index].remaining - potentialLeaders[index]),
        gotw: gotwScores.reduce((sum, score) => sum + score.points, 0),
        gotwPossible: gotwScores.reduce((sum, score) => sum + (score.scored ? score.stake : 0), 0),
        gotwCorrect: gotwScores.filter((score) => score.correct).length,
        gotwPlayed: gotwScores.filter((score) => score.scored).length,
      }
    }),
  }
}

export function freezePregameSnapshot(game, sample) {
  if (game.pregameSnapshot) return game
  const valid = Number.isFinite(sample.predictorHome) || (Number.isFinite(sample.homeMoneyline) && Number.isFinite(sample.awayMoneyline))
  return valid ? { ...game, pregameSnapshot: { predictorHome: sample.predictorHome ?? null, homeMoneyline: sample.homeMoneyline ?? null, awayMoneyline: sample.awayMoneyline ?? null, source: sample.source, capturedAt: sample.capturedAt } } : game
}
