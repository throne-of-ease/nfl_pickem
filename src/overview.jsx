import React, { useRef, useState } from 'react'
import { gameQuality, isLocked, modelPicks, pickDeviation, poolMetrics, scorePick } from './domain.js'
import { ChartIcon, downloadPngBlob, sharePngBlob } from './charts.jsx'
import { tableToPngBlob } from './tableExport.js'
import { formatCETDate, formatCETTime } from './time.js'

const ESPN_CODES = { WAS: 'wsh' }
const NFL_FALLBACK = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png&w=100&h=100&transparent=true'

export function TeamLogo({ team, size = 'small' }) {
  const code = ESPN_CODES[team] ?? team.toLowerCase()
  return <img
    className={`team-logo ${size === 'large' ? 'large' : ''}`}
    crossOrigin="anonymous"
    src={`https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`}
    alt={`${team} logo`}
    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = NFL_FALLBACK }}
  />
}

const isRevealed = (game) => game.status !== 'scheduled' || isLocked(game)

function GameSummary({ game }) {
  return <div className="overview-game">
    <span className="overview-game-line"><strong className="overview-matchup">{game.away}@{game.home}</strong></span>
    {(game.status === 'live' || game.status === 'in') && <b className="overview-live live-badge">LIVE</b>}
    {game.gotw && <b className="overview-gotw" title="Game of the Week">GOTW +5</b>}
  </div>
}

function ScoreCell({ game }) {
  const final = game.status === 'final' || game.status === 'post'
  const live = game.status === 'live' || game.status === 'in'
  const detail = live && (game.period || game.displayClock) ? `Q${game.period ?? '?'} · ${game.displayClock ?? '—'}` : game.statusDetail
  const liveProbability = live && Number.isFinite(game.homeWinProbability) ? `${((1 - game.homeWinProbability) * 100).toFixed(0)}%–${(game.homeWinProbability * 100).toFixed(0)}%` : null
  if (final || live) return <div className={`overview-score ${live ? 'live-text' : ''}`} title={live && detail ? `${detail}${liveProbability ? `; ${liveProbability}` : ''}` : final ? 'Final score' : 'Live score'}><strong>{game.awayScore}-{game.homeScore}</strong>{!live && <small>FINAL</small>}{detail && live && <small className="live-detail">{detail}</small>}{liveProbability && <small className="live-detail">{liveProbability}</small>}</div>
  return <time className="overview-score overview-schedule" dateTime={game.kickoff} title="Central European time"><span>{formatCETDate(game.kickoff)}</span><strong>{formatCETTime(game.kickoff)}</strong></time>
}

function PickCell({ game, pick, provisional, publicPick = false }) {
  if (!publicPick && !isRevealed(game)) {
    const saved = Boolean(pick?.saved || (pick?.team && Number.isFinite(pick.confidence)))
    return <span className="pick-hidden" aria-label={saved ? 'Pick saved; hidden until kickoff' : 'No pick saved yet'}>{saved ? '?' : '–'}</span>
  }
  if (!pick?.team || !Number.isFinite(pick.confidence)) return <span className="pick-empty" aria-label="No pick">-</span>
  const score = scorePick(pick, game, provisional)
  const state = score.scored ? score.correct ? 'correct' : 'incorrect' : 'pending'
  return <div className={`overview-pick ${state}`} title={`${pick.team}, confidence ${pick.confidence}${game.gotw ? ', plus 5 Game of the Week points' : ''}`} aria-label={`${pick.team}, confidence ${pick.confidence}`}>
    <TeamLogo team={pick.team} />
    <strong className="pick-team">{pick.team}</strong>
    <span>{pick.confidence + (game.gotw ? 5 : 0)}</span>
  </div>
}

export function Overview({ players, games, picksByUser, history, modelHistory, pool, provisional, onProvisional }) {
  const tableRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const exportTable = async (share) => {
    setExporting(true)
    setExportError('')
    try {
      const blob = await tableToPngBlob(tableRef.current, `${pool.label} · ${provisional ? 'Includes provisional live scores' : 'Final scores only'}`)
      const filename = `nfl-overview-${pool.id || pool.label}.png`.replace(/[^a-z0-9._-]/gi, '-')
      if (share) await sharePngBlob(blob, filename)
      else downloadPngBlob(blob, filename)
    } catch (error) {
      if (error?.name !== 'AbortError') setExportError('Could not export the table. Please try again.')
    } finally {
      setExporting(false)
    }
  }
  const [showModels, setShowModels] = useState(false)
  const [showGameMetrics, setShowGameMetrics] = useState(true)
  const [sort, setSort] = useState({ key: 'score', direction: 'ascending' })
  const sortBy = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending' }))
  const sortIndicator = (key) => sort.key === key ? (sort.direction === 'ascending' ? ' ▲' : ' ▼') : ''
  const deviationByGame = new Map(games.map((game) => [game.id, pickDeviation(game, picksByUser)]))
  const overviewGames = [...games].sort((a, b) => {
    const aLive = a.status === 'live' || a.status === 'in'
    const bLive = b.status === 'live' || b.status === 'in'
    if (aLive !== bLive) return Number(bLive) - Number(aLive)
    if (sort.key === 'gq' || sort.key === 'dev') {
      const aValue = sort.key === 'gq' ? gameQuality(a) : deviationByGame.get(a.id)
      const bValue = sort.key === 'gq' ? gameQuality(b) : deviationByGame.get(b.id)
      if (aValue === null && bValue !== null) return 1
      if (aValue !== null && bValue === null) return -1
      if (aValue !== null && bValue !== null && aValue !== bValue) return (aValue - bValue) * (sort.direction === 'ascending' ? 1 : -1)
    }
    const dateOrder = (new Date(a.kickoff) - new Date(b.kickoff)) * (sort.direction === 'descending' ? -1 : 1)
    return dateOrder || a.id.localeCompare(b.id)
  })
  const totals = new Map(history.users.map((user) => [user.id, user.cumulative.at(-1) ?? 0]))
  const modelTotals = new Map(modelHistory.users.map((user) => [user.id, user.cumulative.at(-1) ?? 0]))
  const metrics = poolMetrics(players, games, picksByUser, provisional)
    .map((player) => ({ ...player, seasonTotal: totals.get(player.id) ?? 0, displayTotal: totals.get(player.id) ?? 0 }))
    .sort((a, b) => b.displayTotal - a.displayTotal || b.points - a.points || a.name.localeCompare(b.name))
  const leader = metrics[0]?.displayTotal ?? 0
  const modelColumns = showModels ? [
    { id: 'model-fpi', name: 'FPI', picks: modelPicks(games, 'predictor') },
    { id: 'model-moneyline', name: 'Moneyline', picks: modelPicks(games, 'moneyline') },
    { id: 'model-avg', name: 'AVG', picks: modelPicks(games, 'aggregate') },
  ].map((model) => ({ ...poolMetrics([model], games, { [model.id]: model.picks }, provisional)[0], displayTotal: modelTotals.get(model.id) ?? 0, model: true })) : []
  const columns = [...metrics, ...modelColumns]

  return <section>
    <div className="section-title overview-title">
      <div><h2>Game overview</h2></div>
      <div className="overview-options"><label className="provisional-toggle"><input type="checkbox" checked={showModels} onChange={(event) => setShowModels(event.target.checked)} /><span className="option-label">Include model picks</span></label><label className="provisional-toggle"><input type="checkbox" checked={showGameMetrics} onChange={(event) => setShowGameMetrics(event.target.checked)} /><span className="option-label">Show GQ / Dev</span></label><label className="provisional-toggle"><input type="checkbox" checked={provisional} onChange={(event) => onProvisional(event.target.checked)} /><span className="option-label">Include provisional live scores</span></label></div>
    </div>
    <div className="overview-scroll">
      <table ref={tableRef} className="overview-table" aria-label={`All player picks for ${pool.label}`}>
         <thead><tr><th className="overview-game-column" aria-sort={sort.key === 'game' ? sort.direction : 'none'}><button className="table-sort-button" type="button" data-testid="overview-sort-game" onClick={() => sortBy('game')}>Game{sortIndicator('game')}</button></th><th className="overview-score-column" aria-sort={sort.key === 'score' ? sort.direction : 'none'} title="Scores and scheduled kickoffs shown in Central European time (CET/CEST)"><button className="table-sort-button" type="button" data-testid="overview-sort-score" onClick={() => sortBy('score')}>Score{sortIndicator('score')}</button></th>{columns.map((player, index) => <th key={player.id} className={player.model ? `model-column ${player.id === 'model-moneyline' ? 'model-moneyline-column' : ''}` : ''}>
          <div className="overview-player"><strong>{player.name}</strong><b title="Total season score">{player.displayTotal}</b><span>{!player.model && index === 0 ? 'LEAD' : `${player.displayTotal - leader}`}</span><small title="This week: points / points lost / points left">{player.points}/-{player.pointsLost}/{player.potential}</small></div>
         </th>)}{showGameMetrics && <><th className="game-metric"><button className="table-sort-button" type="button" data-testid="overview-sort-gq" onClick={() => sortBy('gq')}>GQ{sortIndicator('gq')}</button></th><th className="game-metric overview-dev-column"><button className="table-sort-button" type="button" data-testid="overview-sort-dev" onClick={() => sortBy('dev')}>Dev{sortIndicator('dev')}</button></th></>}</tr></thead>
        <tbody>{overviewGames.map((game) => <tr key={game.id} data-testid={`overview-row-${game.id}`} className={`${game.status} ${game.gotw ? 'gotw-row' : ''}`}><td className="overview-game-column"><GameSummary game={game} /></td><td className="overview-score-column"><ScoreCell game={game} /></td>{columns.map((player) => <td key={player.id} className={player.model ? `model-column ${player.id === 'model-moneyline' ? 'model-moneyline-column' : ''}` : ''}><PickCell game={game} pick={(player.model ? player.picks : picksByUser[player.id])?.find((pick) => pick.gameId === game.id)} provisional={provisional} publicPick={player.model} /></td>)}{showGameMetrics && <><td className="game-metric">{gameQuality(game) === null ? '—' : gameQuality(game).toFixed(1)}</td><td className="game-metric">{deviationByGame.get(game.id) === null ? '—' : deviationByGame.get(game.id).toFixed(1)}</td></>}</tr>)}</tbody>
      </table>
    </div>
    <div className="chart-actions chart-actions-bottom">
      <button type="button" title="Share table as PNG" aria-label="Share table as PNG" disabled={exporting} onClick={() => exportTable(true)}><ChartIcon type="share" /></button>
      <button type="button" title="Download table as PNG" aria-label="Download table as PNG" disabled={exporting} onClick={() => exportTable(false)}><ChartIcon type="download" /></button>
    </div>
    {exportError && <p role="alert">{exportError}</p>}
    <p className="overview-legend"><span className="correct-dot" /> correct <span className="incorrect-dot" /> incorrect <span className="pending-dot" /> pending <strong>?</strong> saved, hidden <strong>–</strong> not saved</p>
  </section>
}
