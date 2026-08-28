export const CENTRAL_EUROPE_TIME_ZONE = 'Europe/Berlin'

const format = (value, options) => new Intl.DateTimeFormat('en-GB', { timeZone: CENTRAL_EUROPE_TIME_ZONE, ...options }).format(new Date(value))

export const formatCETDate = (value) => format(value, { day: '2-digit', month: '2-digit' })
export const formatCETTime = (value) => format(value, { hour: '2-digit', minute: '2-digit', hour12: false })
export const formatCETWeekday = (value) => format(value, { weekday: 'short' })
export const formatCETKickoff = (value) => format(value, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
