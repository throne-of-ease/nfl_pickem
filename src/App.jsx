import React, { useEffect, useRef, useState } from 'react'
import { POOLS, buildSeasonHistory, isLocked, modelDisagreement, modelPicks, noVigProbabilities, poolMetrics, presetConfidencePicks, standings, validateDraft } from './domain.js'
import { gamesByPool, picksByUser as seededPicks, users } from './fixtures.js'
import { CumulativePointsChart, CurrentWeekChart, GotwChart, WeeklyPointsChart } from './charts.jsx'
import { Overview, TeamLogo } from './overview.jsx'
import AdminPanel from './adminPanel.jsx'
import { authenticate, clearSession, loadChartData, loadPool, loadRegistrationStatus, refreshLivePool, restoreSession, savePicks } from './api.js'
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

const ModelPick = ({ pick }) => pick ? <span className="model-pick"><TeamLogo team={pick.team} /><strong>{pick.team}</strong></span> : <span className="missing">No pick</span>

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
  return <main className="auth-shell"><section className="auth-panel"><a className="brand" href="#top"><span>NFL</span> PICK/26</a><p className="eyebrow">2026 preseason rehearsal</p><h1>{registering ? 'Create your player' : 'Welcome back'}</h1><p>{registering ? 'Use a username and password. Email is optional and never required.' : 'Sign in with your username and password.'}</p>{registering && !registrationOpen && <p className="notice error" role="status">New registrations are currently closed.</p>}<form onSubmit={submit}>{registering && <label>Username<input name="username" required minLength="3" maxLength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" autoComplete="username" /></label>}{registering && <label>Display name<input name="displayName" required maxLength="40" autoComplete="name" /></label>}{registering && <label>Email <span className="optional">optional</span><input name="email" type="email" autoComplete="email" /></label>}{!registering && <label>Username<input name="username" required autoComplete="username" /></label>}<label>Password<input name="password" type="password" required minLength="8" autoComplete={registering ? 'new-password' : 'current-password'} /></label>{error && <p className="notice error" role="alert">{error}</p>}<button type="submit" disabled={busy || registering && !registrationOpen}>{busy ? 'Please wait...' : registering ? 'Register and play' : 'Sign in'}</button></form><button className="text-button" type="button" onClick={() => { setRegistering(!registering); setError('') }}>{registering ? 'Already registered? Sign in' : 'Need an account? Register'}</button></section></main>
}

const liveGame = (game) => game.status === 'live' || game.status === 'in'
const gameStateLabel = (game) => game.status === 'final' || game.status === 'post' ? 'FINAL' : liveGame(game) ? 'LIVE' : 'SCHEDULED'
const liveDetail = (game) => liveGame(game) && (game.period || game.displayClock) ? `Q${game.period ?? '?'} · ${game.displayClock ?? '—'}` : game.statusDetail

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
  const [dataState, setDataState] = useState({ loading: !useFixtures, error: null, asOf: null })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const initialLoadKey = useRef('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [viewerName, setViewerName] = useState('')
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
  const draftRevisions = useRef({})
  const saveQueue = useRef(Promise.resolve())
  const pool = POOLS.find((item) => item.key === poolKey)
  const baseGames = loadedGamesByPool[poolKey] ?? []
  const hasLiveGames = baseGames.some((game) => game.status === 'live' || game.status === 'in')
  const games = baseGames.map((game, index) => activeScenario === 'scheduled' ? { ...game, status: 'scheduled', kickoff: new Date(Date.now() + (index + 1) * 3600000).toISOString(), awayScore: 0, homeScore: 0 } : activeScenario === 'live' ? { ...game, status: index === 0 ? 'live' : 'scheduled', kickoff: new Date(Date.now() + (index ? index : -1) * 3600000).toISOString(), homeWinProbability: index === 0 ? game.homeWinProbability ?? .68 : game.homeWinProbability } : activeScenario === 'final' ? { ...game, status: 'final', kickoff: new Date(Date.now() - (index + 1) * 3600000).toISOString() } : activeScenario === 'missing-data' ? { ...game, predictorHome: null, homeMoneyline: null, awayMoneyline: null } : game)
  const userPicks = picksByUser[userId]?.[poolKey] ?? []
  const board = standings(appUsers, games, Object.fromEntries(appUsers.map((user) => [user.id, picksByUser[user.id]?.[poolKey] ?? []])), provisional)
  const seasonGamesByPool = { ...loadedGamesByPool, [poolKey]: games }
  const chartGamesByPool = { ...(chartData?.gamesByPool ?? loadedGamesByPool), [poolKey]: games }
  const chartPicksByUser = Object.fromEntries([...new Set([...Object.keys(chartData?.picksByUser ?? {}), ...Object.keys(picksByUser)])].map((id) => [id, { ...(chartData?.picksByUser?.[id] ?? {}), ...(picksByUser[id] ?? {}) }]))
  const history = buildSeasonHistory(appUsers, seasonGamesByPool, picksByUser, provisional, poolKey)
  const chartHistory = buildSeasonHistory(appUsers, chartGamesByPool, chartPicksByUser, provisional, poolKey, true)
  const seasonTotals = new Map(chartHistory.users.map((user) => [user.id, user.cumulative.at(-1) ?? 0]))
  const current = poolMetrics(appUsers, games, Object.fromEntries(appUsers.map((user) => [user.id, picksByUser[user.id]?.[poolKey] ?? []])), provisional)
    .map(({ id, name, points, potential, correct, played, maximum }) => ({ id, name, points, potential, correct, played, maximum, gameCount: games.length, seasonTotal: seasonTotals.get(id) ?? 0 }))
  const aggregate = modelPicks(games, 'aggregate')
  const predictor = modelPicks(games, 'predictor')
  const moneyline = modelPicks(games, 'moneyline')

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
      setIsRefreshing(true)
      if (initial) setDataState((state) => ({ ...state, loading: !loadedGamesByPool[poolKey], error: null }))
      try {
        if (initial) {
          const result = await loadPool(poolKey, session.access_token, { signal: controller.signal })
          if (controller.signal.aborted) return
          initialLoadKey.current = loadKey
          draftRevisions.current[poolKey] = result.draftRevision
          setAppUsers(result.users)
          setViewerName(result.viewer?.name ?? '')
          setIsAdmin(Boolean(result.viewer?.isAdmin))
          setUserId(session.user.id)
          setLoadedGamesByPool((all) => ({ ...all, [poolKey]: result.games }))
          setPicks((all) => ({ ...all, ...Object.fromEntries(result.users.map((player) => [player.id, { ...all[player.id], [poolKey]: result.picksByUser[player.id] ?? [] }])), [session.user.id]: { ...all[session.user.id], [poolKey]: result.ownPicks } }))
          setDataState({ loading: false, error: result.games.length ? null : 'No games are currently available for this pool.', asOf: result.asOf })
        } else {
          const result = await refreshLivePool(poolKey, loadedGamesByPool[poolKey] ?? [], { signal: controller.signal })
          if (controller.signal.aborted) return
          setLoadedGamesByPool((all) => ({ ...all, [poolKey]: result.games }))
          setDataState((state) => ({ ...state, loading: false, error: null, asOf: result.asOf }))
        }
      } catch {
        if (!controller.signal.aborted) setDataState((state) => ({ ...state, loading: false, error: initial ? 'Shared pick data is temporarily unavailable.' : 'Live ESPN data is temporarily unavailable; showing the last update.' }))
      } finally {
        if (!controller.signal.aborted) setIsRefreshing(false)
      }
    }
    load()
    const refresh = () => { if (document.visibilityState === 'visible') setRefreshVersion((version) => version + 1) }
    const interval = setInterval(refresh, hasLiveGames ? 30 * 1000 : 2 * 60 * 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', refresh) }
  }, [poolKey, useFixtures, session?.access_token, session?.user?.id, refreshVersion, hasLiveGames])

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

  if (!authReady) return <main className="auth-shell"><p>Restoring your session...</p></main>
  if (!useFixtures && !session) return <AuthPanel onSession={setSession} />

  return <>
      <header><a className="brand" href="#top"><span>NFL</span> PICK/26</a><nav aria-label="Main navigation">{[['overview', 'Overview'], ['games', 'My picks'], ['standings', 'Standings'], ['charts', 'Charts'], ['models', 'Models'], ['rules', 'Rules'], ...(isAdmin ? [['admin', 'Admin']] : [])].map(([item, label]) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{label}</button>)}</nav>{useFixtures ? <><button className="setup-button" type="button" aria-label="Set up 3 players" onClick={() => setShowSetup((open) => !open)}>Players</button><label className="user-switch"><span>Playing as</span><select aria-label="Active user" value={userId} onChange={(event) => setUserId(event.target.value)}>{appUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></> : <div className="signed-in"><span>{viewerName || session.user.user_metadata?.display_name || session.user.user_metadata?.username || 'Player'}</span>{isAdmin && <button className="backup-button" type="button" data-testid="download-backup" onClick={exportBackup}>Backup</button>}<button type="button" onClick={() => { clearSession(); initialLoadKey.current = ''; setSession(null); setAppUsers([]); setPicks({}); setIsAdmin(false) }}>Sign out</button></div>}</header>
    <main id="top">
      {useFixtures && showSetup && <form className="player-setup" aria-label="Set up 3 players" onSubmit={registerPlayers}><div><h2>Register 3 rehearsal players</h2><p>This replaces local rehearsal players and picks on this device.</p></div>{playerNames.map((name, index) => <label key={index}>Player {index + 1}<input aria-label={`Player ${index + 1} name`} value={name} onChange={(event) => setPlayerNames((all) => all.map((item, i) => i === index ? event.target.value : item))} autoComplete="off" /></label>)}<button type="submit">Create players</button></form>}
      <section className="hero"><div><p className="eyebrow">2026 season</p><h1>{pool.label}</h1>{pool.phase === 'preseason' && <p className="rehearsal">Rehearsal — does not count.</p>}</div><div className="hero-actions"><label>Pool <select aria-label="Pool" value={poolKey} onChange={(event) => setPoolKey(event.target.value)}>{enabledPools.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>{!useFixtures && <button type="button" onClick={() => setRefreshVersion((version) => version + 1)} disabled={isRefreshing}>{isRefreshing ? 'Refreshing…' : 'Refresh'}</button>}</div></section>
      {dataState.loading && <p className="notice" role="status">Loading the real ESPN schedule and pregame probabilities…</p>}
      {dataState.error && <p className="notice error" role="alert">{dataState.error}</p>}
      {!useFixtures && games.length > 0 && <p className="notice" role="status" data-testid="real-data-status">Browser ESPN · {games.length} games · {dateRange(games)} · pregame probabilities for {games.filter((game) => Number.isFinite(game.predictorHome) || Number.isFinite(game.homeMoneyline) && Number.isFinite(game.awayMoneyline)).length}/{games.length}{dataState.asOf ? ` · updated ${new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: '2-digit' }).format(new Date(dataState.asOf))}` : ''}</p>}
      {activeScenario === 'stale-data' && <p className="notice" role="status">Showing last-good data · updated 24 hours ago</p>}
      {activeScenario === 'missing-data' && <p className="notice" role="status">Some model data is unavailable. Picks and scores remain available.</p>}
      {tab === 'overview' && <Overview players={appUsers} games={games} picksByUser={Object.fromEntries(appUsers.map((user) => [user.id, picksByUser[user.id]?.[poolKey] ?? []]))} history={history} pool={pool} provisional={provisional} onProvisional={setProvisional} />}
      {tab === 'games' && <section><div className="section-title"><div><h2>Make your picks</h2><p>Confidence is preset from AVG strength. Drag a row to reorder it; on touch, use its handle.</p>{pool.acceptsLatePicks && <p className="notice">Preseason rehearsal picks remain editable after kickoff.</p>}</div><span className="save-state" role="status">{message}</span></div><div className="slate-head" aria-hidden="true"><span>Kickoff</span><span>Matchup</span><span>Confidence</span></div><div className="games">{displayedGames.map((game) => { const pick = userPicks.find((item) => item.gameId === game.id); const locked = isLocked(game, new Date(), pool.acceptsLatePicks); const kickoff = new Date(game.kickoff); const moneylineHome = noVigProbabilities(game.homeMoneyline, game.awayMoneyline)?.home; const pregameHome = Number.isFinite(game.predictorHome) && Number.isFinite(moneylineHome) ? (game.predictorHome + moneylineHome) / 2 : Number.isFinite(game.predictorHome) ? game.predictorHome : moneylineHome; const liveHome = liveGame(game) && Number.isFinite(game.homeWinProbability) ? `${(game.homeWinProbability * 100).toFixed(0)}%` : null; const liveAway = liveHome ? `${((1 - game.homeWinProbability) * 100).toFixed(0)}%` : null; return <article data-testid={`game-row-${game.id}`} className={`game ${game.status} ${pick?.team ? 'picked' : ''} ${draggedGameId === game.id ? 'dragging' : ''} ${dragOverGameId === game.id ? 'drop-target' : ''}`} key={game.id} draggable={!locked && Number.isInteger(pick?.confidence)} title={locked ? 'This game is locked' : 'Drag this row to change its confidence rank'} onDragStart={(event) => { if (event.target.closest?.('.teams')) { event.preventDefault(); return } event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', game.id); setDraggedGameId(game.id) }} onDragEnd={() => { setDraggedGameId(null); setDragOverGameId(null) }} onDragOver={(event) => { if (!locked && draggedGameId && draggedGameId !== game.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragOverGameId !== game.id) setDragOverGameId(game.id) } }} onDrop={(event) => { event.preventDefault(); swapConfidence(event.dataTransfer.getData('text/plain') || draggedGameId, game.id); setDraggedGameId(null); setDragOverGameId(null) }}><div className="game-meta"><time dateTime={game.kickoff}><span>{formatCETWeekday(kickoff)}</span><strong>{formatCETTime(kickoff)}</strong></time><span className={`game-status ${liveGame(game) ? 'live-status' : ''}`}>{locked ? 'locked' : gameStateLabel(game)}{liveDetail(game) && <small>{liveDetail(game)}</small>}</span>{game.gotw && <strong className="gotw">GOTW +5</strong>}</div><fieldset disabled={locked}><legend className="sr-only">{game.away} @ {game.home}</legend><div className="teams"><label className={pick?.team === game.away ? 'selected' : ''}><input type="radio" name={`${userId}-${game.id}`} checked={pick?.team === game.away} onChange={() => updatePick(game.id, { team: game.away })} /><TeamLogo team={game.away} /><span>{game.away}</span><b title={liveAway ? 'ESPN real-time win probability' : 'Pregame win probability'}>{liveAway ?? (game.status === 'scheduled' && Number.isFinite(pregameHome) ? `${((1 - pregameHome) * 100).toFixed(0)}%` : game.awayScore)}</b></label><span className="at">@</span><label className={pick?.team === game.home ? 'selected' : ''}><input type="radio" name={`${userId}-${game.id}`} checked={pick?.team === game.home} onChange={() => updatePick(game.id, { team: game.home })} /><TeamLogo team={game.home} /><span>{game.home}</span><b title={liveHome ? 'ESPN real-time win probability' : 'Pregame win probability'}>{liveHome ?? (game.status === 'scheduled' && Number.isFinite(pregameHome) ? `${(pregameHome * 100).toFixed(0)}%` : game.homeScore)}</b></label></div></fieldset><div className="confidence-cell"><span className="drag-handle" aria-hidden="true" data-testid={`confidence-drag-${game.id}`} data-game-id={game.id}>⠿</span><label className="confidence"><span>Rank</span><select aria-label={`${game.away} at ${game.home} confidence`} value={pick?.confidence ?? ''} onChange={(event) => updatePick(game.id, { confidence: event.target.value ? Number(event.target.value) : null })} disabled={locked}>{games.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label></div></article> })}</div></section>}
      {tab === 'standings' && <section><div className="section-title"><div><h2>{pool.phase === 'preseason' ? 'Rehearsal leaderboard' : 'Standings'}</h2>{pool.phase === 'preseason' && <p className="rehearsal">Rehearsal — does not count.</p>}</div><label><input type="checkbox" checked={provisional} onChange={(event) => setProvisional(event.target.checked)} /> Include provisional live scores</label></div><ol className="leaderboard">{board.map((player, index) => <li key={player.id}><span className="rank">{index + 1}</span><strong>{player.name}</strong><span>{player.points} pts</span><small>up to {player.points + player.potential}</small></li>)}</ol></section>}
      {tab === 'charts' && <section><div className="section-title"><div><h2>Season charts</h2><p>Preseason, regular season, and postseason results.</p></div><label className="provisional-toggle"><input type="checkbox" checked={provisional} onChange={(event) => setProvisional(event.target.checked)} /> Include provisional live scores</label></div><div className="charts">{games.length > 0 && <CurrentWeekChart current={current} />}<WeeklyPointsChart history={chartHistory} /><CumulativePointsChart history={chartHistory} /><GotwChart history={chartHistory} /></div></section>}
      {tab === 'models' && <section><div className="section-title"><div><h2>Model picks</h2><p>ESPN FPI probability and normalized no-vig moneyline, equal weighted.</p></div></div><div className="table-scroll"><table><thead><tr><th>Game</th><th>FPI</th><th>Rank</th><th>Moneyline</th><th>Rank</th><th>AVG</th><th>Rank</th><th>Home probabilities FPI / ML / AVG</th><th>Disagreement</th></tr></thead><tbody>{games.map((game) => { const fpi = predictor.find((item) => item.gameId === game.id); const ml = moneyline.find((item) => item.gameId === game.id); const pick = aggregate.find((item) => item.gameId === game.id); const disagreement = modelDisagreement(game); return <tr key={game.id}><td><span className="model-matchup"><TeamLogo team={game.away} />{game.away}<span>@</span><TeamLogo team={game.home} />{game.home}</span></td><td><ModelPick pick={fpi} /></td><td>{fpi?.confidence ?? '—'}</td><td><ModelPick pick={ml} /></td><td>{ml?.confidence ?? '—'}</td><td><ModelPick pick={pick} /></td><td>{pick?.confidence ?? '—'}</td><td>{[fpi, ml, pick].map((item) => item ? `${(item.probability * 100).toFixed(1)}%` : '—').join(' / ')}</td><td>{disagreement === null ? 'Missing inputs' : `${(disagreement * 100).toFixed(1)} pts`}</td></tr> })}</tbody></table></div></section>}
      {tab === 'admin' && isAdmin && <AdminPanel poolKey={poolKey} token={session.access_token} onPicksUpdated={(playerId, picks) => setPicks((all) => ({ ...all, [playerId]: { ...all[playerId], [poolKey]: picks } }))} onPlayerDeleted={(playerId) => { setAppUsers((all) => all.filter((player) => player.id !== playerId)); setPicks((all) => { const next = { ...all }; delete next[playerId]; return next }) }} onGamesUpdated={(updatedPoolKey, updatedGames) => { setLoadedGamesByPool((all) => ({ ...all, [updatedPoolKey]: updatedGames })); setChartData((all) => all ? { ...all, gamesByPool: { ...all.gamesByPool, [updatedPoolKey]: updatedGames } } : all) }} />}
      {tab === 'rules' && <section className="rules"><h2>Rules</h2><h3>Confidence</h3><p>Use each value from 1 through the number of games exactly once in a completed pool. Locked games keep their values.</p><h3>Scoring</h3><p>A correct pick earns its confidence. Game of the Week adds five. A final tie awards every submitted team pick full points.</p><h3>Live results</h3><p>Official scoring uses finals only. Provisional scoring uses the score leader, then live win probability when tied.</p><h3>Models</h3><p>FPI, no-vig moneyline, and their equal-weight AVG receive unique confidence ranks from least to greatest probability separation.</p></section>}
    </main><footer>{useFixtures ? 'Deterministic test scenario' : 'Browser ESPN data'} · <time dateTime={dataState.asOf ?? new Date().toISOString()}>{dataState.asOf ? `Updated ${new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: '2-digit' }).format(new Date(dataState.asOf))}` : 'Loading'}</time></footer>
  </>
}
