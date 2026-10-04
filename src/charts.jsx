import React, { useEffect, useRef, useState } from 'react'
import { isLocked, modelPicks, scorePick } from './domain.js'

// Paul Tol's colorblind-friendly bright palette, reordered for four player hues.
// Theme variants improve contrast; marker shapes identify series without color.
export const COLORS = ['#4477aa', '#ccbb44', '#228833', '#ee6677', '#66ccee', '#aa3377', '#bbbbbb']

const MARKER_PATHS = [null, 'M-4-4H4V4H-4Z', 'M0-5 5 4H-5Z', 'M0-5 5 0 0 5-5 0Z', 'M-5-2H-2V-5H2V-2H5V2H2V5H-2V2H-5Z', 'M-5-3-3-5 0-2 3-5 5-3 2 0 5 3 3 5 0 2-3 5-5 3-2 0Z', 'M0-5 4-2.5 4 2.5 0 5-4 2.5-4-2.5Z']

function SeriesMarker({ index, x, y, title }) {
  const markerIndex = index % COLORS.length
  const style = { fill: `var(--chart-color-${markerIndex}, ${COLORS[markerIndex]})`, stroke: 'var(--chart-marker-outline, #0c192b)', strokeWidth: 1 }
  return <g data-series-marker={markerIndex} transform={`translate(${x} ${y})`}>
    {title && <title>{title}</title>}
    {markerIndex === 0 ? <circle r="4.5" style={style} /> : <path d={MARKER_PATHS[markerIndex]} style={style} />}
  </g>
}

export function relativeGamePoints(players, gamesByPool, picksByUser, playerId, poolKeys, direction = 'top', limit = 10, includeLostPoints = false) {
  const selectedPlayers = playerId == null ? players : players.filter((player) => player.id === playerId)
  if (players.length < 2 || !selectedPlayers.length) return []
  return poolKeys.flatMap((poolKey) => (gamesByPool[poolKey] ?? []).flatMap((game) => {
    if (!['final', 'post'].includes(game.status) || !Number.isFinite(game.homeScore) || !Number.isFinite(game.awayScore)) return []
    const pickFor = (id) => picksByUser[id]?.[poolKey]?.find((pick) => pick.gameId === game.id)
    const scores = players.map((player) => {
      const pick = pickFor(player.id)
      const score = scorePick(pick, game)
      return { player, pick, points: includeLostPoints && score.stake && !score.correct ? -score.stake : score.points }
    })
    return selectedPlayers.map((player) => {
      const own = scores.find((score) => score.player.id === player.id)
      const others = scores.filter((score) => score.player.id !== player.id)
      const mean = others.reduce((sum, score) => sum + score.points, 0) / others.length
      return { poolKey, game, playerId: player.id, playerName: player.name, team: own.pick?.team, points: own.points, mean, difference: own.points - mean }
    })
  })).sort((a, b) => (direction === 'bottom' ? a.difference - b.difference : b.difference - a.difference)
    || a.poolKey.localeCompare(b.poolKey) || String(a.game.id).localeCompare(String(b.game.id)) || a.playerName.localeCompare(b.playerName)).slice(0, limit)
}

export function RelativeGamePointsTable({ players, gamesByPool, picksByUser, viewerId, poolKeys, weekLabels, selectedPoolKey }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [ranking, setRanking] = useState('top10')
  const [scope, setScope] = useState('week')
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [includeLostPoints, setIncludeLostPoints] = useState(true)
  const allPlayers = selectedPlayer === 'all'
  const playerId = allPlayers ? null : players.some((player) => player.id === selectedPlayer) ? selectedPlayer
    : players.some((player) => player.id === viewerId) ? viewerId : players[0]?.id
  const direction = ranking.startsWith('bottom') ? 'bottom' : 'top'
  const limit = Number(ranking.slice(-2))
  const week = poolKeys.includes(selectedWeek) ? selectedWeek : poolKeys.includes(selectedPoolKey) ? selectedPoolKey : poolKeys.at(-1)
  const rows = relativeGamePoints(players, gamesByPool, picksByUser, playerId, scope === 'season' ? poolKeys : [week], direction, limit, includeLostPoints)
  const caption = `${direction === 'top' ? 'Top' : 'Bottom'} ${limit} ${allPlayers ? 'player-game results across all players' : 'games'} by ${includeLostPoints ? 'net' : 'points'} difference`
  return <section className="chart-card relative-game-points" aria-labelledby="relative-game-points-title">
    <div className="chart-heading">
      <div><h3 id="relative-game-points-title">Game points vs other players</h3><p id="relative-game-points-description">{includeLostPoints
        ? 'Completed games only. Net points = earned points on winning picks, minus committed points on losing picks. Difference = player’s net points − all other players’ mean. Includes GOTW bonuses; missed picks count as zero and ties follow official scoring. This comparison does not change official scores.'
        : 'Completed games only. Difference = player’s earned points − all other players’ mean for that game. Includes GOTW bonuses; losing and missed picks earn zero.'}</p></div>
      <div className="chart-actions">
        <label>Player <select aria-label="Game points player" value={allPlayers ? 'all' : playerId ?? ''} onChange={(event) => setSelectedPlayer(event.target.value)}><option value="all">All players</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label>Ranking <select aria-label="Game points ranking" value={ranking} onChange={(event) => setRanking(event.target.value)}><option value="top10">Top 10</option><option value="bottom10">Bottom 10</option><option value="top25">Top 25</option><option value="bottom25">Bottom 25</option></select></label>
        <label>Period <select aria-label="Game points period" value={scope} onChange={(event) => setScope(event.target.value)}><option value="week">By week</option><option value="season">Whole season</option></select></label>
        {scope === 'week' && <label>Week <select aria-label="Game points week" value={week ?? ''} onChange={(event) => setSelectedWeek(event.target.value)}>{poolKeys.map((key, index) => <option key={key} value={key}>{weekLabels[index]}</option>)}</select></label>}
        <label className="lost-points-toggle"><input type="checkbox" checked={includeLostPoints} onChange={(event) => setIncludeLostPoints(event.target.checked)} aria-describedby="relative-game-points-description" />Include lost points</label>
      </div>
    </div>
    {rows.length ? <div className="table-scroll"><table className={allPlayers ? 'all-players' : undefined}>
      <caption>{caption}</caption>
      <thead><tr>{['Rank', ...(allPlayers ? ['Player'] : []), 'Week', 'Game', 'Pick', 'Difference', includeLostPoints ? 'Net points' : 'Points', 'Others’ mean'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.poolKey}-${row.game.id}-${row.playerId}`}>
        <td>{index + 1}</td>{allPlayers && <td>{row.playerName}</td>}<td>{weekLabels[poolKeys.indexOf(row.poolKey)]}</td><td>{row.game.away} @ {row.game.home}{row.game.gotw ? ' (GOTW)' : ''}</td><td>{row.team || 'Not picked'}</td><td>{row.difference > 0 ? '+' : ''}{row.difference.toFixed(1)}</td><td>{row.points}</td><td>{row.mean.toFixed(1)}</td>
      </tr>)}</tbody>
    </table></div> : <p>No completed games to compare. At least two players are required.</p>}
  </section>
}

export function toDisplay(value, mode, maximum = 1, leader = 0) {
  if (mode === 'percent') return maximum ? (value / maximum) * 100 : 0
  if (mode === 'vs_leader') return value - leader
  return value
}

export const weeklyChartSeries = (history, mode) => history.users.map((user) => ({
  name: user.name,
  values: user.weekly.map((value, index) => mode === 'points_percentage'
    ? (user.lockedPossible[index] ? value / user.lockedPossible[index] * 100 : 0)
    : mode === 'correct_percentage'
      ? (user.lockedGameCounts[index] ? user.correct[index] / user.lockedGameCounts[index] * 100 : 0)
      : value),
}))

export const cumulativeChartSeries = (history, showPotential = true) => history.users.map((user) => ({
  name: user.name,
  values: user.relative,
  ...(showPotential ? { potentialValues: user.relativePotential } : {}),
}))

export const gotwChartData = (history, mode) => history.users.map((user, colorIndex) => ({
  name: user.name,
  colorIndex,
  value: mode === 'points_percentage'
    ? (user.gotwPossible ? user.gotw / user.gotwPossible * 100 : 0)
    : mode === 'correct_percentage'
      ? (user.gotwLockedCount ? user.gotwCorrect / user.gotwLockedCount * 100 : 0)
      : user.gotw,
})).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

function teamBenchmarkComparisons(players, gamesByPool, picksByUser, playerId, benchmark, poolKeys, includeLive) {
  const selectedPlayers = playerId == null ? players : players.filter((player) => player.id === playerId)
  const benchmarkPlayerId = benchmark.startsWith('player:') ? benchmark.slice('player:'.length) : null
  const comparisons = []
  for (const poolKey of poolKeys) {
    const games = gamesByPool[poolKey] ?? []
    const gamesById = new Map(games.map((game) => [game.id, game]))
    const benchmarkPicks = benchmarkPlayerId
      ? new Map((picksByUser[benchmarkPlayerId]?.[poolKey] ?? []).map((pick) => [pick.gameId, pick]))
      : new Map(modelPicks(games, benchmark).map((pick) => [pick.gameId, pick]))
    for (const player of selectedPlayers) {
      for (const pick of picksByUser[player.id]?.[poolKey] ?? []) {
        const game = gamesById.get(pick.gameId)
        const benchmarkPick = benchmarkPicks.get(pick.gameId)
        const live = ['live', 'in'].includes(game?.status)
        if (!game || !benchmarkPick || !(['final', 'post'].includes(game.status) || (includeLive && live)) || !Number.isFinite(game.homeScore) || !Number.isFinite(game.awayScore)
          || !Number.isInteger(pick.confidence) || ![game.away, game.home].includes(pick.team)
          || !Number.isInteger(benchmarkPick.confidence) || ![game.away, game.home].includes(benchmarkPick.team)) continue
        const playerScore = scorePick(pick, game, live)
        const benchmarkScore = scorePick(benchmarkPick, game, live)
        const playerSignedStake = (pick.team === game.home ? 1 : -1) * playerScore.stake
        const benchmarkSignedStake = (benchmarkPick.team === game.home ? 1 : -1) * benchmarkScore.stake
        const relativeSignedStake = playerSignedStake - benchmarkSignedStake
        if (!relativeSignedStake) continue
        const liveTie = live && game.homeScore === game.awayScore
        const playerNet = liveTie ? 0 : playerScore.correct ? playerScore.points : -playerScore.stake
        const benchmarkNet = liveTie ? 0 : benchmarkScore.correct ? benchmarkScore.points : -benchmarkScore.stake
        comparisons.push({
          resultKey: `${poolKey}:${game.id}`,
          overweightTeam: relativeSignedStake > 0 ? game.home : game.away,
          underweightTeam: relativeSignedStake > 0 ? game.away : game.home,
          relativeStake: Math.abs(relativeSignedStake),
          playerNet,
          benchmarkNet,
          impact: playerNet - benchmarkNet,
          live,
          outcome: game.homeScore === game.awayScore ? 'tied' : ((relativeSignedStake > 0) === (game.homeScore > game.awayScore) ? 'winning' : 'losing'),
        })
      }
    }
  }
  return comparisons
}

function recordTeamResult(row, comparison, value, opposite = false) {
  row.finalValue = (row.finalValue ?? 0) + (comparison.live ? 0 : value)
  row.liveValue = (row.liveValue ?? 0) + (comparison.live ? value : 0)
  row.liveGames = (row.liveGames ?? 0) + Number(comparison.live)
  row.outcomes ??= {}
  const outcome = opposite && comparison.outcome !== 'tied' ? (comparison.outcome === 'winning' ? 'losing' : 'winning') : comparison.outcome
  const label = comparison.live ? { winning: 'Leading', losing: 'Trailing', tied: 'Live tied' }[outcome] : { winning: 'Won', losing: 'Lost', tied: 'Tied' }[outcome]
  row.resultKeys ??= []
  if (!row.resultKeys.includes(comparison.resultKey)) {
    row.resultKeys.push(comparison.resultKey)
    row.outcomes[label] = (row.outcomes[label] ?? 0) + 1
  }
}

export function teamResultLabel(row) {
  return Object.entries(row.outcomes ?? {}).map(([label, count]) => `${label} ${count}`).join(' · ')
}

export function teamBenchmarkRelativePoints(players, gamesByPool, picksByUser, playerId, benchmark, poolKeys = Object.keys(gamesByPool), includeLive = true) {
  const totals = new Map()
  for (const comparison of teamBenchmarkComparisons(players, gamesByPool, picksByUser, playerId, benchmark, poolKeys, includeLive)) {
    const current = totals.get(comparison.overweightTeam) ?? { name: comparison.overweightTeam, value: 0, relativeStake: 0, playerNet: 0, benchmarkNet: 0, comparisons: 0 }
    recordTeamResult(current, comparison, comparison.impact)
    current.value += comparison.impact
    current.relativeStake += comparison.relativeStake
    current.playerNet += comparison.playerNet
    current.benchmarkNet += comparison.benchmarkNet
    current.comparisons += 1
    totals.set(comparison.overweightTeam, current)
  }
  return [...totals.values()].sort((a, b) => b.value - a.value || b.relativeStake - a.relativeStake || a.name.localeCompare(b.name))
}

export function teamBenchmarkRelativeExposure(players, gamesByPool, picksByUser, playerId, benchmark, poolKeys = Object.keys(gamesByPool), includeLive = true) {
  const totals = new Map()
  const add = (team, value, comparison, opposite = false) => {
    const current = totals.get(team) ?? { name: team, value: 0, comparisons: 0 }
    recordTeamResult(current, comparison, value, opposite)
    current.value += value
    current.comparisons += 1
    totals.set(team, current)
  }
  for (const comparison of teamBenchmarkComparisons(players, gamesByPool, picksByUser, playerId, benchmark, poolKeys, includeLive)) {
    add(comparison.overweightTeam, comparison.relativeStake, comparison)
    add(comparison.underweightTeam, -comparison.relativeStake, comparison, true)
  }
  return [...totals.values()].sort((a, b) => b.value - a.value || b.comparisons - a.comparisons || a.name.localeCompare(b.name))
}

export function aggressivenessChartData(players, gamesByPool, picksByUser, kind, poolKeys = Object.keys(gamesByPool)) {
  const comparisons = Object.fromEntries(players.map((player) => [player.id, []]))
  for (const poolKey of poolKeys) {
    const games = gamesByPool[poolKey] ?? []
    const models = new Map(modelPicks(games, kind).map((pick) => [pick.gameId, pick]))
    for (const player of players) {
      for (const pick of picksByUser[player.id]?.[poolKey] ?? []) {
        const game = games.find((item) => item.id === pick.gameId)
        const model = models.get(pick.gameId)
        if (!game || !isLocked(game) || !model || !Number.isInteger(pick.confidence) || ![game.away, game.home].includes(pick.team)) continue
        const signed = pick.team === game.home ? pick.confidence : -pick.confidence
        const modelSigned = model.team === game.home ? model.confidence : -model.confidence
        comparisons[player.id].push(Math.abs(signed - modelSigned))
      }
    }
  }
  return players.flatMap((player, colorIndex) => comparisons[player.id].length ? [{
    id: player.id,
    name: player.name,
    colorIndex,
    value: comparisons[player.id].reduce((sum, value) => sum + value, 0) / comparisons[player.id].length,
    comparisons: comparisons[player.id].length,
  }] : []).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export function weeklyAggressivenessSeries(players, gamesByPool, picksByUser, kind, poolKeys) {
  const weeks = poolKeys.map((poolKey) => new Map(aggressivenessChartData(players, gamesByPool, picksByUser, kind, [poolKey]).map((item) => [item.id, item.value])))
  return players.map((player) => ({ name: player.name, values: weeks.map((week) => week.get(player.id) ?? null) }))
}

export function currentWeekChartData(current, mode) {
  const leader = Math.max(0, ...current.map((item) => item.points))
  const weeklyLeader = current.filter((item) => item.points === leader).reduce((best, item) => !best || item.points + item.potential > best.points + best.potential ? item : best, null)
  const seasonLeader = current.reduce((best, item) => !best || item.seasonTotal > best.seasonTotal ? item : best, null)
  const baseline = mode === 'vs_leader' ? weeklyLeader : mode === 'vs_total_leader' ? seasonLeader : null
  return current.map((item, colorIndex) => {
    if (mode === 'points_lost') return { name: item.name, colorIndex, value: -(item.pointsLost ?? 0) || 0, potential: -(item.potentialPointsLost ?? (item.pointsLost ?? 0) + item.potential) || 0 }
    if (mode === 'points_percentage') return { name: item.name, colorIndex, value: item.lockedMaximum ? item.points / item.lockedMaximum * 100 : 0 }
    if (mode === 'correct_percentage') return { name: item.name, colorIndex, value: item.lockedGameCount ? item.correct / item.lockedGameCount * 100 : 0 }
    if (baseline) return { name: item.name, colorIndex, value: item.points - baseline.points, potential: item.points + item.potential - baseline.points - baseline.potential }
    return { name: item.name, colorIndex, value: item.points, potential: item.points + item.potential }
  }).sort((a, b) => mode === 'vs_total_leader' && a.name === seasonLeader?.name ? -1 : mode === 'vs_total_leader' && b.name === seasonLeader?.name ? 1 : b.value - a.value || a.name.localeCompare(b.name))
}

export function svgToPngBlob(svg) {
  return new Promise((resolve, reject) => {
    const copy = svg.cloneNode(true)
    const originals = [svg, ...svg.querySelectorAll('*')]
    ;[copy, ...copy.querySelectorAll('*')].forEach((element, index) => {
      const style = getComputedStyle(originals[index])
      for (const property of ['fill', 'stroke', 'font-family', 'font-size', 'font-weight']) element.style.setProperty(property, style.getPropertyValue(property))
    })
    const source = new XMLSerializer().serializeToString(copy)
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 600
    const context = canvas.getContext('2d')
    const image = new Image()
    image.onload = () => {
    context.fillStyle = '#07111f'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(resolve, 'image/png')
    }
    image.onerror = reject
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  })
}

export function downloadPngBlob(blob, filename) {
  const link = document.createElement('a')
  link.download = filename
  link.href = URL.createObjectURL(blob)
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

export async function sharePngBlob(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) return navigator.share({ title: 'NFL Pick’em 2026', files: [file] })
  return downloadPngBlob(blob, filename)
}

export async function downloadSvgAsPng(svg, filename) {
  downloadPngBlob(await svgToPngBlob(svg), filename)
}

export async function shareSvgAsPng(svg, filename) {
  return sharePngBlob(await svgToPngBlob(svg), filename)
}

export function ChartIcon({ type }) {
  return type === 'share'
    ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 5 8 2 5 5M8 2v8M3 8v5h10V8" /></svg>
    : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3M3 12v2h10v-2" /></svg>
}

function ChartActions({ id, chartRef, showData, onToggleData }) {
  return <div className="chart-actions chart-actions-bottom">
    <button type="button" className="chart-data-toggle" aria-expanded={showData} aria-controls={`${id}-data`} onClick={onToggleData}>View chart data</button>
    <button type="button" title="Share chart as PNG" aria-label="Share chart as PNG" onClick={() => shareSvgAsPng(chartRef.current, `${id}.png`)}><ChartIcon type="share" /></button>
    <button type="button" title="Download chart as PNG" aria-label="Download chart as PNG" onClick={() => downloadSvgAsPng(chartRef.current, `${id}.png`)}><ChartIcon type="download" /></button>
  </div>
}

function ChartFrame({ id, title, description, modes = [], mode, onMode, modeLabel = 'Display', controls, children, table }) {
  const ref = useRef(null)
  const [showData, setShowData] = useState(false)
  return <section className={`chart-card chart-card-${id}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
    <div className="chart-heading">
      <h3 id={`${id}-title`}>{title}</h3>
      <div className="chart-actions">
        {modes.length > 0 && <label>{modeLabel} <select aria-label={`${title} ${modeLabel === 'Display' ? 'display mode' : modeLabel.toLowerCase()}`} value={mode} onChange={(event) => onMode(event.target.value)}>{modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
        {controls}
      </div>
    </div>
    <div className="chart-scroll">{React.cloneElement(children, { chartRef: ref })}</div>
    <p className="chart-description" id={`${id}-description`}>{description}</p>
    <ChartActions id={id} chartRef={ref} showData={showData} onToggleData={() => setShowData((open) => !open)} />
    <div id={`${id}-data`} hidden={!showData}>{table}</div>
  </section>
}

const safeRange = (values) => {
  const finite = values.filter(Number.isFinite)
  const min = Math.min(0, ...finite)
  const max = Math.max(1, ...finite)
  return { min, max, span: max - min || 1 }
}

export function naturalRange(values) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return { min: -1, max: 1, span: 2 }
  const low = Math.min(...finite), high = Math.max(...finite)
  const padding = Math.max(1, (high - low) * 0.1)
  return { min: low - padding, max: high + padding, span: high - low + padding * 2 }
}

export function weeklyAxisTicks(values) {
  const { min, max, span } = naturalRange(values)
  const roughStep = Math.max(1, span / 5)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= roughStep)
  const first = Math.floor(min / step) * step
  const last = Math.ceil(max / step) * step
  return Array.from({ length: Math.round((last - first) / step) + 1 }, (_, index) => first + index * step)
}

export function leaderAxisTicks(values) {
  const finite = values.filter(Number.isFinite)
  const low = Math.min(0, ...finite)
  const high = Math.max(0, ...finite)
  if (low === high) return [-1, 0, 1]
  const roughStep = (high - low) / 5
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= roughStep)
  const first = Math.floor(low / step) * step
  const last = Math.ceil(high / step) * step
  return Array.from({ length: Math.round((last - first) / step) + 1 }, (_, index) => Number((first + index * step).toPrecision(10)))
}

function useCompactChart() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 430)
  useEffect(() => {
    const update = () => setCompact(window.innerWidth <= 430)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return compact
}

export function chartLegendLayout(series, left, availableWidth) {
  let x = left, row = 0
  return series.map((item) => {
    const width = Math.max(96, item.name.length * 7.5 + 42)
    if (x > left && x + width > left + availableWidth) { x = left; row += 1 }
    const position = { x, y: 20 + row * 22, width, row }
    x += width
    return position
  })
}

function spreadEndLabels(items, minY, maxY) {
  const sorted = [...items].sort((a, b) => a.targetY - b.targetY)
  const gap = Math.min(15, sorted.length > 1 ? (maxY - minY) / (sorted.length - 1) : 15)
  sorted.forEach((item, index) => { item.labelY = Math.max(item.targetY, index ? sorted[index - 1].labelY + gap : minY) })
  const overflow = (sorted.at(-1)?.labelY ?? maxY) - maxY
  if (overflow > 0) sorted.forEach((item) => { item.labelY -= overflow })
  return sorted
}

const displayValue = (value) => Number.isInteger(value) ? `${value}` : value.toFixed(1)

function LineSvg({ series, labels, chartRef, ariaLabel, endValues = false, zeroReference = false, natural = false }) {
  const compact = useCompactChart()
  const width = compact ? 360 : 800
  const height = compact ? 310 : 330, left = compact ? 36 : 54, right = endValues ? (compact ? 52 : 74) : 24, bottom = 32
  const legend = chartLegendLayout(series, left, width - left - 24)
  const top = 44 + (legend.at(-1)?.row ?? 0) * 22
  const values = series.flatMap((item) => [...item.values, ...(item.potentialValues ?? [])])
  const ticks = zeroReference ? leaderAxisTicks(values) : natural ? weeklyAxisTicks(values) : null
  const { min, max, span } = ticks ? { min: ticks[0], max: ticks.at(-1), span: ticks.at(-1) - ticks[0] } : natural ? naturalRange(values) : safeRange(values)
  const x = (index) => labels.length === 1 ? (width - right + left) / 2 : left + index * (width - left - right) / (labels.length - 1)
  const y = (value) => top + (max - value) * (height - top - bottom) / span
  const endLabels = endValues ? spreadEndLabels(series.flatMap((item, seriesIndex) => [
    { item, seriesIndex, kind: 'earned', values: item.values },
    ...(item.potentialValues && (item.values.findLastIndex(Number.isFinite) !== item.potentialValues.findLastIndex(Number.isFinite)
      || item.values.findLast(Number.isFinite) !== item.potentialValues.findLast(Number.isFinite)) ? [{ item, seriesIndex, kind: 'potential', values: item.potentialValues }] : []),
  ]).flatMap((entry) => {
    const index = entry.values.findLastIndex(Number.isFinite)
    return index < 0 ? [] : [{ ...entry, value: entry.values[index], targetX: x(index), targetY: y(entry.values[index]) }]
  }), top + 7, height - bottom - 7) : []
  return <svg ref={chartRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
    <rect width={width} height={height} fill="#0c192b" rx="10" />
    {series.map((item, index) => <g data-chart-legend key={`legend-${item.name}`} transform={`translate(${legend[index].x} ${legend[index].y})`}><line x2="22" stroke={COLORS[index % COLORS.length]} strokeWidth="4" /><SeriesMarker index={index} x={11} y={0} /><text x="29" y="4">{item.name}</text></g>)}
    {(ticks ?? [0, 1, 2, 3, 4].map((tick) => min + span * tick / 4)).map((value) => <g key={value} data-axis-tick={value}>{(!zeroReference || Math.abs(value) > Number.EPSILON) && <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#29415e" />}<text x={left - 8} y={y(value) + 4} textAnchor="end">{ticks || natural ? displayValue(value) : Math.round(value)}</text></g>)}
    {zeroReference && <line data-zero-reference x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="#fff" strokeWidth="1" strokeDasharray="4,4" />}
    {labels.map((label, index) => (compact && labels.length > 8 && index % Math.ceil(labels.length / 8) !== 0 && index !== labels.length - 1) ? null : <text key={label} x={x(index)} y={height - 10} textAnchor="middle">{label}</text>)}
    {series.map((item, seriesIndex) => <g key={item.name}>
      <polyline fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="4" points={item.values.flatMap((value, index) => Number.isFinite(value) ? [`${x(index)},${y(value)}`] : []).join(' ')} />
      {item.potentialValues && <polyline fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="4" strokeDasharray="5,5" points={item.potentialValues.flatMap((value, index) => Number.isFinite(value) ? [`${x(index)},${y(value)}`] : []).join(' ')} />}
      {item.values.map((value, index) => Number.isFinite(value) ? <SeriesMarker key={index} index={seriesIndex} x={x(index)} y={y(value)} title={`${item.name}, ${labels[index]}: ${value.toFixed(1)}`} /> : null)}
    </g>)}
    {endLabels.map(({ item, seriesIndex, kind, value, targetX, targetY, labelY }) => <g key={`${item.name}-${kind}`} data-end-label={kind}>
      <line x1={targetX + 5} x2={width - right + 9} y1={targetY} y2={labelY} stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="1" strokeDasharray={kind === 'potential' ? '3,3' : undefined} />
      <text x={width - right + 12} y={labelY + 4} style={{ fill: `var(--chart-color-${seriesIndex % COLORS.length}, ${COLORS[seriesIndex % COLORS.length]})` }}>{displayValue(value)}{kind === 'potential' ? ' P' : ''}</text>
    </g>)}
  </svg>
}

function BarSvg({ data, chartRef, ariaLabel, potential = false }) {
  const compact = useCompactChart()
  const width = compact ? 360 : 800
  const height = compact ? 300 : 324, left = compact ? 40 : 50, right = 24, top = 28, bottom = compact ? 54 : 42
  const { min, max, span } = safeRange(data.flatMap((item) => [item.value, item.potential ?? item.value]))
  const y = (value) => top + (max - value) * (height - top - bottom) / span
  const zero = y(0), group = (width - left - right) / Math.max(1, data.length), bar = Math.min(84, group * .55)
  return <svg ref={chartRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
    <rect width={width} height={height} fill="#0c192b" rx="10" /><line x1={left} x2={width - right} y1={zero} y2={zero} stroke="#8ba0b9" />
    {data.map((item, index) => { const x = left + index * group + (group - bar) / 2; const topY = y(Math.max(0, item.value)); const barHeight = Math.abs(y(item.value) - zero); return <g key={item.name}>
      <rect x={x} y={item.value >= 0 ? topY : zero} width={bar} height={barHeight} fill={COLORS[(item.colorIndex ?? index) % COLORS.length]} rx="5"><title>{item.name}: {item.value.toFixed(1)}</title></rect>
      {potential && Number.isFinite(item.potential) && item.potential !== item.value && <g data-potential={item.name}>
        <title>{item.name} potential: {item.potential.toFixed(1)}</title>
        <line x1={x + bar + 8} x2={x + bar + 8} y1={y(item.value)} y2={y(item.potential)} stroke={COLORS[(item.colorIndex ?? index) % COLORS.length]} strokeWidth="2" strokeDasharray="4,3" />
        <line x1={x + bar + 3} x2={x + bar + 13} y1={y(item.potential)} y2={y(item.potential)} stroke={COLORS[(item.colorIndex ?? index) % COLORS.length]} strokeWidth="2" />
        <text x={compact ? x + bar / 2 : x + bar + 16} y={y(item.potential) + (compact ? -8 : 4)} textAnchor={compact ? "middle" : undefined}>{displayValue(item.potential)} P</text>
      </g>}
      <text x={x + bar / 2} y={item.value >= 0 ? topY - 7 : zero + barHeight + 15} textAnchor="middle">{item.value.toFixed(1)}</text>
      <text x={x + bar / 2} y={height - (compact ? 28 : 13)} textAnchor="middle" style={compact && data.length > 4 ? { fontSize: 11 } : undefined}><title>{item.name}</title>{compact ? item.name.split(/\s+/).map((word, wordIndex) => <tspan key={wordIndex} x={x + bar / 2} dy={wordIndex ? 14 : 0}>{word.length > (data.length > 4 ? 6 : 10) ? `${word.slice(0, data.length > 4 ? 5 : 9)}…` : word}</tspan>) : item.name}</text>
    </g>})}
  </svg>
}

export function teamBarValueLabelLayout(value, valueX, barX, barWidth, left) {
  const label = `${value > 0 ? '+' : ''}${displayValue(value)}`
  const estimatedWidth = Math.max(14, label.length * 7)
  const outsideX = value >= 0 ? valueX + 6 : valueX - 6
  const overlapsTeamColumn = value < 0 && outsideX - estimatedWidth < left - 1
  const fitsInsideBar = barWidth >= estimatedWidth + 12
  if (overlapsTeamColumn && fitsInsideBar) return { x: barX + 6, anchor: 'start', inside: true, fill: '#fff', label }
  return { x: outsideX, anchor: value >= 0 ? 'start' : 'end', inside: false, fill: null, label }
}

export function compactTeamRecord(item) {
  const outcomes = item.outcomes ?? {}
  return `(W:${outcomes.Won ?? 0}/L:${outcomes.Lost ?? 0}${outcomes.Tied ? `/T:${outcomes.Tied}` : ''})`
}

function TeamOutcomeBadge({ label, count, x, y }) {
  const live = ['Leading', 'Trailing', 'Live tied'].includes(label)
  const winning = ['Won', 'Leading'].includes(label)
  const losing = ['Lost', 'Trailing'].includes(label)
  const color = winning ? 'var(--chart-color-2, #228833)' : losing ? 'var(--chart-color-3, #ee6677)' : 'var(--muted, #b7c7da)'
  return <g data-team-outcome={label} data-live-outcome={live || undefined} transform={`translate(${x} ${y})`}>
    <title>{label}: {count} compared {count === 1 ? 'game' : 'games'}</title>
    <ellipse rx="7" ry="7" fill="none" style={{ stroke: color }} strokeWidth="1.5" strokeDasharray={live ? '2,2' : undefined} />
    <path d={winning ? 'M-3 0-1 2 3-2' : losing ? 'M-2.5-2.5 2.5 2.5M-2.5 2.5 2.5-2.5' : 'M-3 0H3'} fill="none" style={{ stroke: color }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </g>
}

function RankedTeamBarSvg({ data, chartRef, ariaLabel, singleWeek = false }) {
  const compact = useCompactChart()
  const width = compact ? 360 : 800, top = 24, bottom = 20, right = 64, rowHeight = 24
  const labels = data.map((item) => singleWeek ? item.name : `${item.name} ${compactTeamRecord(item)}`)
  const left = Math.max(singleWeek ? 90 : 110, ...data.map((item, index) => singleWeek
    ? item.name.length * 8 + Object.keys(item.outcomes ?? {}).length * 18 + 15
    : labels[index].length * 7 + 15))
  const height = Math.max(100, top + bottom + data.length * rowHeight)
  const values = data.flatMap((item) => [item.value, item.finalValue ?? item.value])
  const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1
  const x = (value) => left + (value - min) * (width - left - right) / span
  const zero = x(0)
  return <svg ref={chartRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
    <rect width={width} height={height} fill="#0c192b" rx="10" />
    <line x1={zero} x2={zero} y1={top - 8} y2={height - bottom + 4} stroke="#fff" strokeWidth="1" strokeDasharray="4,4" />
    {!data.length && <text x={width / 2} y={height / 2} textAnchor="middle">No comparable completed or live picks</text>}
    {data.map((item, index) => {
      const y = top + index * rowHeight
      const valueX = x(item.value)
      const barX = Math.min(zero, valueX)
      const barWidth = Math.max(1, Math.abs(valueX - zero))
      const valueLabel = teamBarValueLabelLayout(item.value, valueX, barX, barWidth, left)
      const resultLabel = teamResultLabel(item)
      const finalX = x(item.finalValue ?? item.value)
      const outcomes = Object.entries(item.outcomes ?? {})
      const tooltip = Number.isFinite(item.playerNet) && Number.isFinite(item.benchmarkNet)
        ? `${item.name}: ${displayValue(item.value)} net impact vs benchmark; relative stake ${displayValue(item.relativeStake)}; player net ${displayValue(item.playerNet)}; benchmark net ${displayValue(item.benchmarkNet)}; ${item.comparisons} relative games; ${resultLabel}`
        : `${item.name}: ${displayValue(item.value)} net relative stake; ${item.comparisons} relative games; ${resultLabel}`
      return <g key={item.name} data-team-row={item.name}>
        <text data-team-label x={left - 9 - (singleWeek ? outcomes.length * 18 : 0)} y={y + 12} textAnchor="end">{labels[index]}</text>
        {singleWeek && outcomes.map(([label, count], outcomeIndex) => <TeamOutcomeBadge key={label} label={label} count={count} x={left - 16 - (outcomes.length - outcomeIndex - 1) * 18} y={y + 8} />)}
        <rect x={Math.min(zero, finalX)} y={y + 2} width={Math.abs(finalX - zero)} height={13} fill={(item.finalValue ?? item.value) >= 0 ? COLORS[0] : COLORS[2]} rx="3">
          <title>{tooltip}</title>
        </rect>
        {item.liveGames > 0 && <rect data-live-bar={item.name} x={Math.min(finalX, valueX)} y={y + 2} width={Math.max(2, Math.abs(valueX - finalX))} height={13} fill="none" stroke="#66ccee" strokeWidth="2" strokeDasharray="4,2" rx="2"><title>{item.name}: live contribution {displayValue(item.liveValue)}; {resultLabel}</title></rect>}
        <text x={valueLabel.x} y={y + 12} textAnchor={valueLabel.anchor} style={valueLabel.fill ? { fill: valueLabel.fill } : undefined} data-value-label-placement={valueLabel.inside ? 'inside' : 'outside'}>{valueLabel.label}</text>
      </g>
    })}
  </svg>
}

function AccessibleTable({ caption, columns, rows }) {
  return <div className="chart-data"><div className="table-scroll"><table><caption>{caption}</caption><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell == null ? '—' : typeof cell === 'number' ? cell.toFixed(1) : cell}</td>)}</tr>)}</tbody></table></div></div>
}

export function WeeklyPointsChart({ history }) {
  const [mode, setMode] = useState('absolute')
  const series = weeklyChartSeries(history, mode)
  return <ChartFrame id="weekly-points" title="Points per week" description="Compare each player's weekly result." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Points per week" columns={['Player', ...history.weeks]} rows={series.map((user) => [user.name, ...user.values])} />}><LineSvg series={series} labels={history.weeks} natural ariaLabel={`Points per week, ${mode}`} /></ChartFrame>
}

export function CumulativePointsChart({ history }) {
  const [showPotential, setShowPotential] = useState(true)
  const series = cumulativeChartSeries(history, showPotential)
  const tableSeries = cumulativeChartSeries(history)
  return <ChartFrame id="cumulative-points" title="Points vs season leader" description="Solid: earned gap. Dashed: potential points gap. P: potential ending value." controls={<label className="potential-toggle"><input type="checkbox" checked={showPotential} onChange={(event) => setShowPotential(event.target.checked)} />Show potential</label>} table={<AccessibleTable caption="Points versus season leader" columns={['Player', 'Line', ...history.weeks]} rows={tableSeries.flatMap((user) => [[user.name, 'Earned', ...user.values], [user.name, 'Potential', ...user.potentialValues]])} />}><LineSvg series={series} labels={history.weeks} ariaLabel="Cumulative points versus season leader" endValues zeroReference /></ChartFrame>
}

export function GotwChart({ history }) {
  const [mode, setMode] = useState('absolute')
  const data = gotwChartData(history, mode)
  return <ChartFrame id="gotw-points" title="Game of the Week" description="Confidence plus the five-point bonus." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Game of the Week points" columns={['Player', 'Value']} rows={data.map((item) => [item.name, item.value])} />}><BarSvg data={data} ariaLabel={`Game of the Week points, ${mode}`} /></ChartFrame>
}

export function CurrentWeekChart({ current }) {
  const [mode, setMode] = useState('vs_total_leader')
  const data = currentWeekChartData(current, mode)
  return <ChartFrame id="current-week" title="Current week" description={mode === 'points_lost' ? 'Bars: lost points shown below zero, including GOTW stakes. Smallest losses appear first. P: maximum possible losses if every unfinished pick loses, including live games. Live losses follow the app’s provisional scoring setting.' : 'Bars: earned points. Dashed markers (P): potential totals. Leader comparisons subtract the same leader’s earned or potential total, respectively.'} modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_lost', label: 'Points lost' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }, { value: 'vs_leader', label: 'Vs weekly leader' }, { value: 'vs_total_leader', label: 'Vs season leader' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Current week points" columns={['Player', mode === 'points_lost' ? 'Lost' : 'Earned', mode === 'points_lost' ? 'Maximum possible losses' : 'Potential total']} rows={data.map((item) => [item.name, item.value, item.potential])} />}><BarSvg data={data} potential ariaLabel={`Current week points, ${mode}`} /></ChartFrame>
}

export function AggressivenessChart({ players, gamesByPool, picksByUser, poolKeys, weekLabels, selectedPoolKey }) {
  const [kind, setKind] = useState('aggregate')
  const [view, setView] = useState('weekly')
  const weekly = weeklyAggressivenessSeries(players, gamesByPool, picksByUser, kind, poolKeys)
  const data = aggressivenessChartData(players, gamesByPool, picksByUser, kind, view === 'selected_week' ? [selectedPoolKey] : poolKeys)
  const modelControl = <label>Model <select aria-label="Aggressiveness index model" value={kind} onChange={(event) => setKind(event.target.value)}><option value="predictor">FPI</option><option value="moneyline">Moneyline</option><option value="aggregate">FPI + moneyline average</option></select></label>
  const table = view === 'weekly'
    ? <AccessibleTable caption="Weekly aggressiveness index" columns={['Player', ...weekLabels]} rows={weekly.map((item) => [item.name, ...item.values])} />
    : <AccessibleTable caption={view === 'selected_week' ? 'Selected week aggressiveness index' : 'Season average aggressiveness index'} columns={['Player', 'Index', 'Compared locked picks']} rows={data.map((item) => [item.name, item.value, item.comparisons])} />
  return <ChartFrame id="aggressiveness" title="Aggressiveness index" description="Mean absolute gap from the selected model's signed confidence, using locked picks only." modes={[{ value: 'weekly', label: 'Weekly by player' }, { value: 'selected_week', label: 'Selected week' }, { value: 'season_average', label: 'Season average' }]} mode={view} onMode={setView} modeLabel="View" controls={modelControl} table={table}>{view === 'weekly' ? <LineSvg series={weekly} labels={weekLabels} ariaLabel={`Aggressiveness index by week, ${kind}`} /> : <BarSvg data={data} ariaLabel={`Aggressiveness index ${view === 'selected_week' ? 'for selected week' : 'season average'}, ${kind}`} />}</ChartFrame>
}

export function TeamModelRelativeChart({ players, gamesByPool, picksByUser, viewerId, poolKeys, weekLabels }) {
  const [benchmark, setBenchmark] = useState('aggregate')
  const [view, setView] = useState('impact')
  const [includeLive, setIncludeLive] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const allPlayers = selectedPlayer === 'all'
  const playerId = allPlayers ? null : players.some((player) => player.id === selectedPlayer) ? selectedPlayer
    : players.some((player) => player.id === viewerId) ? viewerId : players[0]?.id
  const period = selectedPeriod === 'all' || poolKeys.includes(selectedPeriod) ? selectedPeriod : 'all'
  const selectedPools = period === 'all' ? poolKeys : [period]
  const impactView = view === 'impact'
  const benchmarkPlayerId = benchmark.startsWith('player:') ? benchmark.slice('player:'.length) : null
  const benchmarkPlayer = players.find((player) => player.id === benchmarkPlayerId)
  const benchmarkLabel = benchmarkPlayer?.name
    ?? (benchmark === 'predictor' ? 'FPI' : benchmark === 'moneyline' ? 'Moneyline' : 'FPI + moneyline average')
  const data = impactView
    ? teamBenchmarkRelativePoints(players, gamesByPool, picksByUser, playerId, benchmark, selectedPools, includeLive)
    : teamBenchmarkRelativeExposure(players, gamesByPool, picksByUser, playerId, benchmark, selectedPools, includeLive)
  const changePlayer = (nextPlayer) => {
    setSelectedPlayer(nextPlayer)
    if (nextPlayer !== 'all' && benchmark === `player:${nextPlayer}`) setBenchmark('aggregate')
  }
  const controls = <>
    <label><input type="checkbox" checked={includeLive} onChange={(event) => setIncludeLive(event.target.checked)} />Include live games</label>
    <label>View <select aria-label="Net points vs benchmark view" value={view} onChange={(event) => setView(event.target.value)}><option value="impact">Net impact</option><option value="exposure">Over/underweight</option></select></label>
    <label>Player <select aria-label="Net points vs benchmark player" value={allPlayers ? 'all' : playerId ?? ''} onChange={(event) => changePlayer(event.target.value)}><option value="all">All players</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
    <label>Week <select aria-label="Net points vs benchmark week" value={period} onChange={(event) => setSelectedPeriod(event.target.value)}><option value="all">All weeks</option>{poolKeys.map((key, index) => <option key={key} value={key}>{weekLabels[index]}</option>)}</select></label>
    <label>Compare against <select aria-label="Net points benchmark" value={benchmark} onChange={(event) => setBenchmark(event.target.value)}>
      <optgroup label="Models">
        <option value="predictor">FPI</option>
        <option value="moneyline">Moneyline</option>
        <option value="aggregate">FPI + moneyline average</option>
      </optgroup>
      <optgroup label="Players">
        {players.map((player) => <option key={player.id} value={`player:${player.id}`} disabled={!allPlayers && player.id === playerId}>{player.name}</option>)}
      </optgroup>
    </select></label>
  </>
  const benchmarkType = benchmarkPlayer ? 'comparison player' : 'model'
  const missingBenchmark = benchmarkPlayer ? 'Games where the comparison player has no usable pick are excluded.' : 'Games missing the selected model input are excluded.'
  const description = impactView
    ? `${includeLive ? 'Completed and live games. Live results use the current scoreboard; a tied live game has zero impact.' : 'Completed games only.'} Solid bars show completed contributions; dashed outlines extend from the completed value to the total including live games. Each player-benchmark difference is one relative position: lower confidence in a team is equivalent to being overweight its opponent, while opposite picks combine both scoring stakes. The realized net-point difference is attributed once to the team the player is overweight versus the selected ${benchmarkType}. Stakes include GOTW bonuses. Positive bars mean the tilt beat the benchmark; negative bars mean it hurt. ${missingBenchmark}`
    : `${includeLive ? 'Completed and live games.' : 'Completed games only.'} Solid bars show completed stakes; dashed outlines show live stakes. Shows net relative scoring stake by team versus the selected ${benchmarkType}. Each player-game contributes +relative stake to the overweight team and the same amount as −relative stake to the opponent, so this view intentionally records both sides and sums to zero across teams. Stakes include GOTW bonuses. Positive bars mean overweight; negative bars mean underweight. ${missingBenchmark}`
  const resultLegend = period === 'all' ? 'W/L (and T for ties) beside each team counts distinct completed games with a relative position; live games remain provisional.' : 'Team symbols: ✓ won or leading, × lost or trailing, — tied. Dashed symbols mark live results. These describe the team’s result, independently of the position’s impact.'
  const table = impactView
    ? <AccessibleTable caption="Net impact versus benchmark by overweight team" columns={['Team', 'Net impact', 'Relative stake', 'Player net', 'Benchmark net', 'Relative games', 'Live contribution', 'Results']} rows={data.map((item) => [item.name, item.value, item.relativeStake, item.playerNet, item.benchmarkNet, item.comparisons, item.liveValue, teamResultLabel(item)])} />
    : <AccessibleTable caption="Overweight and underweight versus benchmark by team" columns={['Team', 'Net relative stake', 'Relative games', 'Live stake', 'Results']} rows={data.map((item) => [item.name, item.value, item.comparisons, item.liveValue, teamResultLabel(item)])} />
  const playerLabel = allPlayers ? 'all players' : players.find((player) => player.id === playerId)?.name ?? 'player'
  const periodLabel = period === 'all' ? 'all weeks' : weekLabels[poolKeys.indexOf(period)]
  return <ChartFrame
    id="team-net-vs-model"
    title={impactView ? 'Net points vs benchmark by team' : 'Over/underweight vs benchmark by team'}
    description={`${description} ${resultLegend}`}
    controls={controls}
    table={table}
  ><RankedTeamBarSvg data={data} singleWeek={period !== 'all'} ariaLabel={impactView
    ? `Net impact versus ${benchmarkLabel} by overweight team, ${playerLabel}, ${periodLabel}`
    : `Overweight and underweight versus ${benchmarkLabel} by team, ${playerLabel}, ${periodLabel}`} /></ChartFrame>
}

export function DivisionWinnersChart({ rows, pointsPerCorrect }) {
  const data = rows.map((row, colorIndex) => ({ name: row.name, colorIndex, value: row.points }))
  return <ChartFrame
    id="division-winners-points"
    title="Division winners points"
    description={`Hypothetical points: correct picks × ${pointsPerCorrect}.`}
    table={<AccessibleTable caption="Division winners hypothetical points" columns={['Player', 'Correct', 'Points']} rows={rows.map((row) => [row.name, row.correct, row.points])} />}
  ><BarSvg data={data} ariaLabel="Division winners hypothetical points" /></ChartFrame>
}
