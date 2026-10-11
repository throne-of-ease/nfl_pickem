import React, { useEffect, useState } from 'react'
import { isLocked } from './domain.js'
import { TeamLogo } from './overview.jsx'
import { formatCETKickoff } from './time.js'

// Never seed ranks or teams for hidden games, even if an older API sends them.
export function visibleOverridePicks(games, picks) {
  const visible = new Set(games.filter((game) => isLocked(game)).map((game) => game.id))
  return picks.filter((pick) => visible.has(pick.gameId))
}

export default function AdminPickOverrides({ games, picks, playerId, playerName, busy, onSave }) {
  const [draft, setDraft] = useState([])
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(visibleOverridePicks(games, picks)) }, [games, picks, playerId])
  const visible = visibleOverridePicks(games, draft)
  const changes = visible.filter((pick) => {
    const old = picks.find((item) => item.gameId === pick.gameId)
    return (old?.team ?? null) !== pick.team || (old?.confidence ?? null) !== pick.confidence
  })
  const update = (game, patch) => {
    if (!isLocked(game) || busy || saving) return
    setDraft((current) => {
      const previous = current.find((pick) => pick.gameId === game.id) ?? { gameId: game.id, team: null, confidence: null }
      // A rank swap can only touch another visible, locked game.
      const occupied = patch.confidence == null ? null : visibleOverridePicks(games, current).find((pick) => pick.gameId !== game.id && pick.confidence === patch.confidence)
      const next = current.filter((pick) => pick.gameId !== game.id).map((pick) => pick.gameId === occupied?.gameId ? { ...pick, confidence: previous.confidence } : pick)
      return [...next, { ...previous, ...patch }]
    })
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!changes.length || busy || saving || !playerId) return
    setSaving(true)
    try { await onSave(changes) } finally { setSaving(false) }
  }
  return <form className="override-sheet" onSubmit={submit}>
    <div className="section-title"><div><h3>{playerName ? `${playerName}'s picks` : 'Player picks'}</h3><p>Only locked picks are revealed and editable. Upcoming picks stay private.</p></div></div>
    <p className="notice">Choose a team and confidence, then save. Reusing a locked game's confidence swaps those two ranks. A confidence used by an upcoming pick cannot be reassigned.</p>
    <div className="games" aria-label="Player pick overrides">
      {games.map((game) => {
        const locked = isLocked(game)
        const pick = locked ? visible.find((item) => item.gameId === game.id) : null
        const changed = changes.some((item) => item.gameId === game.id)
        return <div key={game.id} data-testid={`override-game-${game.id}`} className={`game override-game ${locked ? 'override-editable' : 'locked'} ${pick?.team ? 'picked' : ''} ${changed ? 'moved' : ''}`}>
          <span className="override-state" aria-label={locked ? 'Editable locked game' : 'Private upcoming game'}>{locked ? '✎' : '?'}</span>
          <div className="game-meta"><time dateTime={game.kickoff}>{formatCETKickoff(game.kickoff)}</time><span className="game-status">{locked ? (game.status === 'final' ? 'Final · editable' : 'Locked · editable') : 'Private until kickoff'}</span>{game.gotw && <strong className="gotw">GOTW +5</strong>}</div>
          <fieldset disabled={!locked || busy || saving || !playerId}><legend className="sr-only">{game.away} @ {game.home}</legend><div className="teams">{[game.away, game.home].map((team, index) => <React.Fragment key={team}>{index === 1 && <span className="at">@</span>}<label className={pick?.team === team ? 'selected' : ''}><input type="radio" aria-label={`${game.away} at ${game.home}: ${team}`} name={`override-${playerId}-${game.id}`} checked={pick?.team === team} onChange={() => update(game, { team })} /><TeamLogo team={team} /><span>{team}</span><b>{locked && game.status !== 'scheduled' ? (index === 0 ? game.awayScore : game.homeScore) : '—'}</b></label></React.Fragment>)}</div></fieldset>
          <label className="confidence"><span>Rank</span><select aria-label={`${game.away} at ${game.home} override confidence`} value={pick?.confidence ?? ''} disabled={!locked || busy || saving || !playerId} onChange={(event) => update(game, { confidence: event.target.value ? Number(event.target.value) : null })}><option value="">—</option>{games.map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
        </div>
      })}
    </div>
    {!games.length && <p className="notice">No games are available for this week.</p>}
    <div className="override-actions"><span role="status">{changes.length ? `${changes.length} unsaved change${changes.length === 1 ? '' : 's'}` : 'No unsaved changes'}</span><button type="button" disabled={!changes.length || busy || saving} onClick={() => setDraft(visibleOverridePicks(games, picks))}>Discard changes</button><button type="submit" disabled={!changes.length || busy || saving || !playerId}>{busy || saving ? 'Saving...' : 'Save override'}</button></div>
  </form>
}
