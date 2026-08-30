import React, { useEffect, useState } from 'react'
import { POOLS, gameQuality, presetConfidencePicks } from './domain.js'
import { deleteAdminOverride, deleteAdminPlayer, loadAdminData, loadAdminGotwData, loadAdminOverrideHistory, resetAdminPassword, saveAdminPicks, setGameOfWeek, setRegistrationOpen } from './api.js'
import { TeamLogo } from './overview.jsx'
import { formatCETKickoff } from './time.js'

const formatKickoff = formatCETKickoff

const temporaryPassword = () => {
  const values = new Uint32Array(12)
  globalThis.crypto.getRandomValues(values)
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return `Nfl!${values.slice(0, 1)[0] % 10}${Array.from(values.slice(1), (value) => alphabet[value % alphabet.length]).join('')}`
}

export default function AdminPanel({ poolKey, token, onPicksUpdated, onPlayerDeleted, onGamesUpdated }) {
  const [data, setData] = useState(null)
  const [gotwData, setGotwData] = useState(null)
  const [overrideHistory, setOverrideHistory] = useState([])
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
  const [resetBusyUserId, setResetBusyUserId] = useState('')
  const [resetPassword, setResetPassword] = useState(null)
  const [deleteOverrideId, setDeleteOverrideId] = useState(null)
  const [gotwSort, setGotwSort] = useState({ key: 'quality', direction: 'descending' })
  const sortGotwBy = (key) => setGotwSort((current) => ({ key, direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending' }))
  const gotwSortIndicator = (key) => gotwSort.key === key ? (gotwSort.direction === 'ascending' ? ' ▲' : ' ▼') : ''
  const gotwSortOrder = (key) => gotwSort.key === key ? gotwSort.direction === 'ascending' ? 'ascending' : 'descending' : 'none'

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
    let active = true
    loadAdminOverrideHistory(token).then((history) => { if (active) setOverrideHistory(history) }).catch(() => { if (active) setOverrideHistory([]) })
    return () => { active = false }
  }, [token])
  useEffect(() => {
    let active = true
    setGotwBusy(true)
    loadAdminGotwData(token, gotwPoolKey)
      .then((result) => { if (active) { setGotwData(result); setGotwMessage('') } })
      .catch((error) => { if (active) setGotwMessage((error.code ?? 'GOTW_LOAD_FAILED').replaceAll('_', ' ')) })
      .finally(() => { if (active) setGotwBusy(false) })
    return () => { active = false }
  }, [token, gotwPoolKey])

  const selectedGame = data?.games.find((game) => game.id === selectedGameId)
  const selectedPlayer = data?.players.find((player) => player.id === selectedUserId)
  const currentPicks = selectedUserId ? data?.picksByUser[selectedUserId] ?? [] : []
  const currentPick = currentPicks.find((pick) => pick.gameId === selectedGameId)
  const gotwGames = (gotwData?.games ?? []).filter((game) => game.poolKey === gotwPoolKey)
  const assignedGotwGameId = gotwGames.find((game) => game.gotw)?.id ?? ''
  const sortedGotwGames = [...gotwGames].sort((a, b) => {
    const aValue = gotwSort.key === 'quality' ? gameQuality(a) : gotwSort.key === 'game' ? `${a.away}@${a.home}` : gotwSort.key === 'assigned' ? Number(a.gotw) : Date.parse(a.kickoff)
    const bValue = gotwSort.key === 'quality' ? gameQuality(b) : gotwSort.key === 'game' ? `${b.away}@${b.home}` : gotwSort.key === 'assigned' ? Number(b.gotw) : Date.parse(b.kickoff)
    if (aValue == null && bValue != null) return 1
    if (aValue != null && bValue == null) return -1
    if (aValue !== bValue) return (aValue < bValue ? -1 : 1) * (gotwSort.direction === 'ascending' ? 1 : -1)
    return Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id)
  })
  const gotwOverview = POOLS.map((pool) => ({ pool, game: (gotwData?.games ?? []).find((game) => game.poolKey === pool.key && game.gotw) }))

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

  const resetPlayerPassword = async (player) => {
    if (!window.confirm(`Reset ${player.name}'s password? You will need to share the temporary password with them.`)) return
    const password = temporaryPassword()
    setResetBusyUserId(player.id)
    setResetPassword(null)
    try {
      await resetAdminPassword(token, player.id, password)
      setResetPassword({ playerId: player.id, playerName: player.name, password })
      setMessage('TEMPORARY PASSWORD READY TO SHARE')
    } catch (error) { setMessage((error.code ?? 'PASSWORD_RESET_FAILED').replaceAll('_', ' ')) }
    finally { setResetBusyUserId('') }
  }

  const copyResetPassword = async () => {
    if (!resetPassword) return
    try {
      await navigator.clipboard.writeText(resetPassword.password)
      setMessage('TEMPORARY PASSWORD COPIED')
    } catch { setMessage('COPY FAILED - SHARE THE DISPLAYED PASSWORD') }
  }

  const removeOverride = async (override) => {
    if (!window.confirm('Delete this override from the admin history?')) return
    setDeleteOverrideId(override.id)
    try {
      await deleteAdminOverride(token, override.id)
      setOverrideHistory((current) => current.filter((item) => item.id !== override.id))
      setMessage('OVERRIDE DELETED')
    } catch (error) { setMessage((error.code ?? 'OVERRIDE_DELETE_FAILED').replaceAll('_', ' ')) }
    finally { setDeleteOverrideId(null) }
  }

  const submitOverride = async (event) => {
    event.preventDefault()
    if (!selectedPlayer || !selectedGame || !team || !confidence) return
    const picks = presetConfidencePicks(data.games, currentPicks)
    const occupied = picks.find((pick) => pick.gameId !== selectedGame.id && pick.confidence === Number(confidence))
    const selectedConfidence = picks.find((pick) => pick.gameId === selectedGame.id)?.confidence
    const nextPicks = picks.map((pick) => pick.gameId === selectedGame.id ? { ...pick, team, confidence: Number(confidence) } : occupied?.gameId === pick.gameId ? { ...pick, confidence: selectedConfidence } : pick)
    setBusy(true)
    try {
      await saveAdminPicks(poolKey, token, selectedPlayer.id, nextPicks)
      setData((current) => ({ ...current, picksByUser: { ...current.picksByUser, [selectedPlayer.id]: nextPicks } }))
      onPicksUpdated(selectedPlayer.id, nextPicks)
      loadAdminOverrideHistory(token).then(setOverrideHistory).catch(() => {})
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
    <div className="admin-tabs" role="tablist" aria-label="Admin sections"><button type="button" role="tab" aria-selected={adminTab === 'players'} className={adminTab === 'players' ? 'active' : ''} onClick={() => setAdminTab('players')}>Players</button><button type="button" role="tab" aria-selected={adminTab === 'gotw'} className={adminTab === 'gotw' ? 'active' : ''} onClick={() => setAdminTab('gotw')}>Game of the Week</button><button type="button" role="tab" aria-selected={adminTab === 'gotw-overview'} className={adminTab === 'gotw-overview' ? 'active' : ''} onClick={() => setAdminTab('gotw-overview')}>GOTW overview</button><button type="button" role="tab" aria-selected={adminTab === 'overrides'} className={adminTab === 'overrides' ? 'active' : ''} onClick={() => setAdminTab('overrides')}>Pick overrides</button></div>

    {adminTab === 'players' && <>
      <div className="admin-registration"><strong>Player registration</strong><span>{data.registrationOpen === false ? 'Closed' : 'Open'}</span><button type="button" onClick={toggleRegistration} disabled={busy}>{data.registrationOpen === false ? 'Allow new registrations' : 'Stop new registrations'}</button></div>
      <div className="admin-list"><h3>Registered players</h3><table><thead><tr><th>Player</th><th>Username</th><th>Contact</th><th>Picks made / games</th><th>Action</th></tr></thead><tbody>{data.players.length ? data.players.map((player) => { const picksMade = (data.picksByUser[player.id] ?? []).filter((pick) => pick.team).length; return <tr key={player.id}><td>{player.name}</td><td>{player.username}</td><td>{player.contactEmail || '-'}</td><td data-testid={`pick-count-${player.id}`} title="Games with a team pick submitted">{picksMade} / {data.games.length}</td><td className="admin-player-actions"><button type="button" aria-label={`Reset password for ${player.name}`} onClick={() => resetPlayerPassword(player)} disabled={busy || Boolean(resetBusyUserId)}>{resetBusyUserId === player.id ? 'Resetting...' : 'Reset password'}</button><button type="button" className="danger-button" aria-label={`Delete ${player.name}`} onClick={() => removePlayer(player)} disabled={busy || Boolean(resetBusyUserId)}>Delete</button></td></tr> }) : <tr><td colSpan="5">No registered players.</td></tr>}</tbody></table>{resetPassword && <div className="password-share" role="status"><strong>Temporary password for {resetPassword.playerName}</strong><code>{resetPassword.password}</code><button type="button" onClick={copyResetPassword}>Copy temporary password</button><small>Share it privately. They can sign in with it, then choose Change password.</small></div>}</div>
    </>}

    {adminTab === 'overrides' && <section className="admin-overrides" aria-label="Pick overrides"><form className="admin-override" onSubmit={submitOverride}><h3>Override a pick - {poolKey}</h3><label>Player<select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>{data.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label>Game<select value={selectedGameId} onChange={(event) => setSelectedGameId(event.target.value)}>{data.games.map((game) => <option key={game.id} value={game.id}>{game.away}@{game.home}</option>)}</select></label><label>Pick<select value={team} onChange={(event) => setTeam(event.target.value)}>{selectedGame && <><option value={selectedGame.away}>{selectedGame.away}</option><option value={selectedGame.home}>{selectedGame.home}</option></>}</select></label><label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value)}>{data.games.map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><button type="submit" disabled={busy || !selectedPlayer || !selectedGame}>Save override</button></form><div className="admin-override-history"><h3>Override history</h3>{overrideHistory.length ? <div className="table-scroll"><table data-testid="override-history-table"><thead><tr><th>When</th><th>Player</th><th>Week</th><th>Changed by</th><th>Submitted picks</th><th>Action</th></tr></thead><tbody>{overrideHistory.map((override) => <tr key={override.id}><td><time dateTime={override.createdAt}>{formatKickoff(override.createdAt)}</time></td><td>{override.playerName || override.playerId}</td><td>{override.poolKey}</td><td>{override.adminName || 'Admin'}</td><td><details><summary>{override.picks?.length ?? 0} picks</summary><div className="override-picks">{(override.picks ?? []).map((pick) => <div key={pick.gameId}>{pick.gameId}: {pick.team || 'No team'}{pick.confidence == null ? '' : ` (#${pick.confidence})`}</div>)}</div></details></td><td><button type="button" className="danger-button" aria-label={`Delete override ${override.id}`} onClick={() => removeOverride(override)} disabled={deleteOverrideId !== null}>{deleteOverrideId === override.id ? 'Deleting...' : 'Delete'}</button></td></tr>)}</tbody></table></div> : <p className="notice">No pick overrides have been recorded.</p>}</div></section>}

    {adminTab === 'gotw' && <section className="admin-gotw" aria-label="Game of the Week assignments"><div className="section-title"><div><h3>Weekly Game of the Week</h3><p>Choose one game for each pool. The five-point bonus follows this assignment.</p></div><label>Week<select aria-label="GOTW week" value={gotwPoolKey} onChange={(event) => setGotwPoolKey(event.target.value)}>{POOLS.map((pool) => <option key={pool.key} value={pool.key}>{pool.label}</option>)}</select></label></div>{gotwBusy && !gotwGames.length ? <p className="notice" role="status">Loading games for {POOLS.find((pool) => pool.key === gotwPoolKey)?.label ?? gotwPoolKey}...</p> : gotwGames.length ? <div className="table-scroll"><table className="gotw-table"><thead><tr><th aria-sort={gotwSortOrder('game')}><button className="table-sort-button" type="button" data-testid="gotw-sort-game" onClick={() => sortGotwBy('game')}>Game{gotwSortIndicator('game')}</button></th><th aria-sort={gotwSortOrder('kickoff')}><button className="table-sort-button" type="button" data-testid="gotw-sort-kickoff" onClick={() => sortGotwBy('kickoff')}>Kickoff{gotwSortIndicator('kickoff')}</button></th><th aria-sort={gotwSortOrder('quality')}><button className="table-sort-button" type="button" data-testid="gotw-sort-quality" onClick={() => sortGotwBy('quality')}>GQ{gotwSortIndicator('quality')}</button></th><th aria-sort={gotwSortOrder('assigned')}><button className="table-sort-button" type="button" data-testid="gotw-sort-assigned" onClick={() => sortGotwBy('assigned')}>State{gotwSortIndicator('assigned')}</button></th></tr></thead><tbody>{sortedGotwGames.map((game) => <tr className={selectedGotwGameId === game.id ? 'selected' : ''} key={game.id}><td><span className="gotw-matchup"><TeamLogo team={game.away} /><strong>{game.away}</strong><span>@</span><strong>{game.home}</strong><TeamLogo team={game.home} /></span></td><td><time dateTime={game.kickoff}>{formatKickoff(game.kickoff)}</time></td><td>{gameQuality(game) == null ? '—' : gameQuality(game).toFixed(1)}</td><td className="gotw-state"><label><input type="radio" name="gotw-game" value={game.id} aria-label={`Assign ${game.away} @ ${game.home} as Game of the Week`} checked={selectedGotwGameId === game.id} disabled={gotwBusy} onChange={() => { setSelectedGotwGameId(game.id); assignGotw(game.id) }} />{game.gotw ? <b>ASSIGNED</b> : 'Assign'}</label></td></tr>)}</tbody></table></div> : <p className="notice">No games are available for this pool yet.</p>}<div className="gotw-actions"><button type="button" onClick={() => assignGotw('')} disabled={gotwBusy || !assignedGotwGameId}>Clear assignment</button></div>{gotwMessage && <p className="notice" role="status">{gotwMessage}</p>}</section>}

    {adminTab === 'gotw-overview' && <section className="admin-gotw-overview" aria-label="Game of the Week overview"><div className="section-title"><div><h3>Game of the Week overview</h3><p>One row per week for a quick view of the five-point assignments.</p></div></div><div className="table-scroll"><table data-testid="gotw-overview-table"><thead><tr><th>Week</th><th>Game of the Week</th><th>Kickoff</th><th>GQ</th><th>State</th></tr></thead><tbody>{gotwOverview.map(({ pool, game }) => <tr key={pool.key}><th scope="row">{pool.label}</th><td>{game ? <span className="gotw-matchup"><TeamLogo team={game.away} /><strong>{game.away}</strong><span>@</span><strong>{game.home}</strong><TeamLogo team={game.home} /></span> : 'Not assigned'}</td><td>{game ? <time dateTime={game.kickoff}>{formatKickoff(game.kickoff)}</time> : '—'}</td><td>{gameQuality(game) == null ? '—' : gameQuality(game).toFixed(1)}</td><td>{game ? <b>ASSIGNED</b> : '—'}</td></tr>)}</tbody></table></div></section>}

    {message && <p className="notice" role="status">{message}</p>}
  </section>
}
