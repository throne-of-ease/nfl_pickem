import { beforeEach, describe, expect, it } from 'vitest'
import { buildPickBackup, readPickBackups, recordPickBackup } from '../src/backup.js'

describe('pick backups', () => {
  beforeEach(() => localStorage.clear())

  it('keeps recent snapshots per account and includes them in an export', () => {
    recordPickBackup('player-1', 'week-07', [{ gameId: 'g1', team: 'BUF', confidence: 1 }], '2026-09-01T10:00:00.000Z')
    recordPickBackup('player-1', 'week-07', [{ gameId: 'g1', team: 'MIA', confidence: 1 }], '2026-09-01T11:00:00.000Z')

    expect(readPickBackups('player-1')).toHaveLength(2)
    expect(readPickBackups('player-1')[0].picks[0].team).toBe('MIA')
    expect(buildPickBackup({
      accountKey: 'player-1',
      poolKey: 'week-07',
      currentPicks: readPickBackups('player-1')[0].picks,
      players: [{ id: 'player-1', name: 'Pat' }],
      allPicks: { 'week-07': readPickBackups('player-1')[0].picks },
    })).toMatchObject({ format: 'nfl-pickem-picks', version: 1, poolKey: 'week-07', snapshots: expect.any(Array) })
  })
})
