import { freezePregameSnapshot } from './domain.js'

const STATUS = { pre: 'scheduled', in: 'live', post: 'final', scheduled: 'scheduled', live: 'live', final: 'final' }

export function normalizeEvent(event) {
  const id = String(event?.id ?? '')
  const kickoff = new Date(event?.kickoff ?? event?.date)
  const status = STATUS[event?.status?.type?.state ?? event?.status]
  if (!id || !status || Number.isNaN(kickoff.valueOf())) return null
  return { ...event, id, kickoff: kickoff.toISOString(), status }
}

export function ingestEspnResponse(payload, previous = [], receivedAt = new Date()) {
  if (!Array.isArray(payload?.events)) return { games: previous, freshness: 'stale', asOf: receivedAt.toISOString(), error: 'MALFORMED_RESPONSE' }
  const games = payload.events.map(normalizeEvent).filter(Boolean)
  if (!games.length) return { games: previous, freshness: 'stale', asOf: receivedAt.toISOString(), error: payload.events.length ? 'MALFORMED_RESPONSE' : 'EMPTY_RESPONSE' }
  return { games, freshness: 'fresh', asOf: receivedAt.toISOString() }
}

export function applyLiveSample(game, sample) {
  const updated = { ...game, ...sample, locked: game.locked || game.status !== 'scheduled' || sample.status !== 'scheduled' }
  return sample.status === 'live' ? freezePregameSnapshot(updated, { predictorHome: game.predictorHome ?? sample.predictorHome, homeMoneyline: game.homeMoneyline ?? sample.homeMoneyline, awayMoneyline: game.awayMoneyline ?? sample.awayMoneyline, source: game.status === 'scheduled' ? 'latest-pregame' : 'first-valid-live', capturedAt: sample.capturedAt }) : updated
}
