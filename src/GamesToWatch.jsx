import React, { useEffect, useState } from 'react'
import { POOLS } from './domain.js'
import {
  DEFAULT_WATCH_WEIGHTS, WATCH_COMPONENTS, analyzeWatchGames, cachedWatchRatings,
  cachedWatchFpi, cachedWatchSchedule, excitementScore, fetchWatchSchedule, loadWatchFpi, mergeWatchGames,
  queueWatchRun, watchGame, watchRootingTeam, watchSeasonRival, watchTeamQuality,
} from './watchRatings.js'
import './gamesToWatch.css'

const SCORES = [{ key: 'overall', label: 'Excitement Score' }, ...WATCH_COMPONENTS]
const SHORT_LABELS = { overall: 'Excitem.', uncertainty: 'Uncert.', swings: 'WP Swings', suspense: 'Late Susp.', scoring: 'Scoring', quality: 'Team Qual.' }
const SCORING_NOTES = {
  uncertainty: {
    formula: '100 × Σ(Cᵢ × Δtᵢ) / T',
    description: 'Measures how long the game stayed in doubt. Δtᵢ is the duration of each interval and T is the total game-clock duration, including any overtime.',
  },
  swings: {
    formula: 'S = Σ max(0, 100 × |pᵢ₊₁ − pᵢ| − 1.5). Score = 100 × (1 − exp(−S / 250)).',
    description: 'Rewards turning points and comebacks. Each change contributes only the portion above 1.5 percentage points. A cumulative 250 points scores 63.2, and the scale approaches 100 gradually.',
  },
  suspense: {
    formula: '100 × Σ(Cᵢ × Lᵢ) / (T − 55 min)',
    description: 'Measures how long the ending stayed in doubt. Lᵢ is the portion of each interval after 55 minutes of game-clock time, covering the final five minutes of regulation and any overtime.',
  },
  scoring: {
    formula: 'E = Σ(points added × max(closeness credit, comeback credit)). Final rating = 100 × (1 − exp(−E / 34)).',
    description: 'Closeness credit rises from zero at 0% or 100% pre-play win probability to full credit at 40–60%. If the scoring team was trailing, comeback credit is its positive win-probability gain divided by 20 percentage points, capped at 1. For live games, the rating blends a neutral 50 with the rating at the current scoring pace, weighted by the share of regulation elapsed.',
  },
  quality: {
    formula: 'max(0, min(100, 50 + 5 × (FPI home + FPI away) / 2))',
    description: 'Rewards matchups between stronger teams. The latest ESPN FPI for the season also applies to past games, so this rating can change. Both teams need an FPI rating.',
  },
}
const LIVE_REFRESH_MS = 30_000
const startedGames = (games, poolKey) => games.flatMap((game) => {
  const item = ['final', 'post', 'live', 'in'].includes(game.status) ? watchGame(game, poolKey) : null
  return item ? [item] : []
})

function initialRankings(season, weeklyGames) {
  const cachedRows = cachedWatchRatings(season, weeklyGames)
  const byId = new Map(cachedRows.map(({ game, components }) => [game.id, components]))
  const games = weeklyGames ?? mergeWatchGames(cachedWatchSchedule(season)?.games ?? [], cachedRows.map(({ game }) => game))
  return {
    games: games.map((game) => game.live && byId.has(game.id) ? { ...game, live: false } : game),
    byId,
    fpi: cachedWatchFpi(season),
    loading: true,
    unavailable: 0,
    scheduleError: false,
    rateLimited: false,
  }
}

function useRankings(season, weeklyKey, liveKey, fixtureKey) {
  const [request, setRequest] = useState({ id: 0, refreshSchedule: false })
  const [rankings, setRankings] = useState(() => initialRankings(season, JSON.parse(weeklyKey)))

  useEffect(() => {
    if (fixtureKey) return
    const controller = new AbortController()
    const { signal } = controller
    let liveTimer
    let historyLoaded = false
    const weeklyGames = JSON.parse(weeklyKey)
    const initial = initialRankings(season, weeklyGames)
    setRankings(initial)
    queueWatchRun(signal, async () => {
      let games = initial.games
      if (weeklyGames === null) {
        const schedule = await fetchWatchSchedule(season, signal, request.refreshSchedule)
        if (signal.aborted) return
        games = mergeWatchGames(initial.games, JSON.parse(liveKey), schedule.games)
          .map((game) => game.live && initial.byId.has(game.id) ? { ...game, live: false } : game)
        setRankings((state) => ({
          ...state, games, scheduleError: Boolean(schedule.error), rateLimited: schedule.error?.message === 'ESPN_RATE_LIMIT',
        }))
      }
      if (games.length) {
        const fpi = await loadWatchFpi(season, signal)
        if (signal.aborted) return
        setRankings((state) => ({ ...state, fpi }))
      }
      let live = games.filter((game) => game.live && !initial.byId.has(game.id))
      const updateLive = async () => {
        if (signal.aborted || !live.length) return
        if (historyLoaded) {
          const fpi = await loadWatchFpi(season, signal)
          if (signal.aborted) return
          setRankings((state) => ({ ...state, fpi }))
        }
        await analyzeWatchGames(season, live, signal, (id, row) => {
          if (!row) return
          if (!row.game.live) live = live.filter((game) => game.id !== id)
          setRankings((state) => ({
            ...state,
            games: row.game.live ? state.games : state.games.map((game) => game.id === id ? row.game : game),
            byId: new Map(state.byId).set(id, row.components),
          }))
        }, 1)
        if (!signal.aborted && live.length) liveTimer = setTimeout(updateLive, LIVE_REFRESH_MS)
      }
      const liveIds = new Set(live.map(({ id }) => id))
      const missing = games.filter(({ id }) => initial.byId.get(id)?.scoring === undefined && !liveIds.has(id))
      await Promise.all([updateLive(), analyzeWatchGames(season, missing, signal, (id, row, rateLimited) => {
        setRankings((state) => row
          ? { ...state, byId: new Map(state.byId).set(id, row.components) }
          : { ...state, unavailable: state.unavailable + 1, rateLimited: state.rateLimited || rateLimited })
      }, live.length ? 2 : 3)])
      historyLoaded = true
      if (!signal.aborted) setRankings((state) => ({ ...state, loading: false }))
    }).catch(() => {
      if (!signal.aborted) setRankings((state) => ({ ...state, loading: false, scheduleError: true }))
    })
    return () => {
      controller.abort()
      clearTimeout(liveTimer)
    }
  }, [season, weeklyKey, liveKey, request, fixtureKey])

  const retry = () => setRequest(({ id }) => ({ id: id + 1, refreshSchedule: rankings.scheduleError }))
  if (!fixtureKey) return { ...rankings, retry }

  const games = JSON.parse(fixtureKey)
  const byId = new Map(games.map(({ id }) => {
    const index = Number(id.at(-1))
    return [id, { uncertainty: 76 - 11 * index, swings: 25 + 10 * index, suspense: 18 + 12 * index, scoring: 25 + 8 * index }]
  }))
  const fpi = new Map(games.flatMap(({ away, home }, index) => [[away, index - 2], [home, index - 1]]))
  return { games, byId, fpi, loading: false, unavailable: 0, scheduleError: false, rateLimited: false, retry }
}

function Rankings({ pool, weekGames, loadingWeek, scope, weights, fixturePools, players, picksByPlayer, showPicks, showRooting, viewerId, gamesByPool, rootingRivalId, useSeasonLeader }) {
  const fullSeason = scope === 'season'
  const [sort, setSort] = useState({ key: 'overall', direction: 'descending' })
  const weeklyGames = fullSeason ? null : mergeWatchGames(startedGames(weekGames, pool.key))
  const liveKey = JSON.stringify(fullSeason ? Object.entries(gamesByPool)
    .flatMap(([key, games]) => startedGames(games, key).filter((game) => game.live)) : [])
  let fixtureKey = null
  if (fixturePools) {
    const seasonPools = POOLS.filter((item) => item.espnSeason === pool.espnSeason && item.countsTowardSeason)
    fixtureKey = JSON.stringify(weeklyGames ?? mergeWatchGames(...seasonPools
      .map(({ key }) => startedGames(key === pool.key ? weekGames : fixturePools[key] ?? [], key))))
  }
  const weeklyKey = JSON.stringify(weeklyGames)
  const { games, byId, fpi, loading, unavailable, scheduleError, rateLimited, retry } = useRankings(pool.espnSeason, weeklyKey, liveKey, fixtureKey)
  const rows = games.flatMap((game) => {
    if (!byId.has(game.id) && !game.live) return []
    const components = { ...byId.get(game.id), quality: watchTeamQuality(game, fpi) }
    return [{ game, ...components, overall: byId.has(game.id) ? excitementScore(components, weights) : null }]
  }).sort((a, b) => {
    const left = a[sort.key]
    const right = b[sort.key]
    if (left == null && right != null) return 1
    if (left != null && right == null) return -1
    return (sort.direction === 'descending' ? right - left : left - right) ||
      b.game.kickoff.localeCompare(a.game.kickoff) || a.game.id.localeCompare(b.game.id)
  })

  const waiting = loading || (!fullSeason && loadingWeek)
  const analyzed = games.filter(({ id }) => byId.has(id)).length
  const liveCount = games.filter((game) => game.live).length
  const provisional = waiting || scheduleError || analyzed < games.length || liveCount > 0
  const progress = fullSeason && (waiting || scheduleError) && !games.length
    ? 'Checking games…'
    : `Analyzed ${analyzed} of ${games.length} games`
  const changeSort = (key) => setSort((current) => ({
    key, direction: current.key === key && current.direction === 'descending' ? 'ascending' : 'descending',
  }))

  const pickColumns = players.map((player) => ({
    ...player,
    picks: new Map(Object.entries(picksByPlayer[player.id] ?? {}).flatMap(([poolKey, picks]) =>
      picks.map((pick) => [`${poolKey}:${pick.gameId}`, pick]))),
  }))
  const dense = showRooting || (showPicks && pickColumns.length > 0)
  const viewerIndex = pickColumns.findIndex(({ id }) => id === viewerId)
  const rootingRivalIndex = pickColumns.findIndex(({ id }) => id === rootingRivalId)
  const now = Date.now()
  return <>
    <div className="watch-progress">
      <p role="status">
        {progress}
        {liveCount > 0 && ` · ${liveCount} live`}
        {provisional && ' · Rankings provisional'}
        {scheduleError && ' · ESPN schedule unavailable'}
        {unavailable > 0 && ` · ${unavailable} unavailable`}
        {rateLimited && ' · ESPN is limiting requests'}
      </p>
      {!waiting && (scheduleError || unavailable > 0) && <button type="button" onClick={retry}>Retry</button>}
    </div>
    {rows.length ? <div>
      <table className={dense ? 'watch-ranking watch-ranking-dense' : 'watch-ranking'} aria-label="Games to Watch rankings">
        <thead>
          <tr>
            <th scope="col" className="watch-rank" aria-label="Rank">#</th>
            {fullSeason && <th scope="col" className="watch-week">Week</th>}
            <th scope="col" className="watch-matchup">Matchup</th>
            {SCORES.map(({ key, label }) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction : undefined}>
              <button type="button" className="table-sort-button" aria-label={label} onClick={() => changeSort(key)}>
                <span className="watch-wide-label">{label}</span><span className="watch-short-label">{SHORT_LABELS[key]}</span>
                {sort.key === key && <span className="watch-sort-arrow" aria-hidden="true">{sort.direction === 'descending' ? ' ↓' : ' ↑'}</span>}
              </button>
            </th>)}
            {showRooting && <th scope="col" className="watch-root-column" aria-label="Root for">Root for</th>}
            {showPicks && pickColumns.map(({ id, name }) => <th key={id} scope="col" className="watch-pick-column">
              <span>{name}</span>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const { game } = row
            const gamePool = fullSeason ? POOLS.find(({ key }) => key === game.poolKey) : pool
            const picks = pickColumns.map((column) => {
              const pick = Date.parse(game.kickoff) <= now ? column.picks.get(`${game.poolKey}:${game.id}`) : null
              return pick && (pick.team === game.home || pick.team === game.away) &&
                Number.isInteger(pick.confidence) && pick.confidence > 0 ? pick : null
            })
            const rootingTeam = showRooting ? watchRootingTeam(game, picks[viewerIndex],
              picks.filter((pick, index) => pick && index !== viewerIndex && (!useSeasonLeader || index === rootingRivalIndex)),
              gamesByPool[game.poolKey]?.find(({ id }) => id === game.id)?.gotw) : null
            return <tr key={row.game.id}>
              <td className="watch-rank">{index + 1}</td>
              {fullSeason && <td className="watch-week">{gamePool?.espnWeek}{gamePool?.phase === 'postseason' && <small>{gamePool.label}</small>}</td>}
              <th scope="row" className="watch-matchup">{game.away} @ {game.home}{game.live && <small className="watch-live-label">Live</small>}</th>
              {SCORES.map(({ key }) => <td className={key === 'overall' ? 'watch-overall' : undefined} key={key}>{row[key]?.toFixed(1) ?? '—'}</td>)}
              {showRooting && <td className="watch-root-column" aria-label={rootingTeam ? `Root for ${rootingTeam}` : 'No rooting edge'}>
                {rootingTeam ?? '—'}
              </td>}
              {showPicks && pickColumns.map(({ id }, index) => {
                const pick = picks[index]
                return <td key={id} className="watch-pick-column"
                  aria-label={pick ? `${pick.team}, confidence ${pick.confidence}` : 'No pick available'}>
                  {pick ? <><span>{pick.team}</span><b>{pick.confidence}</b></> : '—'}
                </td>
              })}
            </tr>
          })}
        </tbody>
      </table>
    </div> : !waiting && !scheduleError && <p className="watch-empty">{games.length ? 'No ratings are currently available.' : 'No games in progress or completed yet.'}</p>}
  </>
}

export default function GamesToWatch({ pool, scope, onScope, weights = DEFAULT_WATCH_WEIGHTS, onWeights, players = [], picksByPlayer = {}, viewerId, gamesByPool = {}, seasonHistory, ...rankingProps }) {
  const [weightDraft, setWeightDraft] = useState(null)
  const [showPicks, setShowPicks] = useState(false)
  const [showRooting, setShowRooting] = useState(false)
  const [useSeasonLeader, setUseSeasonLeader] = useState(false)
  const rootingRivalId = showRooting && useSeasonLeader ? watchSeasonRival(seasonHistory, players, viewerId) : undefined
  const changeWeight = (key, percentage) => {
    if (percentage === weights[key]) return
    onWeights({ ...weights, [key]: percentage })
  }
  const resetWeights = () => {
    setWeightDraft(null)
    onWeights(DEFAULT_WATCH_WEIGHTS)
  }
  const weightTotal = WATCH_COMPONENTS.reduce((sum, { key }) => sum + weights[key], 0)
  return <section className="watch-view" aria-labelledby="games-to-watch-title">
    <div className="section-title"><h2 id="games-to-watch-title">Games to Watch</h2></div>
    <div className="watch-controls">
      <div className="watch-scope" role="group" aria-label="Game scope">
        <span>Scope</span>
        <div className="watch-segment">
          <button type="button" aria-pressed={scope === 'week'} onClick={() => onScope('week')}>Current Week</button>
          <button type="button" aria-pressed={scope === 'season'} onClick={() => onScope('season')}>Full Season</button>
        </div>
      </div>
      {scope === 'season' && <span className="watch-season">{pool.espnSeason} season</span>}
      <label className="watch-show-picks">
        <input type="checkbox" checked={showPicks} onChange={(event) => setShowPicks(event.target.checked)} />
        Show player picks
      </label>
      <label className="watch-show-picks">
        <input type="checkbox" checked={showRooting} onChange={(event) => setShowRooting(event.target.checked)} />
        Show rooting guide
      </label>
      {showRooting && <label className="watch-show-picks">
        <input type="checkbox" checked={useSeasonLeader} onChange={(event) => setUseSeasonLeader(event.target.checked)} />
        Compare with season leader
      </label>}
    </div>
    <details className="watch-settings">
      <summary>Scoring Settings</summary>
      <div className="watch-weight-grid">
        {WATCH_COMPONENTS.map(({ key, label }) => <div className="watch-weight" key={key}>
          <div className="watch-weight-heading">
            <label htmlFor={`watch-weight-${key}`}>{label}</label>
            <span className="watch-weight-entry">
              <input id={`watch-weight-${key}`} type="number" aria-label={`${label} weight percentage`} min="0" max="100" step="1"
                value={weightDraft?.key === key ? weightDraft.value : weights[key]}
                onChange={(event) => setWeightDraft({ key, value: event.target.value })}
                onBlur={(event) => {
                  const value = event.currentTarget.valueAsNumber
                  setWeightDraft(null)
                  if (weightDraft?.key === key && Number.isFinite(value)) {
                    changeWeight(key, Math.max(0, Math.min(100, Math.round(value))))
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setWeightDraft(null)
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }} />
              <span aria-hidden="true">%</span>
            </span>
          </div>
          <input type="range" aria-label={`${label} weight`} aria-valuetext={`${weights[key]}%`} min="0" max="100" value={weights[key]}
            onChange={(event) => changeWeight(key, event.target.valueAsNumber)} />
        </div>)}
      </div>
      <div className="watch-settings-actions">
        {weightTotal !== 100 && <p className="watch-weight-warning" aria-live="polite">
          Weights total {weightTotal}%. {weightTotal === 0 ? 'Set a positive weight to calculate the score.' : 'The score uses their relative proportions.'}
        </p>}
        <button type="button" onClick={resetWeights}>Reset to default weights</button>
      </div>
    </details>
    <Rankings key={scope === 'week' ? pool.key : pool.espnSeason} pool={pool} scope={scope} weights={weights}
      players={showPicks || showRooting ? players : []} picksByPlayer={picksByPlayer}
      showPicks={showPicks} showRooting={showRooting} viewerId={viewerId} gamesByPool={gamesByPool}
      useSeasonLeader={useSeasonLeader} rootingRivalId={rootingRivalId} {...rankingProps} />
    <section className="watch-notes" aria-labelledby="watch-scoring-title">
      <h3 id="watch-scoring-title">How the rankings work</h3>
      <p className="watch-formula">Excitement Score = Σ(weight × component score) / Σ(weight)</p>
      <p>Both sums use components with available scores. The overall score is unavailable if their weights total zero.</p>
      <p>Live ratings refresh about every 30 seconds as ESPN publishes win probabilities. They use the game clock through the latest timed update. Late-Game Suspense becomes available once there is win probability data inside the last five minutes. Team Quality uses the latest available season FPI.</p>
      {showRooting && <p><strong>Root for</strong> compares two hypothetical winners and shows which gives you the better points margin. {useSeasonLeader
        ? 'The benchmark is the highest-ranked other player in the current overall standings. If you lead, it uses the next player.'
        : 'The benchmark is the average of other players with a pick.'} Stakes include the Game of the Week bonus. A dash means the margins are equal or a required pick or ranking is unavailable.</p>}
      <p>For the win probability formulas, pᵢ is ESPN’s home win probability at the start of a game-clock interval, on a 0–1 scale. Closeness is <span className="watch-formula">Cᵢ = 1 − 2 × |pᵢ − 0.5|</span>. The opening probability applies from kickoff and each value carries forward until the next timed update. For completed games, the clock ends at the later of 60 minutes or the last timed probability update.</p>
      <dl>
        {WATCH_COMPONENTS.map(({ key, label }) => <div key={key}>
          <dt>{label}</dt>
          <dd>
            <div className="watch-formula">{SCORING_NOTES[key].formula}</div>
            {SCORING_NOTES[key].description}
          </dd>
        </div>)}
      </dl>
    </section>
  </section>
}
