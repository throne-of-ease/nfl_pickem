const STORAGE_KEY = 'nfl-pickem-pick-backups-v1'
const MAX_SNAPSHOTS = 30

const readStore = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  catch { return {} }
}

export function recordPickBackup(accountKey, poolKey, picks, savedAt = new Date().toISOString()) {
  try {
    const store = readStore()
    const snapshots = Array.isArray(store[accountKey]) ? store[accountKey] : []
    store[accountKey] = [{ poolKey, savedAt, picks: JSON.parse(JSON.stringify(picks)) }, ...snapshots].slice(0, MAX_SNAPSHOTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch { /* backup must never prevent a pick save */ }
}

export function readPickBackups(accountKey) {
  const snapshots = readStore()[accountKey]
  return Array.isArray(snapshots) ? snapshots : []
}

export function buildPickBackup({ accountKey, poolKey, currentPicks, players, allPicks, localRehearsal = false }) {
  return {
    format: 'nfl-pickem-picks',
    version: 1,
    exportedAt: new Date().toISOString(),
    accountKey,
    poolKey,
    currentPicks,
    players,
    ...(localRehearsal ? { picksByUser: allPicks } : { ownPicksByPool: allPicks }),
    snapshots: readPickBackups(accountKey),
  }
}

export function downloadPickBackup(payload) {
  if (typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `nfl-pickem-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
