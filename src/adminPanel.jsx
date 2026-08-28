import React, { useEffect, useState } from 'react'
import { POOLS, presetConfidencePicks } from './domain.js'
import { deleteAdminPlayer, loadAdminData, loadAdminGotwData, saveAdminPicks, setGameOfWeek, setRegistrationOpen } from './api.js'
import { TeamLogo } from './overview.jsx'

const formatKickoff = (kickoff) => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(kickoff))

export default function AdminPanel({ poolKey, token, onPicksUpdated, onPlayerDeleted, onGamesUpdated }) {
  const [data, setData] = useState(null)
  const [gotwData, setGotwData] = useState(null)
  const [adminTab, setAdminTab] = useState('players')
  const [gotwPoolKey, setGotwPoolKey] = useState(poolKey)
  const [selectedGotwGameId, setSelectedGotwGameId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedGameId, setSelectedGameId] = useState('')
  const [team, setTeam] = useState('')
  const [confidence, setConfidence] = useState('')
  const [message, setMessage] = useState('')
  const [gotwMessage, setGotwMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [gotwBusy, setGotwBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    try {
      const result = await loadAdminData(poolKey, token)
      setData(result)
      setSelectedUserId((current) => result.players.some((player) => player.id === current) ? current : result.players[0]?.id ?? '')
      setSelectedGameId((current) => result.games.some((game) => game.id === current) ? current : result.games[0]?.id ?? '')
      setMessage('')
    } catch (error) { setMessage((error.code ?? 'ADMIN_LOAD_FAILED').replaceAll('_', ' ')) }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [poolKey, token])
  useEffect(() => {
    loadAdminGotwData(token).then(setGotwData).catch((error) => setGotwMessage((error.code ?? 'GOTW_LOAD_FAILED').replaceAll('_', ' ')))
  }, [token])

  const selectedGame = data?.games.find((game) => game.id === selectedGameId)
  const selectedPlayer = data?.players.find((player) => player.id === selectedUserId)
  const currentPicks = selectedUserId ? data?.picksByUser[selectedUserId] ?? [] : []
  const currentPick = currentPicks.find((pick) => pick.gameId === selectedGameId)
  const gotwGames = (gotwData?.games ?? []).filter((game) => game.poolKey === gotwPoolKey)
  const assignedGotwGameId = gotwGames.find((game) => game.gotw)?.id ?? ''

  useEffect(() => {
    setTeam(currentPick?.team ?? selectedGame?.away ?? '')
    setConfidence(currentPick?.confidence ?? '')
  }, [selectedUserId, selectedGameId, data])

  useEffect(() => { setSelectedGotwGameId(assignedGotwGameId) }, [gotwPoolKey, gotwData])

  const toggleRegistration = async () => {
    setBusy(true)
    try {
      const result = await setRegistrationOpen(token, data.registrationOpen === false)
      setData((current) => ({ ...current, registrationOpen: result.registrationOpen }))
      setMessage(result.registrationOpen ? 'NEW REGISTRATIONS OPEN' : 'NEW REGISTRATIONS STOPPED')
    } catch (error) { setMessage((error.code ?? 'REGISTRATION_UPDATE_FAILED').replaceAll('_', ' ')) }
    finally { setBusy(false) }
  }

  const removePlayer = async (player) => {
    if (!window.confirm(`Delete ${player.name}? This removes their account, drafts, and picks.`)) return
    setBusy(true)
    try {
      await deleteAdminPlayer(token, player.id)
      setData((current) => {
        const players = current.players.filter((item) => item.id !== player.id)
        setSelectedUserId(players[0]?.id ?? '')
        const picksByUser = { ...current.picksByUser }
        delete picksByUser[player.id]
        return { ...current, players, picksByUser }
      })
      onPlayerDeleted(player.id)
      setMessage('PLAYER DELETED')
    } catch (error) { setMessage((error.code ?? 'PLAYER_DELETE_FAILED').replaceAll('_', ' ')) }
    finally { setBusy(false) }
  }

  const submitOverride = async (event) => {
    event.preventDefault()
    if (!selectedPlayer || !selectedGame || !team || !confidence) return
    const picks = presetConfidencePicks(data.games, currentPicks)
    const occupied = picks.find((pick) => pick.gameId !== selectedGame.id && pick.confidence === Number(confidence))
    const nextPicks = picks.map((pick) => pick.gameId === selectedGame.id ? { ...pick, team, confidence: Number(confidence) } : occupied?.gameId === pick.gameId ? { ...pick, confidence: currentPick?.confidence ?? null } : pick)
    setBusy(true)
    try {
      await saveAdminPicks(poolKey, token, selectedPlayer.id, nextPicks)
      setData((current) => ({ ...current, picksByUser: { ...current.picksByUser, [selectedPlayer.id]: nextPicks } }))
      onPicksUpdated(selectedPlayer.id, nextPicks)
      setMessage('PICK OVERRIDE SAVED')
    } catch (error) { setMessage((error.code ?? 'PICK_OVERRIDE_FAILED').replaceAll('_', ' ')) }
    finally { setBusy(false) }
  }

  const assignGotw = async (gameId = selectedGotwGameId) => {
    setGotwBusy(true)
    try {
      await setGameOfWeek(token, gotwPoolKey, gameId)
      const nextGames = (gotwData?.games ?? []).map((game) => game.poolKey === gotwPoolKey ? { ...game, gotw: Boolean(gameId) && game.id === gameId } : game)
      setGotwData({ games: nextGames })
      if (gotwPoolKey === poolKey) setData((current) => ({ ...current, games: current.games.map((game) => ({ ...game, gotw: Boolean(gameId) && game.id === gameId })) }))
      onGamesUpdated(gotwPoolKey, nextGames.filter((game) => game.poolKey === gotwPoolKey))
      setGotwMessage(gameId ? 'GAME OF THE WEEK ASSIGNED' : 'GAME OF THE WEEK CLEARED')
    } catch (error) { setGotwMessage((error.code ?? 'GOTW_UPDATE_FAILED').replaceAll('_', ' ')) }
    finally { setGotwBusy(false) }
  }

  if (!data) return <section><p className="notice" role="status">Loading admin tools...</p></section>

  return <section className="admin-panel">
    <div className="section-title"><div><h2>Admin</h2><p>Manage players, set the weekly spotlight, and correct submitted picks.</p></div><button type="button" onClick={load} disabled={busy}>{busy ? 'Working...' : 'Refresh'}</button></div>
    <div className="admin-tabs" role="tablist" aria-label="Admin sections"><button type="button" role="tab" aria-selected={adminTab === 'players'} className={adminTab === 'players' ? 'active' : ''} onClick={() => setAdminTab('players')}>Players</button><button type="button" role="tab" aria-selected={adminTab === 'gotw'} className={adminTab === 'gotw' ? 'active' : ''} onClick={() => setAdminTab('gotw')}>Game of the Week</button></div>

    {adminTab === 'players' && <>
      <div className="admin-registration"><strong>Player registration</strong><span>{data.registrationOpen === false ? 'Closed' : 'Open'}</span><button type="button" onClick={toggleRegistration} disabled={busy}>{data.registrationOpen === false ? 'Allow new registrations' : 'Stop new registrations'}</button></div>
      <div className="admin-list"><h3>Registered players</h3><table><thead><tr><th>Player</th><th>Username</th><th>Contact</th><th>Action</th></tr></thead><tbody>{data.players.length ? data.players.map((player) => <tr key={player.id}><td>{player.name}</td><td>{player.username}</td><td>{player.contactEmail || '-'}</td><td><button type="button" className="danger-button" aria-label={`Delete ${player.name}`} onClick={() => removePlayer(player)} disabled={busy}>Delete</button></td></tr>) : <tr><td colSpan="4">No registered players.</td></tr>}</tbody></table></div>
      <form className="admin-override" onSubmit={submitOverride}><h3>Override a pick - {poolKey}</h3><label>Player<select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>{data.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label>Game<select value={selectedGameId} onChange={(event) => setSelectedGameId(event.target.value)}>{data.games.map((game) => <option key={game.id} value={game.id}>{game.away}@{game.home}</option>)}</select></label><label>Pick<select value={team} onChange={(event) => setTeam(event.target.value)}>{selectedGame && <><option value={selectedGame.away}>{selectedGame.away}</option><option value={selectedGame.home}>{selectedGame.home}</option></>}</select></label><label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value)}>{data.games.map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><button type="submit" disabled={busy || !selectedPlayer || !selectedGame}>Save override</button></form>
    </>}

    {adminTab === 'gotw' && <section className="admin-gotw" aria-label="Game of the Week assignments"><div className="section-title"><div><h3>Weekly Game of the Week</h3><p>Choose one game for each pool. The five-point bonus follows this assignment.</p></div><label>Week<select aria-label="GOTW week" value={gotwPoolKey} onChange={(event) => setGotwPoolKey(event.target.value)}>{POOLS.map((pool) => <option key={pool.key} value={pool.key}>{pool.label}</option>)}</select></label></div>{gotwGames.length ? <div className="gotw-games">{gotwGames.map((game) => <label className={`gotw-game ${selectedGotwGameId === game.id ? 'selected' : ''}`} key={game.id}><input type="radio" name="gotw-game" value={game.id} checked={selectedGotwGameId === game.id} onChange={() => setSelectedGotwGameId(game.id)} /><span className="gotw-matchup"><TeamLogo team={game.away} /><strong>{game.away}</strong><span>@</span><strong>{game.home}</strong><TeamLogo team={game.home} /></span><small>{game.status === 'final' || game.status === 'post' ? 'Final' : formatKickoff(game.kickoff)}</small>{game.gotw && <b>ASSIGNED</b>}</label>)}</div> : <p className="notice">No games are available for this pool yet.</p>}<div className="gotw-actions"><button type="button" onClick={() => assignGotw()} disabled={gotwBusy || !selectedGotwGameId || selectedGotwGameId === assignedGotwGameId}>Assign Game of the Week</button><button type="button" onClick={() => assignGotw('')} disabled={gotwBusy || !assignedGotwGameId}>Clear assignment</button></div>{gotwMessage && <p className="notice" role="status">{gotwMessage}</p>}</section>}

    {message && <p className="notice" role="status">{message}</p>}
  </section>
}
