import React, { useState } from 'react'
import { isLocked, scorePick, modelPicks, pickDeviation } from './domain.js'
import { AccessibleTable, ChartFrame, LineSvg } from './chartsBase.jsx'

const METRICS = [
  { value: 'earned', label: 'Points earned' },
  { value: 'lost', label: 'Points lost' },
  { value: 'potential', label: 'Potential total' },
  { value: 'net', label: 'Net impact' },
]

const kickoffTime = (game) => {
  const value = Date.parse(game.kickoff)
  return Number.isFinite(value) ? value : Infinity
}
const kickoffLabel = (game) => Number.isFinite(kickoffTime(game))
  ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(game.kickoff)) + ' Berlin'
  : 'Kickoff TBC'

const ORDERS = [
  { value: 'kickoff', label: 'Kickoff time' },
  { value: 'predictor', label: 'FPI confidence' },
  { value: 'moneyline', label: 'ML confidence' },
  { value: 'aggregate', label: 'AVG confidence' },
  { value: 'dev', label: 'Dev' },
]

export function kickoffGroupLabel(game) {
  if (!Number.isFinite(kickoffTime(game))) return 'Kickoff TBC'
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(game.kickoff)).map(({ type, value }) => [type, value]))
  const hour = Number(parts.hour)
  if (parts.weekday === 'Thursday' && hour >= 18) return 'TNF'
  if (parts.weekday === 'Sunday') {
    if (hour >= 18) return 'SNF'
    if (hour >= 15) return 'Sunday late window'
    if (hour >= 12) return 'Sunday early slate'
  }
  if (parts.weekday === 'Monday' && hour >= 18) return 'MNF'
  return `${parts.weekday} ${parts.hour}:${parts.minute} ET`
}

// Future private picks must not influence another player's visible trajectory.
// Allocate their public remaining confidence budget in kickoff order instead.
export function weekProgressData(players, games, picksByUser, { metric = 'earned', groupKickoffs = false, provisional = false, viewerId, order = 'kickoff', ascending = false, includeLive = true, benchmark = 'absolute', seasonTotals = new Map() } = {}) {
  const ordered = [...games].sort((a, b) => kickoffTime(a) - kickoffTime(b) || String(a.id).localeCompare(String(b.id)))
  const groups = []
  for (const game of ordered.filter((game) => includeLive || game.status !== 'live')) {
    const time = kickoffTime(game)
    const previous = groups.at(-1)
    const lateWindow = kickoffGroupLabel(game) === 'Sunday late window'
    const groupKey = lateWindow ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(game.kickoff)) + '-sunday-late' : time
    if (groupKickoffs && Number.isFinite(time) && previous?.groupKey === groupKey) previous.games.push(game)
    else groups.push({ time, groupKey, games: [game] })
  }
  // Dev uses revealed human picks only, independent of viewer and model toggles.
  const humanPicks = Object.fromEntries(players.filter((player) => !player.model).map((player) => [player.id, (picksByUser[player.id] ?? []).filter((pick) => games.some((game) => game.id === pick.gameId && isLocked(game)))]))
  const ranks = new Map(modelPicks(games, order).map((pick) => [pick.gameId, pick.confidence]))
  const value = (game) => order === 'dev' ? pickDeviation(game, humanPicks) : ranks.get(game.id)
  const groupValue = (group) => {
    const values = group.games.map(value).filter(Number.isFinite)
    return values.length ? values.reduce((sum, number) => sum + number, 0) / values.length : null
  }
  if (order !== 'kickoff') groups.sort((a, b) => {
    const av = groupValue(a), bv = groupValue(b)
    return (av === null && bv === null ? 0 : av === null ? 1 : bv === null ? -1 : (ascending ? av - bv : bv - av)) || a.time - b.time || String(a.games[0].id).localeCompare(String(b.games[0].id))
  })
  const labels = ['Start', ...groups.map((group) => groupKickoffs ? kickoffGroupLabel(group.games[0]) : `${group.games[0].away} @ ${group.games[0].home}`)]
  const details = ['Start of week', ...groups.map((group) => `${group.games.map((game) => `${game.away} @ ${game.home}`).join(', ')} · ${[...new Set(group.games.map(kickoffLabel))].join(' / ')}`)]
  const models = [{ id: 'model-fpi', name: 'FPI', kind: 'predictor' }, { id: 'model-moneyline', name: 'Moneyline', kind: 'moneyline' }, { id: 'model-avg', name: 'AVG', kind: 'aggregate' }]
  const selectedModel = models.find((model) => model.id === benchmark)
  const entities = selectedModel && !players.some((player) => player.id === benchmark) ? [...players, { ...selectedModel, model: true }] : players
  const series = entities.map((player, colorIndex) => {
    const picks = (selectedModel?.id === player.id ? modelPicks(games, selectedModel.kind) : (picksByUser[player.id] ?? [])).filter((pick) => {
      const game = games.find((item) => item.id === pick.gameId)
      return game && (isLocked(game) || player.id === viewerId || player.model)
    })
    const pickByGame = new Map(picks.map((pick) => [pick.gameId, pick]))
    const scores = new Map(ordered.map((game) => [game.id, scorePick(pickByGame.get(game.id), game, provisional)]))
    const assigned = new Set(picks.map((pick) => pick.confidence).filter(Number.isInteger))
    const available = Array.from({ length: games.length }, (_, index) => index + 1).filter((value) => !assigned.has(value)).reverse()
    const estimated = new Set()
    for (const game of ordered) {
      const score = scores.get(game.id)
      if (!score.scored && !isLocked(game) && !Number.isFinite(pickByGame.get(game.id)?.confidence)) {
        score.potential += (available.shift() ?? 0) + (game.gotw ? 5 : 0)
        estimated.add(game.id)
      }
    }
    let total = 0
    const values = [0]
    const increments = [0]
    const pointTitles = [`${player.name} · Start of week: 0`]
    for (const [index, group] of groups.entries()) {
      const increment = group.games.reduce((sum, game) => {
        const score = scores.get(game.id)
        const lost = score.scored && !score.correct ? score.stake : 0
        return sum + (metric === 'lost' ? lost : metric === 'net' ? score.points - lost : metric === 'potential' ? score.points + score.potential : score.points)
      }, 0)
      total += increment
      values.push(total)
      increments.push(increment)
      const estimate = metric === 'potential' && group.games.some((game) => estimated.has(game.id)) ? ' · Estimated allocation for hidden/unassigned picks' : ''
      pointTitles.push(`${player.name} · ${details[index + 1]} · Step: ${increment > 0 ? '+' : ''}${increment} · Cumulative: ${total}${estimate}`)
    }
    return { ...player, colorIndex, values, increments, pointTitles }
  })
  const humans = series.filter((player) => !player.model)
  const earned = (player) => groups.flatMap((group) => group.games).reduce((sum, game) => sum + scorePick((picksByUser[player.id] ?? []).find((pick) => pick.gameId === game.id), game, provisional).points, 0)
  const leader = (value) => humans.reduce((best, player) => !best || value(player) > value(best) ? player : best, null)
  const baseline = benchmark === 'weekly-leader' ? leader(earned) : benchmark === 'season-leader' ? leader((player) => seasonTotals.get(player.id) ?? 0) : series.find((player) => player.id === benchmark)
  const visible = series.filter((player) => players.some((item) => item.id === player.id))
  const relativeSeries = baseline ? visible.map((player) => {
    const values = player.values.map((value, index) => value - baseline.values[index])
    const increments = player.increments.map((value, index) => value - baseline.increments[index])
    return { ...player, values, increments, pointTitles: player.pointTitles.map((title, index) => `${title} · Vs ${baseline.name}: step ${increments[index]}, cumulative ${values[index]}`) }
  }) : visible
  return { series: relativeSeries, labels, details, benchmarkName: baseline?.name }

}

export function WeekProgressChart({ players, games, picksByUser, provisional = false, viewerId, weekLabel, seasonTotals = new Map(), seasonFinalTotals = seasonTotals }) {
  const [benchmark, setBenchmark] = useState('weekly-leader')
  const [includeLive, setIncludeLive] = useState(provisional)
  const [metric, setMetric] = useState('earned')
  const [groupKickoffs, setGroupKickoffs] = useState(false)
  const [order, setOrder] = useState('kickoff')
  const [ascending, setAscending] = useState(false)
  const [excluded, setExcluded] = useState([])
  const data = weekProgressData(players, games, picksByUser, { metric, groupKickoffs, provisional: includeLive, viewerId, order, ascending, includeLive, benchmark, seasonTotals: includeLive ? seasonTotals : seasonFinalTotals })
  const series = data.series.filter((player) => !excluded.includes(player.id))
  const metricLabel = METRICS.find((item) => item.value === metric).label
  const description = `${weekLabel}: cumulative ${metricLabel.toLowerCase()} in ${order === 'kickoff' ? 'kickoff order' : `${ORDERS.find((item) => item.value === order).label} order (${ascending ? 'lowest first' : 'highest first'})`}, starting at zero. ${benchmark === 'absolute' ? 'Absolute totals.' : `Relative to ${data.benchmarkName ?? 'the selected benchmark'} at every step; the same benchmark is used throughout the week. Leaders are human players ranked by earned points.`} ${groupKickoffs ? 'Games sharing a kickoff stay together; Sunday late kickoffs (16:05 and 16:25 ET) merge into one window; sorting uses their mean confidence or Dev.' : 'Each step is one game.'} Dev measures disagreement among revealed human picks; unavailable values sort last. Slate labels use US Eastern time. ${metric === 'potential' ? 'Potential = earned plus remaining points. Hidden/unassigned future stakes are estimated, highest available confidence first; their per-game path is not a prediction.' : metric === 'lost' ? 'Losses accumulate as positive values.' : metric === 'net' ? 'Net = earned minus lost points.' : 'Only scored games add earned points.'} Includes GOTW bonuses. Live games ${includeLive ? 'included with provisional scores' : 'excluded from the chart'}. Hover a marker or view chart data for game details.${series.length ? '' : ' Select at least one player to show a line.'}`
  const controls = <>
    <label>Compare with <select aria-label="Week progress benchmark" value={benchmark} onChange={(event) => setBenchmark(event.target.value)}>
      <option value="weekly-leader">Weekly leader (default)</option><option value="season-leader">Season total leader</option><option value="absolute">Absolute points</option>
      {players.filter((player) => !player.model).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
      <option value="model-fpi">FPI model</option><option value="model-moneyline">ML model</option><option value="model-avg">AVG model</option>
    </select></label>
    <label><input type="checkbox" aria-label="Week progress include live games" checked={includeLive} onChange={(event) => setIncludeLive(event.target.checked)} />Include live games</label>
    <label>Order <select aria-label="Week progress order" value={order} onChange={(event) => setOrder(event.target.value)}>{ORDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    {order !== 'kickoff' && <label>Direction <select aria-label="Week progress sort direction" value={ascending ? 'ascending' : 'descending'} onChange={(event) => setAscending(event.target.value === 'ascending')}><option value="descending">Highest first</option><option value="ascending">Lowest first</option></select></label>}
    <label>Grouping <select aria-label="Week progress grouping" value={groupKickoffs ? 'kickoff' : 'game'} onChange={(event) => setGroupKickoffs(event.target.value === 'kickoff')}><option value="game">Individual games</option><option value="kickoff">Same kickoff time</option></select></label>
    <details className="week-progress-players"><summary>Players ({series.length}/{players.length})</summary>
      <div role="group" aria-label="Week progress players">
        <button type="button" onClick={() => setExcluded([])}>All players</button>
        {players.map((player) => <label key={player.id}><input type="checkbox" checked={!excluded.includes(player.id)} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((id) => id !== player.id) : [...current, player.id])} />{player.name}</label>)}
      </div>
    </details>
  </>
  return <ChartFrame id="week-progress" title="Week progress" description={description} modes={METRICS} mode={metric} onMode={setMetric} controls={controls}
    table={<AccessibleTable caption={`${weekLabel} — ${metricLabel}`} columns={['Step / games (Berlin time)', ...series.map((player) => player.name)]} rows={data.details.map((detail, index) => [`${data.labels[index]} · ${detail}`, ...series.map((player) => player.values[index])])} />}>
    <LineSvg series={series} labels={data.labels} ariaLabel={`${weekLabel} cumulative ${metricLabel.toLowerCase()}`} stepped endValues zeroReference verticalLabels />
  </ChartFrame>
}
