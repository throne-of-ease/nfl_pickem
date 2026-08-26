import { validateDraft } from './domain.js'

export class DraftStore {
  #drafts = new Map()

  get(userId, poolKey, games) {
    const draft = this.#drafts.get(`${userId}:${poolKey}`) ?? { revision: 0, picks: [] }
    return { draftRevision: draft.revision, picks: games.map((game) => draft.picks.find((pick) => pick.gameId === game.id) ?? { gameId: game.id, team: null, confidence: null }) }
  }

  replace(userId, poolKey, games, expectedDraftRevision, picks, now = new Date()) {
    const key = `${userId}:${poolKey}`
    const current = this.#drafts.get(key) ?? { revision: 0, picks: [] }
    if (current.revision !== expectedDraftRevision) return { status: 409, code: 'STALE_DRAFT', draftRevision: current.revision }
    const validation = validateDraft(games, picks, { previous: current.picks, now })
    if (!validation.ok) return { status: 422, ...validation }
    const next = { revision: current.revision + 1, picks: structuredClone(picks) }
    this.#drafts.set(key, next)
    return { status: 200, draftRevision: next.revision, picks: structuredClone(next.picks) }
  }
}
