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
export function weekProgressData(players, games, picksByUser, { metric = 'earned', groupKickoffs = false, provisional = false, viewerId, order = 'kickoff', ascending = false } = {}) {
  const ordered = [...games].sort((a, b) => kickoffTime(a) - kickoffTime(b) || String(a.id).localeCompare(String(b.id)))
  const groups = []
  for (const game of ordered) {
    const time = kickoffTime(game)
    const previous = groups.at(-1)
    if (groupKickoffs && Number.isFinite(time) && previous?.time === time) previous.games.push(game)
    else groups.push({ time, games: [game] })
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
  const details = ['Start of week', ...groups.map((group) => `${group.games.map((game) => `${game.away} @ ${game.home}`).join(', ')} · ${kickoffLabel(group.games[0])}`)]
  const series = players.map((player, colorIndex) => {
    const picks = (picksByUser[player.id] ?? []).filter((pick) => {
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
  return { series, labels, details }
}

export function WeekProgressChart({ players, games, picksByUser, provisional = false, viewerId, weekLabel }) {
  const [metric, setMetric] = useState('earned')
  const [groupKickoffs, setGroupKickoffs] = useState(false)
  const [order, setOrder] = useState('kickoff')
  const [ascending, setAscending] = useState(false)
  const [excluded, setExcluded] = useState([])
  const data = weekProgressData(players, games, picksByUser, { metric, groupKickoffs, provisional, viewerId, order, ascending })
  const series = data.series.filter((player) => !excluded.includes(player.id))
  const metricLabel = METRICS.find((item) => item.value === metric).label
  const description = `${weekLabel}: cumulative ${metricLabel.toLowerCase()} in ${order === 'kickoff' ? 'kickoff order' : `${ORDERS.find((item) => item.value === order).label} order (${ascending ? 'lowest first' : 'highest first'})`}, starting at zero. ${groupKickoffs ? 'Games sharing an exact kickoff stay together; sorting uses their mean confidence or Dev.' : 'Each step is one game.'} Dev measures disagreement among revealed human picks; unavailable values sort last. Slate labels use US Eastern time. ${metric === 'potential' ? 'Potential = earned plus remaining points. Hidden/unassigned future stakes are estimated, highest available confidence first; their per-game path is not a prediction.' : metric === 'lost' ? 'Losses accumulate as positive values.' : metric === 'net' ? 'Net = earned minus lost points.' : 'Only scored games add earned points.'} Includes GOTW bonuses. Live scores ${provisional ? 'included provisionally' : 'excluded'}. Hover a marker or view chart data for game details.${series.length ? '' : ' Select at least one player to show a line.'}`
  const controls = <>
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
