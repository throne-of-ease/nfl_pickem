import React, { useState } from 'react'
import { gameQuality, isLocked, modelPicks, pickDeviation, poolMetrics, scorePick } from './domain.js'
import { formatCETDate, formatCETTime } from './time.js'

const ESPN_CODES = { WAS: 'wsh' }
const NFL_FALLBACK = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png&w=100&h=100&transparent=true'

export function TeamLogo({ team, size = 'small' }) {
  const code = ESPN_CODES[team] ?? team.toLowerCase()
  return <img
    className={`team-logo ${size === 'large' ? 'large' : ''}`}
    src={`https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`}
    alt={`${team} logo`}
    loading="lazy"
    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = NFL_FALLBACK }}
  />
}

const isRevealed = (game) => game.status !== 'scheduled' || isLocked(game)

function GameSummary({ game }) {
  return <div className="overview-game">
    <strong className="overview-matchup">{game.away}@{game.home}</strong>
    {game.gotw && <b className="overview-gotw" title="Game of the Week">+5</b>}
  </div>
}

function ScoreCell({ game }) {
  const final = game.status === 'final' || game.status === 'post'
  const live = game.status === 'live' || game.status === 'in'
  const detail = live && (game.period || game.displayClock) ? `Q${game.period ?? '?'} · ${game.displayClock ?? '—'}` : game.statusDetail
  const liveProbability = live && Number.isFinite(game.homeWinProbability) ? `ESPN WP ${((1 - game.homeWinProbability) * 100).toFixed(0)}%–${(game.homeWinProbability * 100).toFixed(0)}%` : null
  if (final || live) return <div className={`overview-score ${live ? 'live-text' : ''}`} title={live && detail ? `${detail}${liveProbability ? `; ${liveProbability}` : ''}` : final ? 'Final score' : 'Live score'}><strong>{game.awayScore}-{game.homeScore}</strong><small>{final ? 'FINAL' : detail ? `LIVE · ${detail}` : 'LIVE'}</small>{liveProbability && <small className="live-detail">{liveProbability}</small>}</div>
  return <time className="overview-score overview-schedule" dateTime={game.kickoff} title="Central European time"><span>{formatCETDate(game.kickoff)}</span><strong>{formatCETTime(game.kickoff)}</strong></time>
}

function PickCell({ game, pick, provisional, publicPick = false }) {
  if (!publicPick && !isRevealed(game)) return <span className="pick-hidden" aria-label="Pick hidden until kickoff">?</span>
  if (!pick?.team || !Number.isFinite(pick.confidence)) return <span className="pick-empty" aria-label="No pick">-</span>
  const score = scorePick(pick, game, provisional)
  const state = score.scored ? score.correct ? 'correct' : 'incorrect' : 'pending'
  return <div className={`overview-pick ${state}`} title={`${pick.team}, confidence ${pick.confidence}${game.gotw ? ', plus 5 Game of the Week points' : ''}`} aria-label={`${pick.team}, confidence ${pick.confidence}`}>
    <TeamLogo team={pick.team} />
    <strong className="pick-team">{pick.team}</strong>
    <span>{pick.confidence + (game.gotw ? 5 : 0)}</span>
  </div>
}

export function Overview({ players, games, picksByUser, history, pool, provisional, onProvisional }) {
  const [showModels, setShowModels] = useState(false)
  const [showGameMetrics, setShowGameMetrics] = useState(true)
  const [sort, setSort] = useState({ key: 'date', direction: 'ascending' })
  const sortBy = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending' }))
  const sortIndicator = (key) => sort.key === key ? (sort.direction === 'ascending' ? ' ▲' : ' ▼') : ''
  const deviationByGame = new Map(games.map((game) => [game.id, pickDeviation(game, picksByUser)]))
  const overviewGames = [...games].sort((a, b) => {
    if (sort.key === 'gq' || sort.key === 'dev') {
      const aValue = sort.key === 'gq' ? gameQuality(a) : deviationByGame.get(a.id)
      const bValue = sort.key === 'gq' ? gameQuality(b) : deviationByGame.get(b.id)
      if (aValue === null && bValue !== null) return 1
      if (aValue !== null && bValue === null) return -1
      if (aValue !== null && bValue !== null && aValue !== bValue) return (aValue - bValue) * (sort.direction === 'ascending' ? 1 : -1)
    }
    const dateOrder = (new Date(a.kickoff) - new Date(b.kickoff)) * (sort.direction === 'descending' ? -1 : 1)
    if (sort.key === 'date') return dateOrder || a.id.localeCompare(b.id)
    const aLive = a.status === 'live' || a.status === 'in'
    const bLive = b.status === 'live' || b.status === 'in'
    return bLive - aLive || dateOrder || a.id.localeCompare(b.id)
  })
  const totals = new Map(history.users.map((user) => [user.id, user.cumulative.at(-1) ?? 0]))
  const metrics = poolMetrics(players, games, picksByUser, provisional)
    .map((player) => ({ ...player, seasonTotal: totals.get(player.id) ?? 0, displayTotal: pool.countsTowardSeason ? totals.get(player.id) ?? 0 : player.points }))
    .sort((a, b) => b.displayTotal - a.displayTotal || b.points - a.points || a.name.localeCompare(b.name))
  const leader = metrics[0]?.displayTotal ?? 0
  const modelColumns = showModels ? [
    { id: 'model-fpi', name: 'FPI', picks: modelPicks(games, 'predictor') },
    { id: 'model-moneyline', name: 'Moneyline', picks: modelPicks(games, 'moneyline') },
    { id: 'model-avg', name: 'AVG', picks: modelPicks(games, 'aggregate') },
  ].map((model) => ({ ...poolMetrics([model], games, { [model.id]: model.picks }, provisional)[0], displayTotal: 0, model: true })) : []
  const columns = [...metrics, ...modelColumns]

  return <section>
    <div className="section-title overview-title">
      <div><h2>Game overview</h2><p>Every revealed pick, confidence, score, and player position in one place.</p></div>
      <div className="overview-options"><label className="provisional-toggle"><input type="checkbox" checked={showModels} onChange={(event) => setShowModels(event.target.checked)} /><span className="option-label">Include model picks</span></label><label className="provisional-toggle"><input type="checkbox" checked={showGameMetrics} onChange={(event) => setShowGameMetrics(event.target.checked)} /><span className="option-label">Show GQ / Dev</span></label><label className="provisional-toggle"><input type="checkbox" checked={provisional} onChange={(event) => onProvisional(event.target.checked)} /><span className="option-label">Include provisional live scores</span></label></div>
    </div>
    <div className="overview-scroll">
      <table className="overview-table" aria-label={`All player picks for ${pool.label}`}>
         <thead><tr><th className="overview-game-column"><button className="table-sort-button" type="button" data-testid="overview-sort-date" onClick={() => sortBy('date')}>Game{sortIndicator('date')}</button></th><th className="overview-score-column" title="Scores and scheduled kickoffs shown in Central European time (CET/CEST)">Score</th>{columns.map((player, index) => <th key={player.id} className={player.model ? 'model-column' : ''}>
          <div className="overview-player"><strong>{player.name}</strong><b>{player.model ? player.points : player.displayTotal}</b><span>{player.model ? 'MODEL' : index === 0 ? 'LEAD' : `${player.displayTotal - leader}`}</span><small title="Pool points / points lost / points left">{player.points} / -{player.pointsLost} / {player.potential}</small></div>
         </th>)}{showGameMetrics && <><th className="game-metric"><button className="table-sort-button" type="button" data-testid="overview-sort-gq" onClick={() => sortBy('gq')}>GQ{sortIndicator('gq')}</button></th><th className="game-metric"><button className="table-sort-button" type="button" data-testid="overview-sort-dev" onClick={() => sortBy('dev')}>Dev{sortIndicator('dev')}</button></th></>}</tr></thead>
        <tbody>{overviewGames.map((game) => <tr key={game.id} data-testid={`overview-row-${game.id}`} className={`${game.status} ${game.gotw ? 'gotw-row' : ''}`}><td className="overview-game-column"><GameSummary game={game} /></td><td className="overview-score-column"><ScoreCell game={game} /></td>{columns.map((player) => <td key={player.id} className={player.model ? 'model-column' : ''}><PickCell game={game} pick={(player.model ? player.picks : picksByUser[player.id])?.find((pick) => pick.gameId === game.id)} provisional={provisional} publicPick={player.model} /></td>)}{showGameMetrics && <><td className="game-metric">{gameQuality(game) === null ? '—' : gameQuality(game).toFixed(1)}</td><td className="game-metric">{deviationByGame.get(game.id) === null ? '—' : deviationByGame.get(game.id).toFixed(1)}</td></>}</tr>)}</tbody>
      </table>
    </div>
    <p className="overview-legend"><span className="correct-dot" /> correct <span className="incorrect-dot" /> incorrect <span className="pending-dot" /> pending <strong>?</strong> hidden until kickoff</p>
  </section>
}
