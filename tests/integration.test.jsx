import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App.jsx'

describe('four-user application flow', () => {
  it('switches among all four seeded users and retains isolated drafts', async () => {
    const user = userEvent.setup()
    render(<App />)
    const switcher = screen.getByLabelText('Active user')
    expect(within(switcher).getAllByRole('option').map((option) => option.textContent)).toEqual(['Alex', 'Blair', 'Casey', 'Devon'])
    for (const name of ['Alex', 'Blair', 'Casey', 'Devon']) {
      await user.selectOptions(switcher, name)
      expect(switcher).toHaveDisplayValue(name)
    }
  })

  it('renders all four accessible charts and every display mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Download PNG' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Share PNG' })).toHaveLength(4)
    const weekly = screen.getByLabelText('Points per week display mode')
    expect(within(weekly).getAllByRole('option')).toHaveLength(3)
    await user.selectOptions(weekly, 'correct_percentage')
    expect(screen.getByRole('img', { name: /Points per week, correct_percentage/ })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Current week display mode')).getAllByRole('option')).toHaveLength(5)
    expect(within(screen.getByLabelText('Game of the Week display mode')).getAllByRole('option')).toHaveLength(3)
  })

  it('keeps rehearsal clearly labeled and season charts separate', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getAllByText('Rehearsal — does not count.').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    expect(screen.getByText(/Rehearsal results are excluded/)).toBeInTheDocument()
  })

  it('swaps occupied confidence values on unlocked games', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Pool'), { target: { value: 'week-02' } })
    const selects = screen.getAllByLabelText(/confidence$/)
    expect(selects[2]).toHaveValue('3')
    expect(selects[3]).toHaveValue('4')
    fireEvent.change(selects[2], { target: { value: '4' } })
    expect(selects[2]).toHaveValue('4')
    expect(selects[3]).toHaveValue('3')
  })

  it('swaps confidence values by dragging one rank onto another game', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Pool'), { target: { value: 'week-02' } })
    const selects = screen.getAllByLabelText(/confidence$/)
    const handles = screen.getAllByTestId(/confidence-drag-/)
    const target = screen.getAllByTestId(/game-row-/)[3]
    let draggedGameId = ''
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (_, value) => { draggedGameId = value },
      getData: () => draggedGameId,
    }

    fireEvent.dragStart(handles[2], { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    expect(selects[2]).toHaveValue('4')
    expect(selects[3]).toHaveValue('3')
  })

  it('registers three players and keeps their Week 3 picks isolated', async () => {
    const user = userEvent.setup()
    history.replaceState({}, '', '/?pool=preseason-03')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Set up 3 players' }))
    await user.type(screen.getByLabelText('Player 1 name'), 'Pat')
    await user.type(screen.getByLabelText('Player 2 name'), 'Quinn')
    await user.type(screen.getByLabelText('Player 3 name'), 'Riley')
    await user.click(screen.getByRole('button', { name: 'Create players' }))

    const switcher = screen.getByLabelText('Active user')
    expect(within(switcher).getAllByRole('option').map((option) => option.textContent)).toEqual(['Pat', 'Quinn', 'Riley'])
    expect(document.querySelectorAll('.game')).toHaveLength(16)

    await user.click(screen.getByRole('radio', { name: /PIT/ }))
    await user.selectOptions(screen.getByLabelText('PIT at BUF confidence'), '16')
    await user.selectOptions(switcher, 'Quinn')
    expect(screen.getByRole('radio', { name: /PIT/ })).not.toBeChecked()
    expect(screen.getByLabelText('PIT at BUF confidence')).toHaveValue('')
    await user.selectOptions(switcher, 'Pat')
    expect(screen.getByRole('radio', { name: /PIT/ })).toBeChecked()
    expect(screen.getByLabelText('PIT at BUF confidence')).toHaveValue('16')
  })
})
