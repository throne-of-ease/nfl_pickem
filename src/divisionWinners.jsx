import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DivisionWinnersChart } from './charts.jsx'
import { TeamLogo } from './overview.jsx'
import { loadDivisionWinnerData, saveDivisionWinnerPicks } from './api.js'
import { DEFAULT_DIVISION_SETTINGS, DIVISION_DEFINITIONS, evaluateDivisionDraft, fetchDivisionStandings, isCompleteDivisionDraft, validateDivisionPicks } from './divisionWinners.js'
import { formatCETKickoff } from './time.js'

const LOCAL_PREFIX = 'nfl-pickem-division-draft-v1'

const readFixtureDraft = (viewerId) => {
  try { return JSON.parse(localStorage.getItem(`${LOCAL_PREFIX}:${viewerId}`) ?? '{}') } catch { return {} }
}

const writeFixtureDraft = (viewerId, picks) => {
  try { localStorage.setItem(`${LOCAL_PREFIX}:${viewerId}`, JSON.stringify(picks)) } catch { /* local rehearsal only */ }
}

const draftPicks = (draft) => draft?.picks && typeof draft.picks === 'object' ? draft.picks : draft ?? {}
const mapSettings = (settings = {}) => ({
  lockWeek: Number(settings.lockWeek ?? settings.division_lock_week ?? DEFAULT_DIVISION_SETTINGS.lockWeek),
  lockAt: settings.lockAt ?? settings.division_lock_at ?? DEFAULT_DIVISION_SETTINGS.lockAt,
  pointsPerCorrect: Number(settings.pointsPerCorrect ?? settings.division_points_per_correct ?? DEFAULT_DIVISION_SETTINGS.pointsPerCorrect),
})

const mapData = (data, viewerId, players = [], fixture = false) => {
  const settings = mapSettings(data?.settings)
  const viewer = data?.viewerDraft ?? data?.viewer ?? {}
  const local = fixture ? readFixtureDraft(viewerId) : null
  return {
    settings,
    locked: fixture ? Date.parse(settings.lockAt) <= Date.now() : Boolean(data?.locked ?? data?.isLocked),
    revision: Number(data?.viewerRevision ?? viewer?.revision ?? data?.revision ?? 0),
    picks: local && Object.keys(local).length ? local : draftPicks(viewer),
    players: data?.players ?? players,
    drafts: data?.drafts ?? [],
  }
}

const formatStatusTime = (value) => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : null

export default function DivisionWinnersView({ token, viewerId, players = [], useFixtures = false, fixtureData = null, onBack, onStatusChange }) {
  const [data, setData] = useState(null)
  const [standings, setStandings] = useState({ divisions: [], freshness: 'unavailable', asOf: null })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const revision = useRef(0)
  const saveQueue = useRef(Promise.resolve())
  const standingsBusy = useRef(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const source = useFixtures ? fixtureData ?? {} : await loadDivisionWinnerData(token)
      const next = mapData(source, viewerId, players, useFixtures)
      revision.current = next.revision
      setData(next)
      setMessage('')
    } catch (error) {
      setMessage((error.code ?? error.message ?? 'DIVISION_WINNERS_LOAD_FAILED').replaceAll('_', ' '))
    } finally { setLoading(false) }
  }

  const refreshStandings = async () => {
    if (standingsBusy.current) return
    standingsBusy.current = true
    setRefreshing(true)
    try {
      if (useFixtures && fixtureData?.divisions) setStandings({ divisions: fixtureData.divisions, freshness: 'fresh', asOf: new Date().toISOString() })
      else setStandings(await fetchDivisionStandings())
    } catch (error) {
      setStandings((current) => ({ ...current, freshness: current.divisions.length ? 'stale' : 'unavailable', error: error.message }))
    } finally {
      standingsBusy.current = false
      setRefreshing(false)
    }
  }

  useEffect(() => { loadData(); refreshStandings() }, [token, viewerId])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') refreshStandings() }
    const interval = setInterval(refresh, 2 * 60 * 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
      onStatusChange?.(null)
    }
  }, [token, viewerId, useFixtures])

  useEffect(() => {
    const label = standings.freshness === 'fresh' ? `Browser ESPN standings · Updated ${formatStatusTime(standings.asOf)}` : standings.freshness === 'stale' ? `Browser ESPN standings · stale · Last good ${formatStatusTime(standings.asOf)}` : 'Browser ESPN standings · unavailable'
    onStatusChange?.(label)
  }, [standings, onStatusChange])

  const divisions = standings.divisions.length ? standings.divisions : DIVISION_DEFINITIONS.map((division) => ({ ...division, evaluated: false, leader: null, allZero: true }))
  const playerRows = useMemo(() => {
    if (!data) return []
    if (!data.locked) return [{ id: viewerId, name: 'Your picks', picks: data.picks }]
    const all = data.drafts.map((draft) => ({ id: draft.userId ?? draft.id, name: draft.name ?? draft.playerName ?? 'Player', picks: draftPicks(draft) }))
    if (!all.some((row) => row.id === viewerId)) all.unshift({ id: viewerId, name: 'You', picks: data.picks })
    return all
  }, [data, viewerId])
  const resultRows = playerRows.map((row) => ({ ...row, ...evaluateDivisionDraft(row.picks, divisions, data?.settings.pointsPerCorrect ?? 5) }))
  const selectedCount = data ? Object.keys(data.picks).filter((key) => DIVISION_DEFINITIONS.some((division) => division.id === key && division.teams.includes(data.picks[key]))).length : 0

  const save = (nextPicks) => {
    const validation = validateDivisionPicks(nextPicks)
    if (!validation.ok) { setMessage(validation.code.replaceAll('_', ' ')); return }
    setData((current) => ({ ...current, picks: nextPicks }))
    setMessage('Saving...')
    if (useFixtures) {
      writeFixtureDraft(viewerId, nextPicks)
      setMessage('All changes saved')
      return
    }
    saveQueue.current = saveQueue.current.then(async () => {
      const result = await saveDivisionWinnerPicks(token, revision.current, nextPicks)
      revision.current = Number(result?.draftRevision ?? result?.revision ?? revision.current + 1)
      setMessage('All changes saved')
    }).catch(async (error) => {
      setMessage((error.code ?? 'DIVISION_WINNERS_SAVE_FAILED').replaceAll('_', ' '))
      if (error.code === 'STALE_DIVISION_DRAFT') await loadData()
    })
  }

  if (loading || !data) return <section className="division-winners"><p className="notice" role="status">Loading Division winners...</p></section>

  return <section className="division-winners" aria-labelledby="division-winners-title">
    <div className="section-title division-winners-heading">
      <div><p className="eyebrow">Eight divisions · 2026</p><h2 id="division-winners-title">Division winners</h2><p>{data.locked ? 'The deadline has passed. Results use the latest completed-game standings.' : `Pick one team in each division before ${formatCETKickoff(data.settings.lockAt)} Berlin time.`}</p></div>
      <div className="division-winners-actions"><button type="button" onClick={onBack}>Back to My picks</button><button type="button" onClick={() => { loadData(); refreshStandings() }} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh standings'}</button></div>
    </div>
    {!data.locked && <div className="division-winners-live" role="status"><strong>Live result: {evaluateDivisionDraft(data.picks, divisions, data.settings.pointsPerCorrect).correct} of 8</strong><span>{selectedCount} of 8 selected</span><span className={isCompleteDivisionDraft(data.picks) ? 'complete' : 'incomplete'}>{isCompleteDivisionDraft(data.picks) ? 'Complete' : 'Incomplete drafts are allowed'}</span></div>}
    {message && <p className={`notice ${message === 'All changes saved' ? '' : message === 'Saving...' ? '' : 'error'}`} role="status">{message}</p>}
    {!data.locked ? <div className="division-editor" aria-label="Division winner picks">
      {DIVISION_DEFINITIONS.map((division) => <fieldset className="division-row" key={division.id}>
        <legend><strong>{division.name}</strong><span>{data.picks[division.id] ?? 'Not selected'}</span></legend>
        <div className="division-teams" role="radiogroup" aria-label={`${division.name} winner`}>
          {division.teams.map((team) => <label key={team} className={data.picks[division.id] === team ? 'selected' : ''}>
            <input type="radio" name={`division-${division.id}`} value={team} checked={data.picks[division.id] === team} onChange={() => save({ ...data.picks, [division.id]: team })} />
            <TeamLogo team={team} size="large" /><span>{team}</span>
          </label>)}
        </div>
      </fieldset>)}
    </div> : <>
      <section className="division-results" aria-labelledby="division-results-title"><h3 id="division-results-title">Results</h3><div className="table-scroll"><table data-testid="division-results-table"><thead><tr><th>Player</th><th>Correct</th><th>Hypothetical points</th></tr></thead><tbody>{resultRows.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.correct} / 8</td><td>{row.points}</td></tr>)}</tbody></table></div></section>
      <DivisionWinnersChart rows={resultRows} pointsPerCorrect={data.settings.pointsPerCorrect} />
      <section className="division-matrix" aria-labelledby="division-matrix-title"><h3 id="division-matrix-title">Player-by-division matrix</h3><div className="table-scroll"><table data-testid="division-matrix-table"><caption className="sr-only">All Division winners selections and current correctness</caption><thead><tr><th>Player</th>{DIVISION_DEFINITIONS.map((division) => <th key={division.id}>{division.name}</th>)}</tr></thead><tbody>{resultRows.map((row) => <tr key={row.id}><th scope="row">{row.name}</th>{DIVISION_DEFINITIONS.map((division, index) => { const result = row.results[index]; const pick = row.picks[division.id]; return <td key={division.id} className={result === true ? 'correct' : result === false ? 'incorrect' : 'pending'} title={result === null ? 'Unevaluated' : result ? 'Correct leader' : 'Not the current leader'}>{pick ?? '—'} {result === true ? '✓' : result === false ? '×' : '·'}</td> })}</tr>)}</tbody></table></div></section>
    </>}
  </section>
}
