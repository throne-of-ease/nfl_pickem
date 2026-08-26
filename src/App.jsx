import React, { useEffect, useMemo, useState } from 'react'
import { POOLS, isLocked, modelDisagreement, modelPicks, scorePick, standings, validateDraft } from './domain.js'
import { gamesByPool, picksByUser as seededPicks, users } from './fixtures.js'
import { CumulativePointsChart, CurrentWeekChart, GotwChart, WeeklyPointsChart } from './charts.jsx'

const clone = (value) => JSON.parse(JSON.stringify(value))
const STORAGE_KEY = 'nfl-pickem-rehearsal-v1'

const normalizePicks = (players, existing = {}) => Object.fromEntries(players.map((player) => [player.id, Object.fromEntries(Object.entries(gamesByPool).map(([key, games]) => [key, games.map((game) => existing[player.id]?.[key]?.find((pick) => pick.gameId === game.id) ?? { gameId: game.id, team: null, confidence: null })]))]))

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.users?.length && saved.picksByUser) return { users: saved.users, picksByUser: normalizePicks(saved.users, saved.picksByUser) }
  } catch { /* ignore invalid local rehearsal data */ }
  return { users, picksByUser: normalizePicks(users, clone(seededPicks)) }
}

function buildHistory(players, picksByUser) {
  const weeks = Array.from({ length: 18 }, (_, i) => `W${i + 1}`)
  return {
    weeks,
    users: players.map((user) => {
      const weeklyScores = weeks.map((_, i) => {
        const key = `week-${String(i + 1).padStart(2, '0')}`
        const games = gamesByPool[key]
        const picks = picksByUser[user.id]?.[key] ?? []
        const scores = games.map((game) => scorePick(picks.find((pick) => pick.gameId === game.id), game, true))
        return { points: scores.reduce((sum, score) => sum + score.points, 0), correct: scores.filter((score, index) => games[index].status !== 'scheduled' && score.points > 0).length, possible: games.length * (games.length + 1) / 2 + games.filter((game) => game.gotw).length * 5, games: games.length }
      })
      const weekly = weeklyScores.map((score) => score.points)
      const gotwScores = weeks.map((_, i) => {
        const key = `week-${String(i + 1).padStart(2, '0')}`
        const game = gamesByPool[key].find((item) => item.gotw)
        const pick = picksByUser[user.id]?.[key]?.find((item) => item.gameId === game.id)
        return scorePick(pick, game, true)
      })
      return { name: user.name, weekly, correct: weeklyScores.map((score) => score.correct), possible: weeklyScores.map((score) => score.possible), gameCounts: weeklyScores.map((score) => score.games), gotw: gotwScores.reduce((sum, score) => sum + score.points, 0), gotwPossible: gotwScores.reduce((sum, score) => sum + score.points + score.potential, 0), gotwCorrect: gotwScores.filter((score) => score.points > 0).length, gotwPlayed: gotwScores.filter((_, index) => gamesByPool[`week-${String(index + 1).padStart(2, '0')}`].find((game) => game.gotw).status !== 'scheduled').length }
    }),
  }
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario')
  const enabledPools = POOLS.filter((pool) => pool.phase !== 'preseason' || import.meta.env.MODE === 'preseason' || import.meta.env.DEV)
  const [localState] = useState(loadLocalState)
  const [appUsers, setAppUsers] = useState(localState.users)
  const [poolKey, setPoolKey] = useState(scenario === 'playoff' ? 'super-bowl' : POOLS.some((pool) => pool.key === params.get('pool')) ? params.get('pool') : enabledPools[0].key)
  const [userId, setUserId] = useState(localState.users[0].id)
  const [picksByUser, setPicks] = useState(localState.picksByUser)
  const [tab, setTab] = useState('games')
  const [provisional, setProvisional] = useState(true)
  const [message, setMessage] = useState(scenario === 'validation-error' ? 'INVALID CONFIDENCE SET' : 'All changes saved')
  const [showSetup, setShowSetup] = useState(false)
  const [playerNames, setPlayerNames] = useState(['', '', ''])
  const [draggedGameId, setDraggedGameId] = useState(null)
  const [dragOverGameId, setDragOverGameId] = useState(null)
  const pool = POOLS.find((item) => item.key === poolKey)
  const baseGames = gamesByPool[poolKey] ?? gamesByPool['week-01']
  const games = baseGames.map((game, index) => scenario === 'scheduled' ? { ...game, status: 'scheduled', kickoff: new Date(Date.now() + (index + 1) * 3600000).toISOString(), awayScore: 0, homeScore: 0 } : scenario === 'live' ? { ...game, status: index === 0 ? 'live' : 'scheduled', kickoff: new Date(Date.now() + (index ? index : -1) * 3600000).toISOString() } : scenario === 'final' ? { ...game, status: 'final', kickoff: new Date(Date.now() - (index + 1) * 3600000).toISOString() } : scenario === 'missing-data' ? { ...game, predictorHome: null, homeMoneyline: null, awayMoneyline: null } : game)
  const userPicks = picksByUser[userId]?.[poolKey] ?? []
  const board = standings(appUsers, games, Object.fromEntries(appUsers.map((user) => [user.id, picksByUser[user.id]?.[poolKey] ?? []])), provisional)
  const history = useMemo(() => buildHistory(appUsers, picksByUser), [appUsers, picksByUser])
  const current = board.map(({ id, name, points, potential }) => {
    const picks = picksByUser[id]?.[poolKey] ?? []
    const scores = games.map((game) => scorePick(picks.find((pick) => pick.gameId === game.id), game, provisional))
    return { name, points, potential, correct: scores.filter((score, index) => games[index].status !== 'scheduled' && score.points > 0).length, played: games.filter((game) => game.status !== 'scheduled').length, gameCount: games.length, maximum: games.length * (games.length + 1) / 2 + games.filter((game) => game.gotw).length * 5, seasonTotal: history.users.find((item) => item.name === name).weekly.reduce((sum, value) => sum + value, 0) }
  })
  const aggregate = modelPicks(games, 'aggregate')

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ users: appUsers, picksByUser })) }, [appUsers, picksByUser])

  const registerPlayers = (event) => {
    event.preventDefault()
    const names = playerNames.map((name) => name.trim())
    if (names.some((name) => !name) || new Set(names.map((name) => name.toLocaleLowerCase())).size !== 3) { setMessage('ENTER 3 UNIQUE PLAYER NAMES'); return }
    const players = names.map((name, index) => ({ id: `local-${Date.now()}-${index + 1}`, name }))
    setAppUsers(players)
    setPicks(normalizePicks(players))
    setUserId(players[0].id)
    setShowSetup(false)
    setMessage('3 players registered · picks saved on this device')
  }

  const updatePick = (gameId, changes) => {
    const oldDraft = userPicks
    const changed = oldDraft.find((pick) => pick.gameId === gameId)
    const occupied = Number.isInteger(changes.confidence) ? oldDraft.find((pick) => pick.gameId !== gameId && pick.confidence === changes.confidence) : null
    if (occupied && isLocked(games.find((game) => game.id === occupied.gameId))) { setMessage('LOCKED VALUE CANNOT BE REUSED'); return }
    const nextDraft = oldDraft.map((pick) => pick.gameId === gameId ? { ...pick, ...changes } : occupied?.gameId === pick.gameId ? { ...pick, confidence: changed.confidence } : pick)
    const result = validateDraft(games, nextDraft, { previous: oldDraft })
    if (!result.ok) { setMessage(result.code.replaceAll('_', ' ')); return }
    setPicks((all) => ({ ...all, [userId]: { ...all[userId], [poolKey]: nextDraft } }))
    setMessage('All changes saved')
  }

  const swapConfidence = (sourceGameId, targetGameId) => {
    if (!sourceGameId || sourceGameId === targetGameId) return
    const sourcePick = userPicks.find((pick) => pick.gameId === sourceGameId)
    const sourceGame = games.find((game) => game.id === sourceGameId)
    const targetGame = games.find((game) => game.id === targetGameId)
    if (!Number.isInteger(sourcePick?.confidence) || isLocked(sourceGame) || isLocked(targetGame)) {
      setMessage('LOCKED VALUE CANNOT BE MOVED')
      return
    }
    updatePick(targetGameId, { confidence: sourcePick.confidence })
  }

  return <>
    <header><a className="brand" href="#top"><span>NFL</span> PICK/26</a><nav aria-label="Main navigation">{['games', 'standings', 'charts', 'models', 'rules'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav><button className="setup-button" type="button" aria-label="Set up 3 players" onClick={() => setShowSetup((open) => !open)}>Players</button><label className="user-switch"><span>Playing as</span><select aria-label="Active user" value={userId} onChange={(event) => setUserId(event.target.value)}>{appUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></header>
    <main id="top">
      {showSetup && <form className="player-setup" aria-label="Set up 3 players" onSubmit={registerPlayers}><div><h2>Register 3 rehearsal players</h2><p>This replaces local rehearsal players and picks on this device.</p></div>{playerNames.map((name, index) => <label key={index}>Player {index + 1}<input aria-label={`Player ${index + 1} name`} value={name} onChange={(event) => setPlayerNames((all) => all.map((item, i) => i === index ? event.target.value : item))} autoComplete="off" /></label>)}<button type="submit">Create players</button></form>}
      <section className="hero"><div><p className="eyebrow">2026 season</p><h1>{pool.label}</h1>{pool.phase === 'preseason' && <p className="rehearsal">Rehearsal — does not count.</p>}</div><label>Pool <select aria-label="Pool" value={poolKey} onChange={(event) => setPoolKey(event.target.value)}>{enabledPools.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></section>
      {poolKey === 'preseason-03' && <p className="notice" role="status">Official 2026 NFL preseason Week 3 schedule · 16 games · August 27–29</p>}
      {scenario === 'stale-data' && <p className="notice" role="status">Showing last-good data · updated 24 hours ago</p>}
      {scenario === 'missing-data' && <p className="notice" role="status">Some model data is unavailable. Picks and scores remain available.</p>}
      {tab === 'games' && <section><div className="section-title"><div><h2>Make your picks</h2><p>Pick a side. Drag a confidence rank onto another row to swap.</p></div><span className="save-state" role="status">{message}</span></div><div className="slate-head" aria-hidden="true"><span>Kickoff</span><span>Matchup</span><span>Confidence</span></div><div className="games">{games.map((game) => { const pick = userPicks.find((item) => item.gameId === game.id); const locked = isLocked(game); const kickoff = new Date(game.kickoff); return <article data-testid={`game-row-${game.id}`} className={`game ${game.status} ${pick?.team ? 'picked' : ''} ${draggedGameId === game.id ? 'dragging' : ''} ${dragOverGameId === game.id ? 'drop-target' : ''}`} key={game.id} onDragOver={(event) => { if (!locked && draggedGameId && draggedGameId !== game.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragOverGameId !== game.id) setDragOverGameId(game.id) } }} onDrop={(event) => { event.preventDefault(); swapConfidence(event.dataTransfer.getData('text/plain') || draggedGameId, game.id); setDraggedGameId(null); setDragOverGameId(null) }}><div className="game-meta"><time dateTime={game.kickoff}><span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(kickoff)}</span><strong>{new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(kickoff)}</strong></time><span className="game-status">{locked ? 'locked' : game.status}</span>{game.gotw && <strong className="gotw">GOTW +5</strong>}</div><fieldset disabled={locked}><legend className="sr-only">{game.away} at {game.home}</legend><div className="teams"><label className={pick?.team === game.away ? 'selected' : ''}><input type="radio" name={`${userId}-${game.id}`} checked={pick?.team === game.away} onChange={() => updatePick(game.id, { team: game.away })} /><span>{game.away}</span><b>{game.awayScore}</b></label><span className="at">at</span><label className={pick?.team === game.home ? 'selected' : ''}><input type="radio" name={`${userId}-${game.id}`} checked={pick?.team === game.home} onChange={() => updatePick(game.id, { team: game.home })} /><span>{game.home}</span><b>{game.homeScore}</b></label></div></fieldset><div className="confidence-cell"><span className="drag-handle" aria-hidden="true" data-testid={`confidence-drag-${game.id}`} data-game-id={game.id} draggable={!locked && Number.isInteger(pick?.confidence)} title={locked ? 'Confidence is locked' : 'Drag to another game to swap confidence'} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', game.id); setDraggedGameId(game.id) }} onDragEnd={() => { setDraggedGameId(null); setDragOverGameId(null) }}>⠿</span><label className="confidence"><span>Rank</span><select aria-label={`${game.away} at ${game.home} confidence`} value={pick?.confidence ?? ''} onChange={(event) => updatePick(game.id, { confidence: event.target.value ? Number(event.target.value) : null })} disabled={locked}><option value="">—</option>{games.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label></div></article> })}</div></section>}
      {tab === 'standings' && <section><div className="section-title"><div><h2>{pool.phase === 'preseason' ? 'Rehearsal leaderboard' : 'Standings'}</h2>{pool.phase === 'preseason' && <p className="rehearsal">Rehearsal — does not count.</p>}</div><label><input type="checkbox" checked={provisional} onChange={(event) => setProvisional(event.target.checked)} /> Include provisional live scores</label></div><ol className="leaderboard">{board.map((player, index) => <li key={player.id}><span className="rank">{index + 1}</span><strong>{player.name}</strong><span>{player.points} pts</span><small>up to {player.points + player.potential}</small></li>)}</ol></section>}
      {tab === 'charts' && <section><div className="section-title"><div><h2>Season charts</h2><p>Regular season and postseason only. Rehearsal results are excluded.</p></div></div><div className="charts"><CurrentWeekChart current={current} /><WeeklyPointsChart history={history} /><CumulativePointsChart history={history} /><GotwChart history={history} /></div></section>}
      {tab === 'models' && <section><div className="section-title"><div><h2>Model picks</h2><p>Pregame predictor and normalized no-vig moneyline, equal weighted.</p></div></div><div className="table-scroll"><table><thead><tr><th>Game</th><th>Aggregate pick</th><th>Confidence</th><th>Home probability</th><th>Disagreement</th></tr></thead><tbody>{games.map((game) => { const pick = aggregate.find((item) => item.gameId === game.id); const disagreement = modelDisagreement(game); return <tr key={game.id}><td>{game.away} at {game.home}</td><td>{pick?.team ?? 'No pick'}</td><td>{pick?.confidence ?? '—'}</td><td>{pick ? `${(pick.probability * 100).toFixed(1)}%` : 'Missing inputs'}</td><td>{disagreement === null ? 'Missing inputs' : `${(disagreement * 100).toFixed(1)} pts`}</td></tr> })}</tbody></table></div></section>}
      {tab === 'rules' && <section className="rules"><h2>Rules</h2><h3>Confidence</h3><p>Use each value from 1 through the number of games exactly once in a completed pool. Locked games keep their values.</p><h3>Scoring</h3><p>A correct pick earns its confidence. Game of the Week adds five. A final tie awards every submitted team pick full points.</p><h3>Live results</h3><p>Official scoring uses finals only. Provisional scoring uses the score leader, then live win probability when tied.</p><h3>Models</h3><p>Predictor, no-vig moneyline, and their equal-weight aggregate receive unique confidence ranks from least to greatest probability separation.</p></section>}
    </main><footer>Fixture data · <time dateTime={new Date().toISOString()}>Updated just now</time></footer>
  </>
}
