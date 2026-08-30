import React, { useEffect, useRef, useState } from 'react'
import { POOLS, buildSeasonHistory, isLocked, modelDisagreement, modelPicks, noVigProbabilities, poolMetrics, presetConfidencePicks, standings, validateDraft } from './domain.js'
import { gamesByPool, picksByUser as seededPicks, users } from './fixtures.js'
import { CumulativePointsChart, CurrentWeekChart, GotwChart, WeeklyPointsChart } from './charts.jsx'
import { Overview, TeamLogo } from './overview.jsx'
import AdminPanel from './adminPanel.jsx'
import { authenticate, clearSession, isCurrentPool, loadChartData, loadPool, loadRegistrationStatus, refreshLivePool, restoreSession, savePicks, updateDisplayName, updatePassword } from './api.js'
import { buildPickBackup, downloadPickBackup, recordPickBackup } from './backup.js'
import { formatCETTime, formatCETWeekday } from './time.js'

const clone = (value) => JSON.parse(JSON.stringify(value))
const STORAGE_KEY = 'nfl-pickem-rehearsal-v1'

const TEST_SCENARIOS = new Set(['scheduled', 'live', 'final', 'playoff', 'missing-data', 'stale-data', 'validation-error', 'preseason-rehearsal'])

function loadLocalState(useFixtures) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.users?.length && saved.picksByUser) return saved
  } catch { /* ignore invalid local rehearsal data */ }
  return { users: useFixtures ? users : [], picksByUser: useFixtures ? clone(seededPicks) : {} }
}

const dateRange = (games) => {
  if (!games.length) return ''
  const dates = games.map((game) => new Date(game.kickoff)).sort((a, b) => a - b)
  const format = (date) => new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', month: 'short', day: 'numeric' }).format(date)
  return dates[0].toDateString() === dates.at(-1).toDateString() ? format(dates[0]) : `${format(dates[0])}–${format(dates.at(-1))}`
}

const ModelPick = ({ pick, rank }) => pick ? <span className="model-pick" title={`${pick.team}, ${(pick.probability * 100).toFixed(1)}% win probability, rank ${rank ?? '—'}`}><TeamLogo team={pick.team} /><strong className="model-pick-team">{pick.team}</strong><span className="model-pick-probability">{(pick.probability * 100).toFixed(1)}%</span>{rank != null && <span className="model-pick-rank">#{rank}</span>}</span> : <span className="missing">No pick</span>

const MODEL_DEFINITIONS = [
  { id: 'model-fpi', name: 'FPI', kind: 'predictor' },
  { id: 'model-moneyline', name: 'Moneyline', kind: 'moneyline' },
  { id: 'model-avg', name: 'AVG', kind: 'aggregate' },
]

function StandingsTable({ board, pool, provisional, onProvisional, includeModels, onIncludeModels }) {
  return <section className="standings-card" aria-labelledby="standings-title">
    <div className="standings-heading">
      <div><h3 id="standings-title">{pool.phase === 'preseason' ? 'Rehearsal leaderboard' : 'Standings'}</h3>{pool.phase === 'preseason' && <p className="rehearsal">Rehearsal — does not count.</p>}</div>
      <div className="standings-options"><label className="provisional-toggle"><input type="checkbox" checked={provisional} onChange={(event) => onProvisional(event.target.checked)} /> Include provisional live scores</label><label className="provisional-toggle"><input type="checkbox" checked={includeModels} onChange={(event) => onIncludeModels(event.target.checked)} /> Include model picks</label></div>
    </div>
    <div className="table-scroll"><table className="standings-table" data-testid="standings-table" aria-label="Current standings"><thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Pick %</th><th>Point %</th><th>Games picked</th></tr></thead><tbody>{board.map((player, index) => <tr key={player.id}><th scope="row">{index + 1}</th><td><strong>{player.name}</strong></td><td>{player.points}</td><td>{player.played ? `${(player.correct / player.played * 100).toFixed(1)}%` : '—'}</td><td>{player.maximum ? `${(player.points / player.maximum * 100).toFixed(1)}%` : '—'}</td><td>{player.picksMade}</td></tr>)}</tbody></table></div>
  </section>
}

function AuthPanel({ onSession }) {
  const [registering, setRegistering] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registrationOpen, setRegistrationOpenState] = useState(true)
  useEffect(() => { loadRegistrationStatus().then((result) => setRegistrationOpenState(result.registrationOpen !== false)).catch(() => {}) }, [])
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try { onSession(await authenticate(registering ? 'register' : 'login', values)) }
    catch (failure) { setError(failure.code?.replaceAll('_', ' ') ?? 'Unable to sign in') }
    finally { setBusy(false) }
  }
  return <main className="auth-shell"><section className="auth-panel"><a className="brand" href="#top"><span>NFL</span> Pick'em '26</a><p className="eyebrow">2026 preseason rehearsal</p><h1>{registering ? 'Create your player' : 'Welcome back'}</h1><p>{registering ? 'Use a username and password. Email is optional and never required.' : 'Sign in with your username and password.'}</p>{registering && !registrationOpen && <p className="notice error" role="status">New registrations are currently closed.</p>}<form onSubmit={submit}>{registering && <label>Username<input name="username" required minLength="3" maxLength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" autoComplete="username" /></label>}{registering && <label>Display name<input name="displayName" required maxLength="40" autoComplete="name" /></label>}{registering && <label>Email <span className="optional">optional</span><input name="email" type="email" autoComplete="email" /></label>}{!registering && <label>Username<input name="username" required autoComplete="username" /></label>}<label>Password<input name="password" type="password" required minLength="8" autoComplete={registering ? 'new-password' : 'current-password'} /></label>{error && <p className="notice error" role="alert">{error}</p>}<button type="submit" disabled={busy || registering && !registrationOpen}>{busy ? 'Please wait...' : registering ? 'Register and play' : 'Sign in'}</button></form><button className="text-button" type="button" onClick={() => { setRegistering(!registering); setError('') }}>{registering ? 'Already registered? Sign in' : 'Need an account? Register'}</button></section></main>
}

const liveGame = (game) => game.status === 'live' || game.status === 'in'
const gameStateLabel = (game) => game.status === 'final' || game.status === 'post' ? 'FINAL' : liveGame(game) ? 'LIVE' : 'SCHEDULED'
const liveDetail = (game) => liveGame(game) ? (game.period || game.displayClock ? `Q${game.period ?? '?'} · ${game.displayClock ?? '—'}` : game.statusDetail) : null

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario')
  const useFixtures = import.meta.env.MODE === 'test' || import.meta.env.DEV && TEST_SCENARIOS.has(scenario)
  const activeScenario = useFixtures ? scenario : null
  const enabledPools = POOLS
  const [localState] = useState(() => loadLocalState(useFixtures))
  const [appUsers, setAppUsers] = useState(localState.users)
  const [poolKey, setPoolKey] = useState(activeScenario === 'playoff' ? 'super-bowl' : POOLS.some((pool) => pool.key === params.get('pool')) ? params.get('pool') : useFixtures ? 'week-01' : 'preseason-03')
  const [userId, setUserId] = useState(localState.users[0]?.id ?? '')
  const [picksByUser, setPicks] = useState(localState.picksByUser)
  const [loadedGamesByPool, setLoadedGamesByPool] = useState(() => useFixtures ? gamesByPool : {})
  const [dataState, setDataState] = useState({ loading: !useFixtures, error: null, asOf: null, source: null, cached: false })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshRequest, setRefreshRequest] = useState({ version: 0, force: false })
  const initialLoadKey = useRef('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [viewerName, setViewerName] = useState('')
  const [profileDraft, setProfileDraft] = useState('')
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [tab, setTab] = useState('overview')
  const [provisional, setProvisional] = useState(true)
  const [message, setMessage] = useState(activeScenario === 'validation-error' ? 'INVALID CONFIDENCE SET' : 'All changes saved')
  const [showSetup, setShowSetup] = useState(false)
  const [playerNames, setPlayerNames] = useState(['', '', ''])
  const [draggedGameId, setDraggedGameId] = useState(null)
  const [dragOverGameId, setDragOverGameId] = useState(null)
  const pointerDrag = useRef(null)
  const [session, setSession] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [authReady, setAuthReady] = useState(useFixtures)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const refreshActive = useRef(false)
  const draftRevisions = useRef({})
  const saveQueue = useRef(Promise.resolve())
  const pool = POOLS.find((item) => item.key === poolKey)
  const baseGames = loadedGamesByPool[poolKey] ?? []
  const currentWeek = isCurrentPool(baseGames)
  const hasLiveGames = currentWeek && baseGames.some((game) => game.status === 'live' || game.status === 'in')
  const games = baseGames.map((game, index) => activeScenario === 'scheduled' ? { ...game, status: 'scheduled', kickoff: new Date(Date.now() + (index + 1) * 3600000).toISOString(), awayScore: 0, homeScore: 0 } : activeScenario === 'live' ? { ...game, status: index === 0 ? 'live' : 'scheduled', kickoff: new Date(Date.now() + (index ? index : -1) * 3600000).toISOString(), homeWinProbability: index === 0 ? game.homeWinProbability ?? .68 : game.homeWinProbability } : activeScenario === 'final' ? { ...game, status: 'final', kickoff: new Date(Date.now() - (index + 1) * 3600000).toISOString() } : activeScenario === 'missing-data' ? { ...game, predictorHome: null, homeMoneyline: null, awayMoneyline: null } : game)
  const userPicks = picksByUser[userId]?.[poolKey] ?? []
  const [includeChartModels, setIncludeChartModels] = useState(false)
  const chartGamesByPool = { ...(chartData?.gamesByPool ?? loadedGamesByPool), [poolKey]: games }
  const normalPicksByUser = Object.fromEntries([...new Set([...Object.keys(chartData?.picksByUser ?? {}), ...Object.keys(picksByUser)])].map((id) => [id, { ...(chartData?.picksByUser?.[id] ?? {}), ...(picksByUser[id] ?? {}) }]))
  const modelPicksByUser = Object.fromEntries(MODEL_DEFINITIONS.map((model) => [model.id, Object.fromEntries(Object.entries(chartGamesByPool).map(([key, poolGames]) => [key, modelPicks(poolGames, model.kind)]))]))
  const chartUsers = includeChartModels ? [...appUsers, ...MODEL_DEFINITIONS.map(({ id, name }) => ({ id, name, model: true }))] : appUsers
  const chartPicksByUser = includeChartModels ? { ...normalPicksByUser, ...modelPicksByUser } : normalPicksByUser
  const board = standings(chartUsers, games, Object.fromEntries(chartUsers.map((user) => [user.id, chartPicksByUser[user.id]?.[poolKey] ?? []])), provisional)
  const chartHistory = buildSeasonHistory(chartUsers, chartGamesByPool, chartPicksByUser, provisional, poolKey, true)
  const overviewModelHistory = buildSeasonHistory(MODEL_DEFINITIONS, chartGamesByPool, modelPicksByUser, provisional, poolKey, true)
  const seasonTotals = new Map(chartHistory.users.map((user) => [user.id, user.cumulative.at(-1) ?? 0]))
  const current = poolMetrics(chartUsers, games, Object.fromEntries(chartUsers.map((user) => [user.id, chartPicksByUser[user.id]?.[poolKey] ?? []])), provisional)
    .map(({ id, name, points, potential, correct, played, maximum }) => ({ id, name, points, potential, correct, played, maximum, gameCount: games.length, seasonTotal: seasonTotals.get(id) ?? 0 }))
  const aggregate = modelPicks(games, 'aggregate')
  const predictor = modelPicks(games, 'predictor')
  const moneyline = modelPicks(games, 'moneyline')
  const [modelSort, setModelSort] = useState({ key: 'kickoff', direction: 'ascending' })
  const sortModelsBy = (key) => setModelSort((current) => ({ key, direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending' }))
  const modelSortIndicator = (key) => modelSort.key === key ? (modelSort.direction === 'ascending' ? ' ▲' : ' ▼') : ''
  const modelSortOrder = (key) => modelSort.key === key ? modelSort.direction === 'ascending' ? 'ascending' : 'descending' : 'none'
  const modelRows = games.map((game) => ({
    game,
    fpi: predictor.find((item) => item.gameId === game.id),
    moneyline: moneyline.find((item) => item.gameId === game.id),
    avg: aggregate.find((item) => item.gameId === game.id),
    disagreement: modelDisagreement(game),
  }))
  const sortedModelRows = [...modelRows].sort((a, b) => {
    const value = (row) => ({
      game: `${row.game.away}@${row.game.home}`,
      kickoff: Date.parse(row.game.kickoff),
      fpi: row.fpi?.probability,
      fpiRank: row.fpi?.confidence,
      moneyline: row.moneyline?.probability,
      moneylineRank: row.moneyline?.confidence,
      avg: row.avg?.probability,
      avgRank: row.avg?.confidence,
      homeProbability: row.avg?.probability,
      disagreement: row.disagreement,
    })[modelSort.key]
    const aValue = value(a)
    const bValue = value(b)
    if (aValue == null && bValue != null) return 1
    if (aValue != null && bValue == null) return -1
    if (aValue !== bValue) return (aValue < bValue ? -1 : 1) * (modelSort.direction === 'ascending' ? 1 : -1)
    return Date.parse(a.game.kickoff) - Date.parse(b.game.kickoff) || a.game.id.localeCompare(b.game.id)
  })

  const displayedGames = [...games].sort((a, b) => {
    const aRank = userPicks.find((pick) => pick.gameId === a.id)?.confidence ?? Number.MAX_SAFE_INTEGER
    const bRank = userPicks.find((pick) => pick.gameId === b.id)?.confidence ?? Number.MAX_SAFE_INTEGER
    return aRank - bRank || new Date(a.kickoff) - new Date(b.kickoff) || a.id.localeCompare(b.id)
  })

  useEffect(() => {
    if (useFixtures) return
    restoreSession().then(setSession).finally(() => setAuthReady(true))
  }, [useFixtures])

  useEffect(() => {
    if (useFixtures || !session?.access_token) return
    let active = true
    loadChartData(session.access_token).then((result) => { if (active) setChartData(result) }).catch(() => {})
    return () => { active = false }
  }, [useFixtures, session?.access_token])

  useEffect(() => {
    if (useFixtures || !session?.refresh_token) return
    const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + (session.expires_in ?? 3600) * 1000
    const delay = Math.max(5000, expiresAt - Date.now() - 60000)
    const refresh = setTimeout(() => authenticate('refresh', { refreshToken: session.refresh_token }).then(setSession).catch(() => { clearSession(); setSession(null) }), delay)
    return () => clearTimeout(refresh)
  }, [useFixtures, session?.refresh_token, session?.expires_at])

  useEffect(() => {
    if (useFixtures || !session?.access_token) return
    const loadKey = `${session.user.id}:${poolKey}`
    const initial = initialLoadKey.current !== loadKey
    const controller = new AbortController()
    const load = async () => {
      refreshActive.current = true
      setIsRefreshing(true)
      if (initial) setDataState((state) => ({ ...state, loading: !loadedGamesByPool[poolKey], error: null }))
      try {
        if (initial) {
          const result = await loadPool(poolKey, session.access_token, { forceRefresh: refreshRequest.force, signal: controller.signal })
          if (controller.signal.aborted) return
          initialLoadKey.current = loadKey
          draftRevisions.current[poolKey] = result.draftRevision
          setAppUsers(result.users)
          setViewerName(result.viewer?.name ?? '')
          setProfileDraft(result.viewer?.name ?? '')
          setIsAdmin(Boolean(result.viewer?.isAdmin))
          setUserId(session.user.id)
          setLoadedGamesByPool((all) => ({ ...all, [poolKey]: result.games }))
          setPicks((all) => ({ ...all, ...Object.fromEntries(result.users.map((player) => [player.id, { ...all[player.id], [poolKey]: result.picksByUser[player.id] ?? [] }])), [session.user.id]: { ...all[session.user.id], [poolKey]: result.ownPicks } }))
          setDataState({ loading: false, error: result.games.length ? null : 'No games are currently available for this pool.', asOf: result.asOf, source: result.espnSource ?? 'Supabase schedule', cached: Boolean(result.espnCached) })
        } else {
          const result = await refreshLivePool(poolKey, loadedGamesByPool[poolKey] ?? [], { currentWeek, forceRefresh: refreshRequest.force, signal: controller.signal })
          if (controller.signal.aborted) return
          setLoadedGamesByPool((all) => ({ ...all, [poolKey]: result.games }))
          setDataState((state) => ({ ...state, loading: false, error: null, asOf: result.asOf, source: result.source ?? state.source, cached: Boolean(result.cached) }))
        }
      } catch {
        if (!controller.signal.aborted) setDataState((state) => ({ ...state, loading: false, error: initial ? 'Shared pick data is temporarily unavailable.' : 'Live ESPN data is temporarily unavailable; showing the last update.' }))
      } finally {
        if (!controller.signal.aborted) {
          refreshActive.current = false
          setIsRefreshing(false)
        }
      }
    }
    load()
    return () => controller.abort()
  }, [poolKey, useFixtures, session?.access_token, session?.user?.id, refreshRequest.version])

  useEffect(() => {
    if (useFixtures || !session?.access_token) return
    const refresh = (force = false) => {
      if (document.visibilityState === 'visible' && !refreshActive.current) setRefreshRequest((request) => ({ version: request.version + 1, force }))
    }
    const interval = setInterval(refresh, hasLiveGames ? 30 * 1000 : 2 * 60 * 1000)
    const refreshOnVisible = () => refresh()
    document.addEventListener('visibilitychange', refreshOnVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refreshOnVisible) }
  }, [useFixtures, session?.access_token, hasLiveGames, currentWeek])

  useEffect(() => {
    if (!games.length) return
    setPicks((all) => {
      let changed = false
      const next = { ...all }
      for (const player of (useFixtures ? appUsers : appUsers.filter((player) => player.id === userId))) {
        const previous = all[player.id]?.[poolKey] ?? []
        const draft = presetConfidencePicks(games, previous)
        if (JSON.stringify(previous) !== JSON.stringify(draft)) {
          next[player.id] = { ...all[player.id], [poolKey]: draft }
          changed = true
        }
      }
      return changed ? next : all
    })
  }, [appUsers, poolKey, baseGames, useFixtures, userId])

  useEffect(() => { if (useFixtures) localStorage.setItem(STORAGE_KEY, JSON.stringify({ users: appUsers, picksByUser })) }, [appUsers, picksByUser, useFixtures])

  const registerPlayers = (event) => {
    event.preventDefault()
    const names = playerNames.map((name) => name.trim())
    if (names.some((name) => !name) || new Set(names.map((name) => name.toLocaleLowerCase())).size !== 3) { setMessage('ENTER 3 UNIQUE PLAYER NAMES'); return }
    const players = names.map((name, index) => ({ id: `local-${Date.now()}-${index + 1}`, name }))
    setAppUsers(players)
    setPicks(Object.fromEntries(players.map((player) => [player.id, Object.fromEntries(Object.entries(loadedGamesByPool).map(([key, poolGames]) => [key, presetConfidencePicks(poolGames)]))])))
    setUserId(players[0].id)
    setShowSetup(false)
    setMessage('3 players registered · picks saved on this device')
  }

  const backupAccountKey = session?.user?.id ?? userId ?? 'local-rehearsal'
  const exportBackup = () => downloadPickBackup(buildPickBackup({
    accountKey: backupAccountKey,
    poolKey,
    currentPicks: userPicks,
    players: appUsers,
    allPicks: useFixtures ? picksByUser : picksByUser[userId] ?? {},
    localRehearsal: useFixtures,
  }))

  const persistDraft = (draft) => {
    if (isAdmin) recordPickBackup(backupAccountKey, poolKey, draft)
    if (useFixtures || !session?.access_token) return
    const savingPool = poolKey
    setMessage('Saving...')
    saveQueue.current = saveQueue.current.then(async () => {
      const result = await savePicks(savingPool, session.access_token, draftRevisions.current[savingPool] ?? 0, draft)
      draftRevisions.current[savingPool] = result.draftRevision
      setMessage('All changes saved')
    }).catch((error) => setMessage((error.code ?? 'SAVE_FAILED').replaceAll('_', ' ')))
  }

  const updatePick = (gameId, changes) => {
    const oldDraft = userPicks
    const changed = oldDraft.find((pick) => pick.gameId === gameId)
    const occupied = Number.isInteger(changes.confidence) ? oldDraft.find((pick) => pick.gameId !== gameId && pick.confidence === changes.confidence) : null
    if (occupied && isLocked(games.find((game) => game.id === occupied.gameId), new Date(), pool.acceptsLatePicks)) { setMessage('LOCKED VALUE CANNOT BE REUSED'); return }
    const nextDraft = oldDraft.map((pick) => pick.gameId === gameId ? { ...pick, ...changes } : occupied?.gameId === pick.gameId ? { ...pick, confidence: changed.confidence } : pick)
    const result = validateDraft(games, nextDraft, { previous: oldDraft, acceptsLatePicks: pool.acceptsLatePicks })
    if (!result.ok) { setMessage(result.code.replaceAll('_', ' ')); return }
    setPicks((all) => ({ ...all, [userId]: { ...all[userId], [poolKey]: nextDraft } }))
    setMessage('All changes saved')
    persistDraft(nextDraft)
  }

  const swapConfidence = (sourceGameId, targetGameId) => {
    if (!sourceGameId || sourceGameId === targetGameId) return
    const sourcePick = userPicks.find((pick) => pick.gameId === sourceGameId)
    const sourceGame = games.find((game) => game.id === sourceGameId)
    const targetGame = games.find((game) => game.id === targetGameId)
    if (!Number.isInteger(sourcePick?.confidence) || isLocked(sourceGame, new Date(), pool.acceptsLatePicks) || isLocked(targetGame, new Date(), pool.acceptsLatePicks)) {
      setMessage('LOCKED VALUE CANNOT BE MOVED')
      return
    }
    updatePick(targetGameId, { confidence: sourcePick.confidence })
  }

  useEffect(() => {
    const rowAt = (x, y, fallback) => document.elementFromPoint(x, y)?.closest?.('[data-testid^="game-row-"]') ?? fallback?.closest?.('[data-testid^="game-row-"]')
    const finishPointerDrag = (event) => {
      const active = pointerDrag.current
      if (!active || active.pointerId !== event.pointerId) return
      const target = rowAt(event.clientX, event.clientY, event.target)
      if (active.sourceGameId && target?.dataset.testid) swapConfidence(active.sourceGameId, target.dataset.testid.replace('game-row-', ''))
      pointerDrag.current = null
      setDraggedGameId(null)
      setDragOverGameId(null)
    }
    const startPointerDrag = (event) => {
      if (event.pointerType === 'mouse' || pointerDrag.current || !event.target.closest?.('.drag-handle')) return
      const row = event.target.closest?.('[data-testid^="game-row-"]')
      if (!row || row.getAttribute('draggable') !== 'true') return
      pointerDrag.current = { pointerId: event.pointerId, sourceGameId: row.dataset.testid.replace('game-row-', '') }
      try { row.setPointerCapture?.(event.pointerId) } catch { /* synthetic and cancelled pointers have no capture target */ }
      setDraggedGameId(pointerDrag.current.sourceGameId)
      event.preventDefault()
    }
    const movePointerDrag = (event) => {
      if (!pointerDrag.current || pointerDrag.current.pointerId !== event.pointerId) return
      const target = rowAt(event.clientX, event.clientY, event.target)
      const targetId = target?.dataset.testid?.replace('game-row-', '')
      if (targetId && targetId !== pointerDrag.current.sourceGameId) setDragOverGameId(targetId)
      event.preventDefault()
    }
    document.addEventListener('pointerdown', startPointerDrag)
    document.addEventListener('pointermove', movePointerDrag, { passive: false })
    document.addEventListener('pointerup', finishPointerDrag)
    document.addEventListener('pointercancel', finishPointerDrag)
    return () => {
      document.removeEventListener('pointerdown', startPointerDrag)
      document.removeEventListener('pointermove', movePointerDrag)
      document.removeEventListener('pointerup', finishPointerDrag)
      document.removeEventListener('pointercancel', finishPointerDrag)
    }
  }, [games, pool.acceptsLatePicks, swapConfidence, userId, userPicks])

  const submitPasswordChange = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    if (values.password !== values.confirmPassword) { setPasswordMessage('PASSWORDS DO NOT MATCH'); return }
    setPasswordBusy(true)
    setPasswordMessage('')
    try {
      await updatePassword(session.access_token, values.password)
      form.reset()
      setPasswordMessage('PASSWORD CHANGED')
    } catch (error) { setPasswordMessage((error.code ?? 'PASSWORD_UPDATE_FAILED').replaceAll('_', ' ')) }
    finally { setPasswordBusy(false) }
  }

  const submitProfileChange = async (event) => {
    event.preventDefault()
    const name = profileDraft.trim()
    if (!name || name.length > 40) { setProfileMessage('ENTER A DISPLAY NAME UP TO 40 CHARACTERS'); return }
    setProfileBusy(true)
    setProfileMessage('')
    try {
      const result = await updateDisplayName(session.access_token, name)
      const savedName = result?.displayName ?? name
      setViewerName(savedName)
      setProfileDraft(savedName)
      setAppUsers((users) => users.map((user) => user.id === session.user.id ? { ...user, name: savedName } : user))
      setProfileMessage('DISPLAY NAME SAVED')
    } catch (error) { setProfileMessage((error.code ?? 'DISPLAY_NAME_UPDATE_FAILED').replaceAll('_', ' ')) }
    finally { setProfileBusy(false) }
  }

  const requestRefresh = () => setRefreshRequest((request) => ({ version: request.version + 1, force: true }))

  if (!authReady) return <main className="auth-shell"><p>Restoring your session...</p></main>
  if (!useFixtures && !session) return <AuthPanel onSession={setSession} />

  return <>
      <header><a className="brand" href="#top"><span>NFL</span> Pick'em '26</a><nav aria-label="Main navigation">{[['overview', 'Overview'], ['games', 'My picks'], ['charts', 'Charts'], ['models', 'Win probs.'], ...(isAdmin ? [['admin', 'Admin']] : [])].map(([item, label]) => <button key={item} className={`${tab === item ? 'active' : ''} ${item === 'models' ? 'models-tab' : ''}`} onClick={() => setTab(item)}>{item === 'models' ? <>Win <span className="models-word-second">probs.</span></> : label}</button>)}</nav>{useFixtures ? <><button className="setup-button" type="button" aria-label="Set up 3 players" onClick={() => setShowSetup((open) => !open)}>Players</button><label className="user-switch"><span>Playing as</span><select aria-label="Active user" value={userId} onChange={(event) => setUserId(event.target.value)}>{appUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></> : <div className="signed-in"><span className="viewer-name">{viewerName || session.user.user_metadata?.display_name || session.user.user_metadata?.username || 'Player'}</span><button className="account-toggle" type="button" aria-label="Player options" aria-expanded={showAccountMenu} onClick={() => setShowAccountMenu((open) => !open)}>•••</button><div className={`account-actions ${showAccountMenu ? 'open' : ''}`}>{isAdmin && <button className="backup-button" type="button" data-testid="download-backup" onClick={exportBackup}>Backup</button>}<button type="button" onClick={() => { setShowProfileForm((open) => !open); setProfileMessage(''); setShowAccountMenu(false) }}>Settings</button><button type="button" onClick={() => { setTab('rules'); setShowAccountMenu(false) }}>Rules</button><button type="button" aria-expanded={showPasswordForm} onClick={() => { setShowPasswordForm((open) => !open); setPasswordMessage(''); setShowAccountMenu(false) }}>Change password</button><button type="button" onClick={() => { clearSession(); initialLoadKey.current = ''; setSession(null); setAppUsers([]); setPicks({}); setIsAdmin(false); setShowAccountMenu(false) }}>Sign out</button></div></div>}</header>
    <main id="top">
      {useFixtures && showSetup && <form className="player-setup" aria-label="Set up 3 players" onSubmit={registerPlayers}><div><h2>Register 3 rehearsal players</h2><p>This replaces local rehearsal players and picks on this device.</p></div>{playerNames.map((name, index) => <label key={index}>Player {index + 1}<input aria-label={`Player ${index + 1} name`} value={name} onChange={(event) => setPlayerNames((all) => all.map((item, i) => i === index ? event.target.value : item))} autoComplete="off" /></label>)}<button type="submit">Create players</button></form>}
       <section className="hero"><div className="hero-actions"><label><span className="sr-only">Week</span><select aria-label="Week" value={poolKey} onChange={(event) => setPoolKey(event.target.value)}>{enabledPools.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>{!useFixtures && <button type="button" title={currentWeek ? 'Refresh the current week from ESPN' : 'Refresh this week from ESPN, including model data'} onClick={requestRefresh} disabled={isRefreshing}>{isRefreshing ? 'Refreshing…' : 'Refresh'}</button>}</div></section>
       {!useFixtures && showProfileForm && <form className="profile-form" onSubmit={submitProfileChange}><h2>Profile settings</h2><label>Display name<input aria-label="Display name" value={profileDraft} onChange={(event) => setProfileDraft(event.target.value)} maxLength="40" required autoComplete="name" /></label>{profileMessage && <p className={`notice ${profileMessage === 'DISPLAY NAME SAVED' ? '' : 'error'}`} role="status">{profileMessage}</p>}<button type="submit" disabled={profileBusy}>{profileBusy ? 'Saving...' : 'Save display name'}</button></form>}
       {!useFixtures && showPasswordForm && <form className="password-form" onSubmit={submitPasswordChange}><h2>Change password</h2><label>New password<input name="password" type="password" minLength="8" required autoComplete="new-password" /></label><label>Confirm new password<input name="confirmPassword" type="password" minLength="8" required autoComplete="new-password" /></label>{passwordMessage && <p className={`notice ${passwordMessage === 'PASSWORD CHANGED' ? '' : 'error'}`} role="status">{passwordMessage}</p>}<button type="submit" disabled={passwordBusy}>{passwordBusy ? 'Saving...' : 'Save new password'}</button></form>}
      {dataState.loading && <p className="notice" role="status">Loading the real ESPN schedule and pregame probabilities…</p>}
      {dataState.error && <p className="notice error" role="alert">{dataState.error}</p>}
      {activeScenario === 'stale-data' && <p className="notice" role="status">Showing last-good data · updated 24 hours ago</p>}
      {activeScenario === 'missing-data' && <p className="notice" role="status">Some model data is unavailable. Picks and scores remain available.</p>}
      {tab === 'overview' && <Overview players={appUsers} games={games} picksByUser={Object.fromEntries(appUsers.map((user) => [user.id, picksByUser[user.id]?.[poolKey] ?? []]))} history={chartHistory} modelHistory={overviewModelHistory} pool={pool} provisional={provisional} onProvisional={setProvisional} />}
      {tab === 'games' && <section><div className="section-title"><div><h2>Make your picks</h2><p>Confidence is preset from AVG strength. Drag a row to reorder it; on touch, use its handle.</p>{pool.acceptsLatePicks && <p className="notice">Preseason rehearsal picks remain editable after kickoff.</p>}</div><div className="pick-status"><span className="save-state" role="status">{message}</span>{(() => { const pickedCount = userPicks.filter((pick) => pick.team).length; const complete = games.length > 0 && pickedCount === games.length; return <span className={`pick-completion ${complete ? 'complete' : 'incomplete'}`} role="status"><span aria-hidden="true">{complete ? '✓' : '!'}</span>{pickedCount} / {games.length} picked</span> })()}</div></div><div className="slate-head" aria-hidden="true"><span>Kickoff</span><span>Matchup</span><span>Confidence</span></div><div className="games">{displayedGames.map((game) => { const pick = userPicks.find((item) => item.gameId === game.id); const locked = isLocked(game, new Date(), pool.acceptsLatePicks); const kickoff = new Date(game.kickoff); const moneylineHome = noVigProbabilities(game.homeMoneyline, game.awayMoneyline)?.home; const pregameHome = Number.isFinite(game.predictorHome) && Number.isFinite(moneylineHome) ? (game.predictorHome + moneylineHome) / 2 : Number.isFinite(game.predictorHome) ? game.predictorHome : moneylineHome; const liveHome = liveGame(game) && Number.isFinite(game.homeWinProbability) ? `${(game.homeWinProbability * 100).toFixed(0)}%` : null; const liveAway = liveHome ? `${((1 - game.homeWinProbability) * 100).toFixed(0)}%` : null; return <article data-testid={`game-row-${game.id}`} className={`game ${game.status} ${pick?.team ? 'picked' : ''} ${draggedGameId === game.id ? 'dragging' : ''} ${dragOverGameId === game.id ? 'drop-target' : ''}`} key={game.id} draggable={!locked && Number.isInteger(pick?.confidence)} title={locked ? 'This game is locked' : 'Drag this row to change its confidence rank'} onDragStart={(event) => { if (event.target.closest?.('.teams')) { event.preventDefault(); return } event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', game.id); setDraggedGameId(game.id) }} onDragEnd={() => { setDraggedGameId(null); setDragOverGameId(null) }} onDragOver={(event) => { if (!locked && draggedGameId && draggedGameId !== game.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragOverGameId !== game.id) setDragOverGameId(game.id) } }} onDrop={(event) => { event.preventDefault(); swapConfidence(event.dataTransfer.getData('text/plain') || draggedGameId, game.id); setDraggedGameId(null); setDragOverGameId(null) }}><div className="game-meta"><time dateTime={game.kickoff}><span>{formatCETWeekday(kickoff)}</span><strong>{formatCETTime(kickoff)}</strong></time><span className={`game-status ${liveGame(game) ? 'live-status' : ''}`}>{liveGame(game) ? <span className="live-badge">LIVE</span> : locked ? 'locked' : gameStateLabel(game)}{liveDetail(game) && <small>{liveDetail(game)}</small>}</span>{game.gotw && <strong className="gotw">GOTW +5</strong>}</div><fieldset disabled={locked}><legend className="sr-only">{game.away} @ {game.home}</legend><div className="teams"><label className={pick?.team === game.away ? 'selected' : ''}><input type="radio" name={`${userId}-${game.id}`} checked={pick?.team === game.away} onChange={() => updatePick(game.id, { team: game.away })} /><TeamLogo team={game.away} /><span>{game.away}</span><b title={liveAway ? 'ESPN real-time win probability' : 'Pregame win probability'}>{liveAway ?? (game.status === 'scheduled' && Number.isFinite(pregameHome) ? `${((1 - pregameHome) * 100).toFixed(0)}%` : game.awayScore)}</b></label><span className="at">@</span><label className={pick?.team === game.home ? 'selected' : ''}><input type="radio" name={`${userId}-${game.id}`} checked={pick?.team === game.home} onChange={() => updatePick(game.id, { team: game.home })} /><TeamLogo team={game.home} /><span>{game.home}</span><b title={liveHome ? 'ESPN real-time win probability' : 'Pregame win probability'}>{liveHome ?? (game.status === 'scheduled' && Number.isFinite(pregameHome) ? `${(pregameHome * 100).toFixed(0)}%` : game.homeScore)}</b></label></div></fieldset><div className="confidence-cell"><span className="drag-handle" aria-hidden="true" data-testid={`confidence-drag-${game.id}`} data-game-id={game.id}>⠿</span><label className="confidence"><span>Rank</span><select aria-label={`${game.away} at ${game.home} confidence`} value={pick?.confidence ?? ''} onChange={(event) => updatePick(game.id, { confidence: event.target.value ? Number(event.target.value) : null })} disabled={locked}>{games.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label></div></article> })}</div></section>}
      {tab === 'charts' && <section><StandingsTable board={board} pool={pool} provisional={provisional} onProvisional={setProvisional} includeModels={includeChartModels} onIncludeModels={setIncludeChartModels} /><div className="charts"><CumulativePointsChart history={chartHistory} />{games.length > 0 && <CurrentWeekChart current={current} />}<WeeklyPointsChart history={chartHistory} /><GotwChart history={chartHistory} /></div></section>}
      {tab === 'models' && <section><div className="section-title"><div><h2>Model picks</h2><p>ESPN FPI probability and normalized no-vig moneyline, equal weighted.</p></div></div><div className="table-scroll"><table className="models-table"><thead><tr><th aria-sort={modelSortOrder('kickoff')}><button className="table-sort-button" type="button" data-testid="models-sort-game" onClick={() => sortModelsBy('kickoff')}>Game{modelSortIndicator('kickoff')}</button></th><th className="model-pick-column" aria-sort={modelSortOrder('fpi')}><button className="table-sort-button" type="button" data-testid="models-sort-fpi" onClick={() => sortModelsBy('fpi')}>FPI{modelSortIndicator('fpi')}</button></th><th className="model-rank-column" aria-sort={modelSortOrder('fpiRank')}><button className="table-sort-button" type="button" data-testid="models-sort-fpi-rank" onClick={() => sortModelsBy('fpiRank')}>Rank{modelSortIndicator('fpiRank')}</button></th><th className="model-pick-column" aria-sort={modelSortOrder('moneyline')}><button className="table-sort-button" type="button" data-testid="models-sort-moneyline" onClick={() => sortModelsBy('moneyline')}>Moneyline{modelSortIndicator('moneyline')}</button></th><th className="model-rank-column" aria-sort={modelSortOrder('moneylineRank')}><button className="table-sort-button" type="button" data-testid="models-sort-moneyline-rank" onClick={() => sortModelsBy('moneylineRank')}>Rank{modelSortIndicator('moneylineRank')}</button></th><th className="model-pick-column" aria-sort={modelSortOrder('avg')}><button className="table-sort-button" type="button" data-testid="models-sort-avg" onClick={() => sortModelsBy('avg')}>AVG{modelSortIndicator('avg')}</button></th><th className="model-rank-column" aria-sort={modelSortOrder('avgRank')}><button className="table-sort-button" type="button" data-testid="models-sort-avg-rank" onClick={() => sortModelsBy('avgRank')}>Rank{modelSortIndicator('avgRank')}</button></th><th className="model-probability-column" aria-sort={modelSortOrder('homeProbability')}><button className="table-sort-button" type="button" data-testid="models-sort-probability" onClick={() => sortModelsBy('homeProbability')}>Home probabilities FPI / ML / AVG{modelSortIndicator('homeProbability')}</button></th><th className="model-disagreement-column" aria-sort={modelSortOrder('disagreement')}><button className="table-sort-button" type="button" data-testid="models-sort-disagreement" onClick={() => sortModelsBy('disagreement')}>Disagreement{modelSortIndicator('disagreement')}</button></th></tr></thead><tbody>{sortedModelRows.map(({ game, fpi, moneyline: ml, avg: pick, disagreement }) => <tr key={game.id}><td><div className="model-game"><span className="model-matchup"><TeamLogo team={game.away} />{game.away}<span>@</span><TeamLogo team={game.home} />{game.home}</span><time dateTime={game.kickoff}>{formatCETWeekday(game.kickoff)} {formatCETTime(game.kickoff)}</time></div></td><td className="model-pick-column"><ModelPick pick={fpi} rank={fpi?.confidence} /></td><td className="model-rank-column">{fpi?.confidence ?? '—'}</td><td className="model-pick-column"><ModelPick pick={ml} rank={ml?.confidence} /></td><td className="model-rank-column">{ml?.confidence ?? '—'}</td><td className="model-pick-column"><ModelPick pick={pick} rank={pick?.confidence} /></td><td className="model-rank-column">{pick?.confidence ?? '—'}</td><td className="model-probability-column">{[fpi, ml, pick].map((item) => item ? `${(item.probability * 100).toFixed(1)}%` : '—').join(' / ')}</td><td className="model-disagreement-column">{disagreement === null ? 'Missing inputs' : `${(disagreement * 100).toFixed(1)}`}</td></tr>)}</tbody></table></div></section>}
      {tab === 'admin' && isAdmin && <AdminPanel poolKey={poolKey} token={session.access_token} onPicksUpdated={(playerId, picks) => setPicks((all) => ({ ...all, [playerId]: { ...all[playerId], [poolKey]: picks } }))} onPlayerDeleted={(playerId) => { setAppUsers((all) => all.filter((player) => player.id !== playerId)); setPicks((all) => { const next = { ...all }; delete next[playerId]; return next }) }} onGamesUpdated={(updatedPoolKey, updatedGames) => { setLoadedGamesByPool((all) => ({ ...all, [updatedPoolKey]: updatedGames })); setChartData((all) => all ? { ...all, gamesByPool: { ...all.gamesByPool, [updatedPoolKey]: updatedGames } } : all) }} />}
      {tab === 'rules' && <section className="rules"><h2>Rules</h2><h3>Confidence</h3><p>Use each value from 1 through the number of games exactly once in a completed pool. Locked games keep their values.</p><h3>Scoring</h3><p>A correct pick earns its confidence. Game of the Week adds five. A final tie awards every submitted team pick full points.</p><h3>Live results</h3><p>Official scoring uses finals only. Provisional scoring uses the score leader, then live win probability when tied.</p><h3>Models</h3><p>FPI, no-vig moneyline, and their equal-weight AVG receive unique confidence ranks from least to greatest probability separation.</p></section>}
    </main><footer>{useFixtures ? 'Deterministic test scenario' : games.length > 0 ? <span data-testid="real-data-status">{dataState.source === 'ESPN' ? 'Browser ESPN data' : dataState.source ?? 'Supabase schedule'}{dataState.cached ? ' · cached' : ''} · {games.length} games · {dateRange(games)} · pregame probabilities for {games.filter((game) => Number.isFinite(game.predictorHome) || Number.isFinite(game.homeMoneyline) && Number.isFinite(game.awayMoneyline)).length}/{games.length} · <time dateTime={dataState.asOf ?? new Date().toISOString()}>{dataState.asOf ? `Updated ${new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: '2-digit' }).format(new Date(dataState.asOf))}` : 'Loading'}</time></span> : 'Loading'} </footer>
  </>
}
