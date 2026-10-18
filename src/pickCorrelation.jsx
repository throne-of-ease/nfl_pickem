import React, { useEffect, useState } from 'react'
import { isLocked, modelPicks } from './domain.js'

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

function useCompactMatrix() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 430)
  useEffect(() => {
    const update = () => setCompact(window.innerWidth <= 430)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return compact
}

const compactName = (name, compact) => compact && name.length > 7 ? `${name.slice(0, 6)}…` : name

const correlationFill = (value) => {
  if (!Number.isFinite(value)) return '#293746'
  if (value >= 0.67) return '#2f6696'
  if (value >= 0.25) return '#4f86a6'
  if (value <= -0.67) return '#8f3f62'
  if (value <= -0.25) return '#b14f62'
  return '#566372'
}

function CorrelationMatrix({ matrix }) {
  const compact = useCompactMatrix()
  const { entities, cells } = matrix
  const gridTemplateColumns = `minmax(${compact ? 52 : 92}px, 1.35fr) repeat(${Math.max(1, entities.length)}, minmax(0, 1fr))`
  const valueFontSize = compact && entities.length > 5 ? '.48rem' : compact ? '.56rem' : '.72rem'
  return <div className="correlation-matrix-visual" data-testid="pick-correlation-visual" aria-label="Pick confidence correlation matrix">
    <div className="correlation-grid-row correlation-grid-header" style={{ gridTemplateColumns }}>
      <div className="correlation-corner">r</div>
      {entities.map((entity) => <div key={entity.id} className="correlation-column-label" title={entity.name}>{compactName(entity.name, compact)}</div>)}
    </div>
    {entities.map((entity, rowIndex) => <div key={entity.id} className="correlation-grid-row" style={{ gridTemplateColumns }}>
      <div className="correlation-row-label" title={entity.name}>{compactName(entity.name, compact)}</div>
      {cells[rowIndex].map((cell, columnIndex) => {
        const other = entities[columnIndex]
        const valueLabel = Number.isFinite(cell.value) ? cell.value.toFixed(2) : '—'
        const detail = `${entity.name} vs ${other.name}: ${Number.isFinite(cell.value) ? `r = ${cell.value.toFixed(3)}` : 'correlation unavailable'}; ${cell.count} common locked ${cell.count === 1 ? 'game' : 'games'}`
        return <div key={cell.columnId} className="correlation-cell" data-correlation-cell={`${entity.id}:${cell.columnId}`} title={detail} aria-label={detail} style={{ background: correlationFill(cell.value), fontSize: valueFontSize }}>{valueLabel}</div>
      })}
    </div>)}
    <div className="correlation-legend">−1 opposite · 0 unrelated · +1 aligned</div>
  </div>
}

export default function PickCorrelationMatrix({ players, gamesByPool, picksByUser, poolKeys }) {
  const includeModels = useIncludeModelPicks()
  const modelPlayers = MODEL_DEFINITIONS.map(({ id, name }) => ({ id, name, model: true }))
  const modelPicksByUser = Object.fromEntries(MODEL_DEFINITIONS.map((model) => [model.id, Object.fromEntries(poolKeys.map((poolKey) => [poolKey, modelPicks(gamesByPool[poolKey] ?? [], model.kind)]))]))
  const matrixPlayers = includeModels ? [...players, ...modelPlayers] : players
  const matrixPicks = includeModels ? { ...picksByUser, ...modelPicksByUser } : picksByUser
  const matrix = pickConfidenceCorrelationMatrix(matrixPlayers, gamesByPool, matrixPicks, poolKeys)

  return <section className="chart-card chart-card-pick-correlation" data-testid="pick-correlation-matrix" data-entity-count={matrix.entities.length} aria-labelledby="pick-correlation-title">
    <div className="chart-heading"><div id="pick-correlation-title" className="chart-title" role="heading" aria-level="3">Pick confidence correlation</div></div>
    <CorrelationMatrix matrix={matrix} />
    <p className="chart-description">Pearson correlation of signed confidence across common locked games. Home picks are positive and away picks negative, so opposite-team picks correctly count as opposing signals. Missing picks are excluded pairwise. When “Include model picks” is enabled, FPI, Moneyline and AVG are added as rows and columns.</p>
  </section>
}
