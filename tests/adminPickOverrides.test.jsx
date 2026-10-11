import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import AdminPickOverrides from '../src/adminPickOverrides.jsx'

const games = [
  { id: 'g1', away: 'PIT', home: 'BUF', kickoff: '2020-01-01T18:00:00Z', status: 'final', awayScore: 3, homeScore: 7 },
  { id: 'g2', away: 'DAL', home: 'PHI', kickoff: '2099-01-01T18:00:00Z', locked: true, status: 'scheduled' },
  { id: 'g3', away: 'KC', home: 'DEN', kickoff: '2099-01-02T18:00:00Z', status: 'scheduled' },
]
const picks = [{ gameId: 'g1', team: 'PIT', confidence: 1 }, { gameId: 'g2', team: 'DAL', confidence: 2 }, { gameId: 'g3', team: 'DEN', confidence: 3 }]
const props = { games, picks, playerId: 'p1', playerName: 'Pat', busy: false }

describe('My Picks style admin overrides', () => {
  it('never renders hidden selections or confidence, even with old backend data', () => {
    render(<AdminPickOverrides {...props} onSave={vi.fn()} />)
    const future = within(screen.getByTestId('override-game-g3'))
    expect(future.getByText('Private until kickoff')).toBeInTheDocument()
    for (const input of future.getAllByRole('radio')) { expect(input).not.toBeChecked(); expect(input).toBeDisabled() }
    expect(future.getByRole('combobox')).toHaveValue('')
    expect(future.getByRole('combobox')).toBeDisabled()
    expect(screen.getByLabelText('PIT at BUF: PIT')).toBeChecked()
  })
  it('saves only the changed locked pick and supports corrections for missing picks', async () => {
    const onSave = vi.fn().mockResolvedValue({})
    render(<AdminPickOverrides {...props} picks={[]} onSave={onSave} />)
    fireEvent.click(screen.getByLabelText('PIT at BUF: BUF'))
    fireEvent.change(screen.getByLabelText('PIT at BUF override confidence'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save override' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ gameId: 'g1', team: 'BUF', confidence: 1 }]))
  })
  it('swaps visible ranks without modifying a hidden game, and can discard', () => {
    render(<AdminPickOverrides {...props} onSave={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('PIT at BUF override confidence'), { target: { value: '2' } })
    expect(screen.getByLabelText('DAL at PHI override confidence')).toHaveValue('1')
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('PIT at BUF override confidence'), { target: { value: '3' } })
    expect(screen.getByLabelText('KC at DEN override confidence')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByLabelText('PIT at BUF override confidence')).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Save override' })).toBeDisabled()
  })
  it('isolates draft edits when switching players', () => {
    const { rerender } = render(<AdminPickOverrides {...props} onSave={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('PIT at BUF: BUF'))
    rerender(<AdminPickOverrides {...props} playerId="p2" picks={[{ gameId: 'g1', team: 'PIT', confidence: 2 }]} onSave={vi.fn()} />)
    expect(screen.getByLabelText('PIT at BUF: PIT')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save override' })).toBeDisabled()
  })
})
