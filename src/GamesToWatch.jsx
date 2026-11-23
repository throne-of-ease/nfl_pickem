import React, { useEffect, useState } from 'react'
import { POOLS } from './domain.js'
import {
  WATCH_COMPONENTS, analyzeWatchGames, cachedWatchRatings, cachedWatchSchedule, excitementScore,
  fetchWatchSchedule, mergeWatchGames, queueWatchRun, watchGame,
} from './watchRatings.js'
import './gamesToWatch.css'

const SCORES = [{ key: 'overall', label: 'Excitement Score' }, ...WATCH_COMPONENTS]
const SHORT_LABELS = { overall: 'Excitem.', uncertainty: 'Uncert.', swings: 'WP Swings', suspense: 'Late Susp.', quality: 'Team Qual.' }
const DEFAULT_WEIGHTS = Object.fromEntries(WATCH_COMPONENTS.map(({ key, weight }) => [key, weight]))
const completedGames = (games, poolKey) => games.flatMap((game) => {
  const item = ['final', 'post'].includes(game.status) ? watchGame(game, poolKey) : null
  return item ? [item] : []
})

function initialRankings(season, weeklyGames) {
  const cachedRows = cachedWatchRatings(season, weeklyGames)
  return {
    games: weeklyGames ?? mergeWatchGames(cachedWatchSchedule(season)?.games ?? [], cachedRows.map(({ game }) => game)),
    byId: new Map(cachedRows.map(({ game, components }) => [game.id, components])),
    loading: true,
    unavailable: 0,
    scheduleError: false,
    rateLimited: false,
  }
}

function useRankings(season, weeklyKey, fixtureKey) {
  const [request, setRequest] = useState({ id: 0, refreshSchedule: false })
  const [rankings, setRankings] = useState(() => initialRankings(season, JSON.parse(weeklyKey)))

  useEffect(() => {
    if (fixtureKey) return
    const controller = new AbortController()
    const { signal } = controller
    const weeklyGames = JSON.parse(weeklyKey)
    const initial = initialRankings(season, weeklyGames)
    setRankings(initial)
    queueWatchRun(signal, async () => {
      let games = initial.games
      if (weeklyGames === null) {
        const schedule = await fetchWatchSchedule(season, signal, request.refreshSchedule)
        if (signal.aborted) return
        games = mergeWatchGames(initial.games, schedule.games)
        setRankings((state) => ({
          ...state, games, scheduleError: Boolean(schedule.error), rateLimited: schedule.error?.message === 'ESPN_RATE_LIMIT',
        }))
      }
      const missing = games.filter(({ id }) => !initial.byId.has(id))
      await analyzeWatchGames(season, missing, signal, (id, row, rateLimited) => {
        setRankings((state) => row
          ? { ...state, byId: new Map(state.byId).set(id, row.components) }
          : { ...state, unavailable: state.unavailable + 1, rateLimited: state.rateLimited || rateLimited })
      })
      if (!signal.aborted) setRankings((state) => ({ ...state, loading: false }))
    }).catch(() => {
      if (!signal.aborted) setRankings((state) => ({ ...state, loading: false, scheduleError: true }))
    })
    return () => controller.abort()
  }, [season, weeklyKey, request, fixtureKey])

  const retry = () => setRequest(({ id }) => ({ id: id + 1, refreshSchedule: rankings.scheduleError }))
  if (!fixtureKey) return { ...rankings, retry }

  const games = JSON.parse(fixtureKey)
  const byId = new Map(games.map(({ id }) => {
    const index = Number(id.at(-1))
    return [id, { uncertainty: 76 - 11 * index, swings: 25 + 10 * index, suspense: 18 + 12 * index, quality: 48 + 5 * index }]
  }))
  return { games, byId, loading: false, unavailable: 0, scheduleError: false, rateLimited: false, retry }
}

function Rankings({ pool, weekGames, loadingWeek, scope, weights, fixturePools }) {
  const fullSeason = scope === 'season'
  const [sort, setSort] = useState({ key: 'overall', direction: 'descending' })
  const weeklyGames = fullSeason ? null : mergeWatchGames(completedGames(weekGames, pool.key))
  let fixtureKey = null
  if (fixturePools) {
    const seasonPools = POOLS.filter((item) => item.espnSeason === pool.espnSeason && item.countsTowardSeason)
    fixtureKey = JSON.stringify(weeklyGames ?? mergeWatchGames(...seasonPools
      .map(({ key }) => completedGames(key === pool.key ? weekGames : fixturePools[key] ?? [], key))))
  }
  const weeklyKey = JSON.stringify(weeklyGames)
  const { games, byId, loading, unavailable, scheduleError, rateLimited, retry } = useRankings(pool.espnSeason, weeklyKey, fixtureKey)
  const rows = games.flatMap((game) => {
    const components = byId.get(game.id)
    return components ? [{ game, ...components, overall: excitementScore(components, weights) }] : []
  }).sort((a, b) => {
    const left = a[sort.key]
    const right = b[sort.key]
    if (left == null && right != null) return 1
    if (left != null && right == null) return -1
    return (sort.direction === 'descending' ? right - left : left - right) ||
      b.game.kickoff.localeCompare(a.game.kickoff) || a.game.id.localeCompare(b.game.id)
  })

  const waiting = loading || (!fullSeason && loadingWeek)
  const provisional = waiting || scheduleError || rows.length < games.length
  const progress = fullSeason && (waiting || scheduleError) && !games.length
    ? 'Checking completed games…'
    : `Analyzed ${rows.length} of ${games.length} games`
  const changeSort = (key) => setSort((current) => ({
    key, direction: current.key === key && current.direction === 'descending' ? 'ascending' : 'descending',
  }))

  return <>
    <div className="watch-progress">
      <p role="status">
        {progress}
        {provisional && ' · Rankings provisional'}
        {scheduleError && ' · ESPN schedule unavailable'}
        {unavailable > 0 && ` · ${unavailable} unavailable`}
        {rateLimited && ' · ESPN is limiting requests'}
      </p>
      {!waiting && (scheduleError || unavailable > 0) && <button type="button" onClick={retry}>Retry</button>}
    </div>
    {rows.length ? <table className="watch-ranking" aria-label="Games to Watch rankings">
      <thead>
        <tr>
          {fullSeason && <th scope="col" className="watch-week">Week</th>}
          <th scope="col" className="watch-matchup">Matchup</th>
          {SCORES.map(({ key, label }) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction : undefined}>
            <button type="button" className="table-sort-button" aria-label={label} onClick={() => changeSort(key)}>
              <span className="watch-wide-label">{label}</span><span className="watch-short-label">{SHORT_LABELS[key]}</span>
              {sort.key === key && <span className="watch-sort-arrow" aria-hidden="true">{sort.direction === 'descending' ? ' ↓' : ' ↑'}</span>}
            </button>
          </th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const gamePool = fullSeason ? POOLS.find(({ key }) => key === row.game.poolKey) : pool
          return <tr key={row.game.id}>
            {fullSeason && <td className="watch-week">{gamePool?.espnWeek}{gamePool?.phase === 'postseason' && <small>{gamePool.label}</small>}</td>}
            <th scope="row" className="watch-matchup">{row.game.away} @ {row.game.home}</th>
            {SCORES.map(({ key }) => <td className={key === 'overall' ? 'watch-overall' : undefined} key={key}>{row[key]?.toFixed(1) ?? '—'}</td>)}
          </tr>
        })}
      </tbody>
    </table> : !waiting && !scheduleError && <p className="watch-empty">{games.length ? 'No ratings are currently available.' : 'No completed games yet.'}</p>}
  </>
}

export default function GamesToWatch({ pool, scope, onScope, weights = DEFAULT_WEIGHTS, onWeights, ...rankingProps }) {
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
    </div>
    <details className="watch-settings">
      <summary>Scoring Settings</summary>
      <div className="watch-weight-grid">
        {WATCH_COMPONENTS.map(({ key, label }) => <label key={key}>
          <span>{label} <b>{weights[key]}</b></span>
          <input type="range" aria-label={`${label} weight`} min="0" max="100" value={weights[key]}
            onChange={(event) => onWeights({ ...weights, [key]: Number(event.target.value) })} />
        </label>)}
      </div>
      {!Object.values(weights).some(Boolean) && <p>Set at least one weight to calculate the Excitement Score.</p>}
    </details>
    <Rankings key={scope === 'week' ? pool.key : pool.espnSeason} pool={pool} scope={scope} weights={weights} {...rankingProps} />
  </section>
}
