export const CENTRAL_EUROPE_TIME_ZONE = 'Europe/Berlin'

const format = (value, options) => new Intl.DateTimeFormat('en-GB', { timeZone: CENTRAL_EUROPE_TIME_ZONE, ...options }).format(new Date(value))

export const formatCETDate = (value) => format(value, { day: '2-digit', month: '2-digit' })
export const formatCETTime = (value) => format(value, { hour: '2-digit', minute: '2-digit', hour12: false })
export const formatCETWeekday = (value) => format(value, { weekday: 'short' })
export const formatCETKickoff = (value) => format(value, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

const easternKickoff = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })

export function primeTimeCategory(kickoff) {
  if (!kickoff) return null
  const date = new Date(kickoff)
  if (!Number.isFinite(date.getTime())) return null
  const parts = Object.fromEntries(easternKickoff.formatToParts(date).map(({ type, value }) => [type, value]))
  // The requested TNF group includes all Wednesday, Thursday and Friday games,
  // including special holiday/Friday slots. Sunday afternoon games stay out.
  if (['Wed', 'Thu', 'Fri'].includes(parts.weekday)) return 'tnf'
  if (Number(parts.hour) < 18) return null
  if (parts.weekday === 'Sun') return 'snf'
  if (parts.weekday === 'Mon') return 'mnf'
  return null
}
