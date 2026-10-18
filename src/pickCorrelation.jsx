import React, { useEffect, useRef, useState } from 'react'
import { isLocked, modelPicks } from './domain.js'
import { svgToPngBlob } from './chartExport.js'

const MODEL_DEFINITIONS = [
  { id: 'model-fpi', name: 'FPI', kind: 'predictor' },
  { id: 'model-moneyline', name: 'Moneyline', kind: 'moneyline' },
  { id: 'model-avg', name: 'AVG', kind: 'aggregate' },
]

const signedConfidence = (pick, game) => {
  if (!pick || !game || !Number.isFinite(pick.confidence) || pick.confidence <= 0) return null
  if (pick.team === game.home) return pick.confidence
  if (pick.team === game.away) return -pick.confidence
  return null
}

export function pearsonCorrelation(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let numerator = 0, xSquares = 0, ySquares = 0
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] - xMean
    const y = ys[index] - yMean
    numerator += x * y
    xSquares += x * x
    ySquares += y * y
  }
  const denominator = Math.sqrt(xSquares * ySquares)
  return denominator > 0 ? numerator / denominator : null
}

export function pickConfidenceCorrelationMatrix(players, gamesByPool, picksByUser, poolKeys = Object.keys(gamesByPool)) {
  const entities = players.map(({ id, name }) => ({ id, name }))
  const vectors = new Map(entities.map((entity) => [entity.id, new Map()]))

  for (const poolKey of poolKeys) {
    const games = gamesByPool[poolKey] ?? []
    const gameById = new Map(games.map((game) => [game.id, game]))
    for (const entity of entities) {
      for (const pick of picksByUser[entity.id]?.[poolKey] ?? []) {
        const game = gameById.get(pick.gameId)
        if (!game || !isLocked(game)) continue
        const value = signedConfidence(pick, game)
        if (Number.isFinite(value)) vectors.get(entity.id).set(`${poolKey}:${game.id}`, value)
      }
    }
  }

  const cells = entities.map((row) => entities.map((column) => {
    const rowValues = vectors.get(row.id)
    const columnValues = vectors.get(column.id)
    const xs = [], ys = []
    for (const [key, value] of rowValues) {
      if (!columnValues.has(key)) continue
      xs.push(value)
      ys.push(columnValues.get(key))
    }
    return { rowId: row.id, columnId: column.id, value: pearsonCorrelation(xs, ys), count: xs.length }
  }))

  return { entities, cells }
}

const modelToggleChecked = () => typeof document !== 'undefined' && [...document.querySelectorAll('.standings-options input[type="checkbox"]')]
  .some((input) => input.checked && input.closest('label')?.textContent?.includes('Include model picks'))

function useIncludeModelPicks() {
  const [includeModels, setIncludeModels] = useState(false)
  useEffect(() => {
    const sync = () => setIncludeModels(modelToggleChecked())
    const onChange = (event) => {
      if (event.target?.matches?.('.standings-options input[type="checkbox"]') && event.target.closest('label')?.textContent?.includes('Include model picks')) sync()
    }
    sync()
    document.addEventListener('change', onChange)
    return () => document.removeEventListener('change', onChange)
  }, [])
  return includeModels
}

const compactName = (name, compact) => compact && name.length > 9 ? `${name.slice(0, 8)}…` : name

const correlationFill = (value) => {
  if (!Number.isFinite(value)) return '#293746'
  if (value >= 0.67) return '#2f6696'
  if (value >= 0.25) return '#4f86a6'
  if (value <= -0.67) return '#8f3f62'
  if (value <= -0.25) return '#b14f62'
  return '#566372'
}

function useCompactMatrix() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 430)
  useEffect(() => {
    const update = () => setCompact(window.innerWidth <= 430)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return compact
}

function CorrelationMatrixSvg({ matrix, chartRef }) {
  const compact = useCompactMatrix()
  const { entities, cells } = matrix
  const width = compact ? 360 : 800
  const left = compact ? 76 : 132
  const right = compact ? 12 : 30
  const top = compact ? 92 : 116
  const bottom = 38
  const available = width - left - right
  const cellSize = Math.min(compact ? 44 : 68, available / Math.max(1, entities.length))
  const matrixWidth = cellSize * entities.length
  const matrixLeft = left + Math.max(0, (available - matrixWidth) / 2)
  const height = top + cellSize * entities.length + bottom
  const fontSize = compact && entities.length > 5 ? 9 : compact ? 10 : 12
  return <svg ref={chartRef} className="correlation-matrix-chart" data-testid="pick-correlation-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pick confidence correlation matrix">
    <rect width={width} height={height} fill="#0c192b" rx="10" />
    {entities.map((entity, index) => {
      const x = matrixLeft + (index + .5) * cellSize
      return <text key={`column-${entity.id}`} x={x} y={top - 10} fontSize={fontSize} textAnchor="start" transform={`rotate(-48 ${x} ${top - 10})`} fill="#edf2f7"><title>{entity.name}</title>{compactName(entity.name, compact)}</text>
    })}
    {entities.map((entity, rowIndex) => {
      const y = top + (rowIndex + .5) * cellSize
      return <g key={`row-${entity.id}`}>
        <text x={matrixLeft - 7} y={y + 4} fontSize={fontSize} textAnchor="end" fill="#edf2f7"><title>{entity.name}</title>{compactName(entity.name, compact)}</text>
        {cells[rowIndex].map((cell, columnIndex) => {
          const x = matrixLeft + columnIndex * cellSize
          const cellY = top + rowIndex * cellSize
          const valueLabel = Number.isFinite(cell.value) ? cell.value.toFixed(2) : '—'
          return <g key={`${entity.id}-${entities[columnIndex].id}`} data-correlation-cell={`${entity.id}:${entities[columnIndex].id}`}>
            <rect x={x + 1} y={cellY + 1} width={Math.max(1, cellSize - 2)} height={Math.max(1, cellSize - 2)} rx="3" fill={correlationFill(cell.value)}>
              <title>{entity.name} vs {entities[columnIndex].name}: {Number.isFinite(cell.value) ? `r = ${cell.value.toFixed(3)}` : 'correlation unavailable'}; {cell.count} common locked {cell.count === 1 ? 'game' : 'games'}</title>
            </rect>
            <text x={x + cellSize / 2} y={cellY + cellSize / 2 + 4} textAnchor="middle" fontSize={compact && entities.length > 5 ? 8 : 10} fontWeight="700" fill="#fff">{valueLabel}</text>
          </g>
        })}
      </g>
    })}
    <text x={width / 2} y={height - 13} textAnchor="middle" fontSize={compact ? 9 : 11} fill="#b7c7da">−1 opposite · 0 unrelated · +1 aligned</text>
  </svg>
}

function ExportIcon({ share }) {
  return share
    ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 5 8 2 5 5M8 2v8M3 8v5h10V8" /></svg>
    : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3M3 12v2h10v-2" /></svg>
}

const downloadBlob = (blob, filename) => {
  const link = document.createElement('a')
  link.download = filename
  link.href = URL.createObjectURL(blob)
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

const exportSvg = async (svg, filename, share) => {
  const blob = await svgToPngBlob(svg)
  if (!share) return downloadBlob(blob, filename)
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) return navigator.share({ title: 'NFL Pick’em 2026', files: [file] })
  return downloadBlob(blob, filename)
}

export default function PickCorrelationMatrix({ players, gamesByPool, picksByUser, poolKeys }) {
  const includeModels = useIncludeModelPicks()
  const modelPlayers = MODEL_DEFINITIONS.map(({ id, name }) => ({ id, name, model: true }))
  const modelPicksByUser = Object.fromEntries(MODEL_DEFINITIONS.map((model) => [model.id, Object.fromEntries(poolKeys.map((poolKey) => [poolKey, modelPicks(gamesByPool[poolKey] ?? [], model.kind)]))]))
  const matrixPlayers = includeModels ? [...players, ...modelPlayers] : players
  const matrixPicks = includeModels ? { ...picksByUser, ...modelPicksByUser } : picksByUser
  const matrix = pickConfidenceCorrelationMatrix(matrixPlayers, gamesByPool, matrixPicks, poolKeys)
  const chartRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const exportChart = async (share) => {
    if (exporting || !chartRef.current) return
    setExporting(true)
    setError('')
    try {
      await exportSvg(chartRef.current, 'pick-confidence-correlation.png', share)
    } catch (cause) {
      if (cause?.name !== 'AbortError') setError('Could not export the correlation matrix. Please try again.')
    } finally { setExporting(false) }
  }
  return <section className="chart-card chart-card-pick-correlation" data-testid="pick-correlation-matrix" data-entity-count={matrix.entities.length} aria-labelledby="pick-correlation-title">
    <div className="chart-heading"><h3 id="pick-correlation-title">Pick confidence correlation</h3></div>
    <div className="chart-scroll"><CorrelationMatrixSvg matrix={matrix} chartRef={chartRef} /></div>
    <p className="chart-description">Pearson correlation of signed confidence across common locked games. Home picks are positive and away picks negative, so opposite-team picks correctly count as opposing signals. Missing picks are excluded pairwise. When “Include model picks” is enabled, FPI, Moneyline and AVG are added as rows and columns.</p>
    <div className="chart-actions chart-actions-bottom" aria-busy={exporting}>
      <button type="button" title="Share correlation matrix as PNG" aria-label="Share correlation matrix as PNG" disabled={exporting} onClick={() => exportChart(true)}><ExportIcon share /></button>
      <button type="button" title="Download correlation matrix as PNG" aria-label="Download correlation matrix as PNG" disabled={exporting} onClick={() => exportChart(false)}><ExportIcon /></button>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    <details className="chart-data correlation-data"><summary>View chart data</summary><div className="table-scroll"><table><caption>Pick confidence correlations</caption><thead><tr><th>Player / model</th>{matrix.entities.map((entity) => <th key={entity.id}>{entity.name}</th>)}</tr></thead><tbody>{matrix.entities.map((entity, rowIndex) => <tr key={entity.id}><th scope="row">{entity.name}</th>{matrix.cells[rowIndex].map((cell) => <td key={cell.columnId} title={`${cell.count} common locked games`}>{Number.isFinite(cell.value) ? cell.value.toFixed(2) : '—'}</td>)}</tr>)}</tbody></table></div></details>
  </section>
}
