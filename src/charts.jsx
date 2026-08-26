import React, { useRef, useState } from 'react'

export const COLORS = ['#43d6b5', '#ffca5c', '#ff6b81', '#7aa8ff']

export function toDisplay(value, mode, maximum = 1, leader = 0) {
  if (mode === 'percent') return maximum ? (value / maximum) * 100 : 0
  if (mode === 'vs_leader') return value - leader
  return value
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

export async function downloadSvgAsPng(svg, filename) {
  const blob = await svgToPngBlob(svg)
  const link = document.createElement('a')
  link.download = filename
  link.href = URL.createObjectURL(blob)
  link.click()
  URL.revokeObjectURL(link.href)
}

export async function shareSvgAsPng(svg, filename) {
  const blob = await svgToPngBlob(svg)
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) return navigator.share({ title: 'NFL Pick’em 2026', files: [file] })
  return downloadSvgAsPng(svg, filename)
}

function ChartFrame({ id, title, description, modes = [], mode, onMode, children, table }) {
  const ref = useRef(null)
  return <section className="chart-card" aria-labelledby={`${id}-title`}>
    <div className="chart-heading">
      <div><h3 id={`${id}-title`}>{title}</h3><p>{description}</p></div>
      <div className="chart-actions">
        {modes.length > 0 && <label>Display <select aria-label={`${title} display mode`} value={mode} onChange={(event) => onMode(event.target.value)}>{modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
        <button type="button" onClick={() => shareSvgAsPng(ref.current, `${id}.png`)}>Share PNG</button>
        <button type="button" onClick={() => downloadSvgAsPng(ref.current, `${id}.png`)}>Download PNG</button>
      </div>
    </div>
    <div className="chart-scroll">{React.cloneElement(children, { chartRef: ref })}</div>
    {table}
  </section>
}

const safeRange = (values) => {
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  return { min, max, span: max - min || 1 }
}

function LineSvg({ series, labels, chartRef, ariaLabel }) {
  const width = 800, height = 360, left = 54, right = 24, top = 44, bottom = 48
  const values = series.flatMap((item) => item.values)
  const { min, max, span } = safeRange(values)
  const x = (index) => labels.length === 1 ? (width - right + left) / 2 : left + index * (width - left - right) / (labels.length - 1)
  const y = (value) => top + (max - value) * (height - top - bottom) / span
  return <svg ref={chartRef} className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
    <rect width={width} height={height} fill="#0c192b" rx="10" />
    {series.map((item, index) => <g key={`legend-${item.name}`} transform={`translate(${left + index * 120} 20)`}><line x2="22" stroke={COLORS[index % COLORS.length]} strokeWidth="4" /><text x="29" y="4">{item.name}</text></g>)}
    {[0, 1, 2, 3, 4].map((tick) => { const value = min + span * tick / 4; return <g key={tick}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#29415e" /><text x={left - 8} y={y(value) + 4} textAnchor="end">{Math.round(value)}</text></g> })}
    {labels.map((label, index) => <text key={label} x={x(index)} y={height - 18} textAnchor="middle">{label}</text>)}
    {series.map((item, seriesIndex) => <g key={item.name}>
      <polyline fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="4" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
      {item.values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r="5"><title>{item.name}, {labels[index]}: {value.toFixed(1)}</title></circle>)}
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
      {potential && item.potential > item.value && <rect x={x} y={y(item.potential)} width={bar} height={zero - y(item.potential)} fill="#29415e" rx="5"><title>{item.name} potential: {item.potential.toFixed(1)}</title></rect>}
      <rect x={x} y={item.value >= 0 ? topY : zero} width={bar} height={barHeight} fill={COLORS[index % COLORS.length]} rx="5"><title>{item.name}: {item.value.toFixed(1)}</title></rect>
      <text x={x + bar / 2} y={item.value >= 0 ? topY - 7 : zero + barHeight + 15} textAnchor="middle">{item.value.toFixed(1)}</text>
      <text x={x + bar / 2} y={height - 20} textAnchor="middle">{item.name}</text>
    </g>})}
  </svg>
}

function AccessibleTable({ caption, columns, rows }) {
  return <details><summary>View chart data</summary><div className="table-scroll"><table><caption>{caption}</caption><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{typeof cell === 'number' ? cell.toFixed(1) : cell}</td>)}</tr>)}</tbody></table></div></details>
}

export function WeeklyPointsChart({ history }) {
  const [mode, setMode] = useState('absolute')
  const series = history.users.map((user) => ({ name: user.name, values: user.weekly.map((value, i) => mode === 'points_percentage' ? value / user.possible[i] * 100 : mode === 'correct_percentage' ? user.correct[i] / user.gameCounts[i] * 100 : value) }))
  return <ChartFrame id="weekly-points" title="Points per week" description="Compare each player's weekly result." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Points per week" columns={['Player', ...history.weeks]} rows={series.map((user) => [user.name, ...user.values])} />}><LineSvg series={series} labels={history.weeks} ariaLabel={`Points per week, ${mode}`} /></ChartFrame>
}

export function CumulativePointsChart({ history }) {
  const series = history.users.map((user) => ({ name: user.name, values: user.weekly.reduce((values, value) => [...values, value + (values.at(-1) ?? 0)], []) }))
  return <ChartFrame id="cumulative-points" title="Cumulative points" description="Season progress excludes rehearsal pools." table={<AccessibleTable caption="Cumulative points" columns={['Player', ...history.weeks]} rows={series.map((user) => [user.name, ...user.values])} />}><LineSvg series={series} labels={history.weeks} ariaLabel="Cumulative season points" /></ChartFrame>
}

export function GotwChart({ history }) {
  const [mode, setMode] = useState('absolute')
  const data = history.users.map((user) => ({ name: user.name, value: mode === 'points_percentage' ? (user.gotwPossible ? user.gotw / user.gotwPossible * 100 : 0) : mode === 'correct_percentage' ? (user.gotwPlayed ? user.gotwCorrect / user.gotwPlayed * 100 : 0) : user.gotw, potential: mode === 'absolute' ? user.gotwPossible : undefined }))
  return <ChartFrame id="gotw-points" title="Game of the Week" description="Confidence plus the five-point bonus." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Game of the Week points" columns={['Player', 'Value', 'Possible']} rows={data.map((item) => [item.name, item.value, item.potential ?? '—'])} />}><BarSvg data={data} potential={mode === 'absolute'} ariaLabel={`Game of the Week points, ${mode}`} /></ChartFrame>
}

export function CurrentWeekChart({ current }) {
  const [mode, setMode] = useState('absolute')
  const leader = Math.max(0, ...current.map((item) => item.points))
  const leaderPotential = Math.max(0, ...current.filter((item) => item.points === leader).map((item) => item.points + item.potential))
  const seasonLeader = current.reduce((best, item) => item.seasonTotal > best.seasonTotal ? item : best, current[0])
  const data = current.map((item) => {
    if (mode === 'points_percentage') return { name: item.name, value: item.points / item.maximum * 100, potential: (item.points + item.potential) / item.maximum * 100 }
    if (mode === 'correct_percentage') return { name: item.name, value: item.played ? item.correct / item.played * 100 : 0, potential: (item.correct + item.gameCount - item.played) / item.gameCount * 100 }
    const baseline = mode === 'vs_leader' ? leader : mode === 'vs_total_leader' ? seasonLeader.points : 0
    const potentialBaseline = mode === 'vs_leader' ? leaderPotential : mode === 'vs_total_leader' ? seasonLeader.points + seasonLeader.potential : 0
    return { name: item.name, value: item.points - baseline, potential: item.points + item.potential - potentialBaseline }
  })
  return <ChartFrame id="current-week" title="Current week" description="Earned points and remaining potential." modes={[{ value: 'absolute', label: 'Points' }, { value: 'points_percentage', label: 'Points %' }, { value: 'correct_percentage', label: 'Correct picks %' }, { value: 'vs_leader', label: 'Vs weekly leader' }, { value: 'vs_total_leader', label: 'Vs season leader' }]} mode={mode} onMode={setMode} table={<AccessibleTable caption="Current week points" columns={['Player', 'Earned', 'Potential total']} rows={data.map((item) => [item.name, item.value, item.potential])} />}><BarSvg data={data} potential ariaLabel={`Current week points, ${mode}`} /></ChartFrame>
}
