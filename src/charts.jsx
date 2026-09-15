import React, { useRef, useState } from 'react'
import { modelPicks } from './domain.js'

export const COLORS = ['#43d6b5', '#ffca5c', '#ff6b81', '#7aa8ff']

export function toDisplay(value, mode, maximum = 1, leader = 0) {
  if (mode === 'percent') return maximum ? (value / maximum) * 100 : 0
  if (mode === 'vs_leader') return value - leader
  return value
}

export const weeklyChartSeries = (history, mode) => history.users.map((user) => ({
  name: user.name,
  values: user.weekly.map((value, index) => mode === 'points_percentage'
    ? (user.possible[index] ? value / user.possible[index] * 100 : 0)
    : mode === 'correct_percentage'
      ? (user.gameCounts[index] ? user.correct[index] / user.gameCounts[index] * 100 : 0)
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
      ? (user.gotwPlayed ? user.gotwCorrect / user.gotwPlayed * 100 : 0)
      : user.gotw,
})).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

export function aggressivenessChartData(players, gamesByPool, picksByUser, kind, poolKeys = Object.keys(gamesByPool)) {
  const comparisons = Object.fromEntries(players.map((player) => [player.id, []]))
  for (const poolKey of poolKeys) {
    const games = gamesByPool[poolKey] ?? []
    const models = new Map(modelPicks(games, kind).map((pick) => [pick.gameId, pick]))
    for (const player of players) {
      for (const pick of picksByUser[player.id]?.[poolKey] ?? []) {
        const game = games.find((item) => item.id === pick.gameId)
        const model = models.get(pick.gameId)
        if (!game || !model || !Number.isInteger(pick.confidence) || ![game.away, game.home].includes(pick.team)) continue
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
    if (mode === 'points_percentage') return { name: item.name, colorIndex, value: item.maximum ? item.points / item.maximum * 100 : 0 }
    if (mode === 'correct_percentage') return { name: item.name, colorIndex, value: item.gameCount ? item.correct / item.gameCount * 100 : 0 }
    if (baseline) return { name: item.name, colorIndex, value: item.points - baseline.points, potential: item.points + item.potential - baseline.points - baseline.potential }
    return { name: item.name, colorIndex, value: item.points, potential: item.points + item.potential }
  }).sort((a, b) => mode === 'vs_total_leader' && a.name === seasonLeader?.name ? -1 : mode === 'vs_total_leader' && b.name === seasonLeader?.name ? 1 : b.value - a.value || a.name.localeCompare(b.name))
}

export function svgToPngBlob(svg) {
  return new Promise((resolve, reject) => {
    const source = new XMLSerializer().serializeToString(svg)
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

function ChartActions({ id, chartRef }) {
  return <div className="chart-actions chart-actions-bottom">
    <button type="button" title="Share chart as PNG" aria-label="Share chart as PNG" onClick={() => shareSvgAsPng(chartRef.current, `${id}.png`)}><ChartIcon type="share" /></button>
    <button type="button" title="Download chart as PNG" aria-label="Download chart as PNG" onClick={() => downloadSvgAsPng(chartRef.current, `${id}.png`)}><ChartIcon type="download" /></button>
  </div>
}

function ChartFrame({ id, title, description, modes = [], mode, onMode, modeLabel = 'Display', controls, children, table, footer }) {
  const ref = useRef(null)
  return <section className="chart-card" aria-labelledby={`${id}-title`}>
    <div className="chart-heading">
      <div><h3 id={`${id}-title`}>{title}</h3><p>{description}</p></div>
      <div className="chart-actions">
        {modes.length > 0 && <label>{modeLabel} <select aria-label={`${title} ${modeLabel === 'Display' ? 'display mode' : modeLabel.toLowerCase()}`} value={mode} onChange={(event) => onMode(event.target.value)}>{modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
        {controls}
      </div>
    </div>
    <div className="chart-scroll">{React.cloneElement(children, { chartRef: ref })}</div>
    {footer}
    <ChartActions id={id} chartRef={ref} />
    {table}
  </section>
}

const safeRange = (values) => {
  const finite = values.filter(Number.isFinite)
  const min = Math.min(0, ...finite)
  const max = Math.max(1, ...finite)
  return { min, max, span: max - min || 1 }
}

function LineSvg({ series, labels, chartRef, ariaLabel }) {
  const width = 800, height = 360, left = 54, right = 24, top = 44, bottom = 48
  const values = series.flatMap((item) => [...item.values, ...(item.potentialValues ?? [])])
  const { min, max, span } = safeRange(values)
  const x = (index) => labels.length === 1 ? (width - right + left) / 2 : left + index * (width - left - right) / (labels.length - 1)
  const y = (value) => top + (max - value) * (height - top - bottom) / span
  return <svg ref={chartRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
    <rect width={width} height={height} fill="#0c192b" rx="10" />
    {series.map((item, index) => <g key={`legend-${item.name}`} transform={`translate(${left + index * 120} 20)`}><line x2="22" stroke={COLORS[index % COLORS.length]} strokeWidth="4" /><text x="29" y="4">{item.name}</text></g>)}
    {[0, 1, 2, 3, 4].map((tick) => { const value = min + span * tick / 4; return <g key={tick}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#29415e" /><text x={left - 8} y={y(value) + 4} textAnchor="end">{Math.round(value)}</text></g> })}
    {labels.map((label, index) => <text key={label} x={x(index)} y={height - 18} textAnchor="middle">{label}</text>)}
    {series.map((item, seriesIndex) => <g key={item.name}>
      <polyline fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="4" points={item.values.flatMap((value, index) => Number.isFinite(value) ? [`${x(index)},${y(value)}`] : []).join(' ')} />
      {item.potentialValues && <polyline fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="4" strokeDasharray="5,5" points={item.potentialValues.flatMap((value, index) => Number.isFinite(value) ? [`${x(index)},${y(value)}`] : []).join(' ')} />}
      {item.values.map((value, index) => Number.isFinite(value) ? <circle key={index} cx={x(index)} cy={y(value)} r="5"><title>{item.name}, {labels[index]}: {value.toFixed(1)}</title></circle> : null)}
    </g>)}
  </svg>
}

function BarSvg({ data, chartRef, ariaLabel, potential = false }) {
  const width = 800, height = 360, left = 50, right = 24, top = 28, bottom = 56
  const { min, max, span } = safeRange(data.flatMap((item) => [item.value, item.potential ?? item.value]))
  const y = (value) => top + (max - value) * (height - top - bottom) / span
  const zero = y(0), group = (width - left - right) / Math.max(1, data.length), bar = Math.min(84, group * .55)
  return <svg ref={chartRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
    <rect width={width} height={height} fill="#0c192b" rx="10" /><line x1={left} x2={width - right} y1={zero} y2={zero} stroke="#8ba0b9" />
    {data.map((item, index) => { const x = left + index * group + (group - bar) / 2; const topY = y(Math.max(0, item.value)); const barHeight = Math.abs(y(item.value) - zero); return <g key={item.name}>
      {potential && item.potential > item.value && <rect x={x} y={item.potential >= 0 ? y(item.potential) : zero} width={bar} height={Math.abs(y(item.potential) - zero)} fill="#29415e" rx="5"><title>{item.name} potential: {item.potential.toFixed(1)}</title></rect>}
      <rect x={x} y={item.value >= 0 ? topY : zero} width={bar} height={barHeight} fill={COLORS[(item.colorIndex ?? index) % COLORS.length]} rx="5"><title>{item.name}: {item.value.toFixed(1)}</title></rect>
      <text x={x + bar / 2} y={item.value >= 0 ? topY - 7 : zero + barHeight + 15} textAnchor="middle">{item.value.toFixed(1)}</text>
      <text x={x + bar / 2} y={height - 20} textAnchor="middle">{item.name}</text>
    </g>})}
  </svg>
}

function AccessibleTable({ caption, columns, rows }) {
  return <details><summary>View chart data</summary><div className="table-scroll"><table><caption>{caption}</caption><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell == null ? '—' : typeof cell === 'number' ? cell.toFixed(1) : cell}</td>)}</tr>)}</tbody></table></div></details>
}

export function WeeklyPointsChart({ history }) {
  const [mode, setMode] = useState('absolute')
  const series = weeklyChartSeries(history, mode)
  return <ChartFrame id="weekly-points" title="Points per week" description="Compare each player's weekly result." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Points per week" columns={['Player', ...history.weeks]} rows={series.map((user) => [user.name, ...user.values])} />}><LineSvg series={series} labels={history.weeks} ariaLabel={`Points per week, ${mode}`} /></ChartFrame>
}

export function CumulativePointsChart({ history }) {
  const [showPotential, setShowPotential] = useState(true)
  const series = cumulativeChartSeries(history, showPotential)
  const tableSeries = cumulativeChartSeries(history)
  return <ChartFrame id="cumulative-points" title="Points vs season leader" description="Solid: earned gap. Dashed: potential points gap." footer={<div className="chart-footer"><button type="button" aria-pressed={showPotential} onClick={() => setShowPotential((visible) => !visible)}>{showPotential ? 'Hide potential' : 'Show potential'}</button></div>} table={<AccessibleTable caption="Points versus season leader" columns={['Player', 'Line', ...history.weeks]} rows={tableSeries.flatMap((user) => [[user.name, 'Earned', ...user.values], [user.name, 'Potential', ...user.potentialValues]])} />}><LineSvg series={series} labels={history.weeks} ariaLabel="Cumulative points versus season leader" /></ChartFrame>
}

export function GotwChart({ history }) {
  const [mode, setMode] = useState('absolute')
  const data = gotwChartData(history, mode)
  return <ChartFrame id="gotw-points" title="Game of the Week" description="Confidence plus the five-point bonus." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Game of the Week points" columns={['Player', 'Value']} rows={data.map((item) => [item.name, item.value])} />}><BarSvg data={data} ariaLabel={`Game of the Week points, ${mode}`} /></ChartFrame>
}

export function CurrentWeekChart({ current }) {
  const [mode, setMode] = useState('vs_total_leader')
  const data = currentWeekChartData(current, mode)
  return <ChartFrame id="current-week" title="Current week" description="Earned points and remaining potential." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }, { value: 'vs_leader', label: 'Vs weekly leader' }, { value: 'vs_total_leader', label: 'Vs season leader' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Current week points" columns={['Player', 'Earned', 'Potential total']} rows={data.map((item) => [item.name, item.value, item.potential])} />}><BarSvg data={data} potential ariaLabel={`Current week points, ${mode}`} /></ChartFrame>
}

export function AggressivenessChart({ players, gamesByPool, picksByUser, poolKeys, weekLabels, selectedPoolKey }) {
  const [kind, setKind] = useState('aggregate')
  const [view, setView] = useState('weekly')
  const weekly = weeklyAggressivenessSeries(players, gamesByPool, picksByUser, kind, poolKeys)
  const data = aggressivenessChartData(players, gamesByPool, picksByUser, kind, view === 'selected_week' ? [selectedPoolKey] : poolKeys)
  const modelControl = <label>Model <select aria-label="Aggressiveness index model" value={kind} onChange={(event) => setKind(event.target.value)}><option value="predictor">FPI</option><option value="moneyline">Moneyline</option><option value="aggregate">FPI + moneyline average</option></select></label>
  const table = view === 'weekly'
    ? <AccessibleTable caption="Weekly aggressiveness index" columns={['Player', ...weekLabels]} rows={weekly.map((item) => [item.name, ...item.values])} />
    : <AccessibleTable caption={view === 'selected_week' ? 'Selected week aggressiveness index' : 'Season average aggressiveness index'} columns={['Player', 'Index', 'Compared picks']} rows={data.map((item) => [item.name, item.value, item.comparisons])} />
  return <ChartFrame id="aggressiveness" title="Aggressiveness index" description="Mean absolute gap from the selected model's signed confidence." modes={[{ value: 'weekly', label: 'Weekly by player' }, { value: 'selected_week', label: 'Selected week' }, { value: 'season_average', label: 'Season average' }]} mode={view} onMode={setView} modeLabel="View" controls={modelControl} table={table}>{view === 'weekly' ? <LineSvg series={weekly} labels={weekLabels} ariaLabel={`Aggressiveness index by week, ${kind}`} /> : <BarSvg data={data} ariaLabel={`Aggressiveness index ${view === 'selected_week' ? 'for selected week' : 'season average'}, ${kind}`} />}</ChartFrame>
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
