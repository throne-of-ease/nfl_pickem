import { describe, expect, it } from 'vitest'
import { startsBeforeBerlinMidnight } from '../src/adminPanel.jsx'

describe('Game of the Week kickoff filter', () => {
  it('keeps European evening games and removes overnight games', () => {
    expect(startsBeforeBerlinMidnight({ kickoff: '2026-10-25T21:25:00Z' })).toBe(true)
    expect(startsBeforeBerlinMidnight({ kickoff: '2026-10-26T01:20:00Z' })).toBe(false)
  })
})
