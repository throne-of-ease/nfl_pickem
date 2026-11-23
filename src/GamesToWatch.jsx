import React, { useEffect, useRef, useState } from 'react'
import { POOLS } from './domain.js'
import {
  DEFAULT_WATCH_WEIGHTS, WATCH_COMPONENTS, adjustWatchWeights, analyzeWatchGames, cachedWatchRatings,
  cachedWatchFpi, cachedWatchSchedule, excitementScore, fetchWatchSchedule, loadWatchFpi, mergeWatchGames,
  queueWatchRun, watchGame, watchTeamQuality,
} from './watchRatings.js'
import './gamesToWatch.css'

const SCORES = [{ key: 'overall', label: 'Excitement Score' }, ...WATCH_COMPONENTS]
const SHORT_LABELS = { overall: 'Excitem.', uncertainty: 'Uncert.', swings: 'WP Swings', suspense: 'Late Susp.', quality: 'Team Qual.' }
const SCORING_NOTES = {
  uncertainty: 'Measures how close ESPN’s win probability stayed to 50% across the game, weighted by game-clock time. Games that stayed in doubt score higher.',
  swings: 'Adds up the part of each play-to-play probability change beyond 1.5 percentage points. This rewards turning points and comebacks. The rating reaches 100 at 250 cumulative percentage points.',
  suspense: 'Measures how close win probability stayed to 50% in the final five minutes of regulation and any overtime. Games that stayed in doubt near the end score higher.',
  quality: 'Rewards matchups between stronger teams. The app averages both teams’ ESPN FPI ratings and maps the average to 0–100. An average of 0 scores 50, and each FPI point changes the score by 5, with a floor of 0 and a ceiling of 100. The latest available FPI for the season also applies to past games, so their ratings can change as ESPN updates FPI.',
}
const completedGames = (games, poolKey) => games.flatMap((game) => {
  const item = ['final', 'post'].includes(game.status) ? watchGame(game, poolKey) : null
  return item ? [item] : []
})

function initialRankings(season, weeklyGames) {
  const cachedRows = cachedWatchRatings(season, weeklyGames)
  return {
    games: weeklyGames ?? mergeWatchGames(cachedWatchSchedule(season)?.games ?? [], cachedRows.map(({ game }) => game)),
    byId: new Map(cachedRows.map(({ game, components }) => [game.id, components])),
    fpi: cachedWatchFpi(season),
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
      if (games.length) {
        const fpi = await loadWatchFpi(season, signal)
        if (signal.aborted) return
        setRankings((state) => ({ ...state, fpi }))
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
    return [id, { uncertainty: 76 - 11 * index, swings: 25 + 10 * index, suspense: 18 + 12 * index }]
  }))
  const fpi = new Map(games.flatMap(({ away, home }, index) => [[away, index - 2], [home, index - 1]]))
  return { games, byId, fpi, loading: false, unavailable: 0, scheduleError: false, rateLimited: false, retry }
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
  const { games, byId, fpi, loading, unavailable, scheduleError, rateLimited, retry } = useRankings(pool.espnSeason, weeklyKey, fixtureKey)
  const rows = games.flatMap((game) => {
    if (!byId.has(game.id)) return []
    const components = { ...byId.get(game.id), quality: watchTeamQuality(game, fpi) }
    return [{ game, ...components, overall: excitementScore(components, weights) }]
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

export default function GamesToWatch({ pool, scope, onScope, weights = DEFAULT_WATCH_WEIGHTS, onWeights, ...rankingProps }) {
  const weightEdit = useRef(null)
  const [weightDraft, setWeightDraft] = useState(null)
  const changeWeight = (key, percentage) => {
    if (percentage === weights[key]) return
    // Keep the earlier proportions while editing the same weight, even at 100%.
    if (weightEdit.current?.key !== key) weightEdit.current = { key, weights }
    onWeights(adjustWatchWeights(weightEdit.current.weights, key, percentage))
  }
  const resetWeights = () => {
    weightEdit.current = null
    setWeightDraft(null)
    onWeights(DEFAULT_WATCH_WEIGHTS)
  }
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
        <p>The other weights adjust proportionally to keep the total at 100%.</p>
        <button type="button" onClick={resetWeights}>Reset to default weights</button>
      </div>
    </details>
    <Rankings key={scope === 'week' ? pool.key : pool.espnSeason} pool={pool} scope={scope} weights={weights} {...rankingProps} />
    <section className="watch-notes" aria-labelledby="watch-scoring-title">
      <h3 id="watch-scoring-title">How the rankings work</h3>
      <p>The Excitement Score helps you find completed games worth watching without seeing the result. It combines four ratings on a 0–100 scale using your weights. If a rating is unavailable, the score uses the remaining weighted ratings.</p>
      <dl>
        {WATCH_COMPONENTS.map(({ key, label }) => <div key={key}>
          <dt>{label}</dt>
          <dd>{SCORING_NOTES[key]}</dd>
        </div>)}
      </dl>
    </section>
  </section>
}
