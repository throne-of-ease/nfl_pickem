import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App.jsx'

describe('four-user application flow', () => {
  it('opens on the four-player game overview with compact logo picks', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Game overview' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /All player picks/ })).toBeInTheDocument()
    expect(screen.getAllByTestId(/overview-row-/)).toHaveLength(4)
    for (const name of ['Alex', 'Blair', 'Casey', 'Devon']) expect(screen.getByRole('columnheader', { name: new RegExp(name) })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /logo$/ })).toHaveLength(16)
    const headers = within(screen.getByRole('table', { name: /All player picks/ })).getAllByRole('columnheader')
    expect(headers[0]).toHaveTextContent('Game')
    expect(headers[1]).toHaveTextContent('Score')
    expect(headers[headers.length - 2]).toHaveTextContent('GQ')
    expect(headers[headers.length - 1]).toHaveTextContent('Dev')
  })

  it('hides every player pick before kickoff and reveals live picks as pending when provisional scoring is off', async () => {
    history.replaceState({}, '', '/?scenario=scheduled&pool=week-02')
    const { unmount } = render(<App />)
    expect(screen.getAllByLabelText('Pick hidden until kickoff')).toHaveLength(16)
    unmount()

    history.replaceState({}, '', '/?scenario=live&pool=week-02')
    render(<App />)
    expect(document.querySelectorAll('.overview-pick')).toHaveLength(4)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include provisional live scores' }))
    expect(document.querySelectorAll('.overview-pick.pending')).toHaveLength(4)
    expect(document.querySelectorAll('.overview-pick.correct, .overview-pick.incorrect')).toHaveLength(0)
  })

  it('shows tracker metrics by default, includes live clock detail, and sorts by GQ and Dev', async () => {
    const user = userEvent.setup()
    history.replaceState({}, '', '/?scenario=live&pool=week-02')
    render(<App />)
    expect(screen.getByRole('columnheader', { name: 'GQ' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Dev' })).toBeInTheDocument()
    expect(screen.getByText(/Q3 · 04:12/)).toBeInTheDocument()
    await user.click(screen.getByTestId('overview-sort-gq'))
    const rows = screen.getAllByTestId(/overview-row-/)
    expect(rows[0]).toHaveAttribute('data-testid', 'overview-row-week-02-g2')
    await user.click(screen.getByTestId('overview-sort-gq'))
    expect(screen.getAllByTestId(/overview-row-/)[0]).toHaveAttribute('data-testid', 'overview-row-week-02-g1')
    await user.click(screen.getByRole('checkbox', { name: 'Show GQ / Dev' }))
    expect(screen.queryByRole('columnheader', { name: 'GQ' })).not.toBeInTheDocument()
  })

  it('shows scheduled kickoff in Central European time in the score column', () => {
    history.replaceState({}, '', '/?scenario=scheduled&pool=preseason-03')
    render(<App />)
    const kickoff = new Date(Date.now() + 3600000)
    const expectedDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' }).format(kickoff)
    const expectedTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).format(kickoff)
    expect(screen.getAllByText(expectedDate).length).toBeGreaterThan(0)
    expect(screen.getAllByText(expectedTime).length).toBeGreaterThan(0)
  })

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

  it('adds predictor, moneyline, and aggregate picks to the overview on request', async () => {
    render(<App />)
    expect(screen.queryByRole('columnheader', { name: /FPI/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include model picks' }))
    for (const name of ['FPI', 'Moneyline', 'AVG']) expect(screen.getByRole('columnheader', { name: new RegExp(name) })).toBeInTheDocument()
    expect(document.querySelectorAll('td.model-column')).toHaveLength(12)
  })

  it('renders all four accessible charts and every display mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Pool'), 'week-02')
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Download PNG' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Share PNG' })).toHaveLength(4)
    const weekly = screen.getByLabelText('Points per week display mode')
    expect(within(weekly).getAllByRole('option')).toHaveLength(3)
    await user.selectOptions(weekly, 'correct_percentage')
    expect(screen.getByRole('img', { name: /Points per week, correct_percentage/ })).toBeInTheDocument()
    const currentWeekMode = screen.getByLabelText('Current week display mode')
    expect(within(currentWeekMode).getAllByRole('option')).toHaveLength(5)
    await user.selectOptions(currentWeekMode, 'vs_leader')
    const relativeChart = screen.getByRole('img', { name: /Current week points, vs_leader/ })
    expect([...relativeChart.querySelectorAll('rect[height]')].every((rect) => Number(rect.getAttribute('height')) >= 0)).toBe(true)
    expect(within(screen.getByLabelText('Game of the Week display mode')).getAllByRole('option')).toHaveLength(3)
  })

  it('includes rehearsal results in the season charts', async () => {
    const user = userEvent.setup()
    history.replaceState({}, '', '/?pool=preseason-01')
    render(<App />)
    expect(screen.getAllByText('Rehearsal — does not count.').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    expect(screen.getByText(/Preseason, regular season, and postseason results/)).toBeInTheDocument()
    expect(screen.getByText(/Includes preseason/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current week' })).toBeInTheDocument()
    expect(screen.getAllByText('HOF').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img')).toHaveLength(4)
  })

  it('keeps every preseason pool open for late picks', async () => {
    history.replaceState({}, '', '/?pool=preseason-01')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'My picks' }))
    expect(screen.getByText(/Preseason rehearsal picks remain editable/)).toBeInTheDocument()
    expect(screen.getAllByRole('radio').every((radio) => !radio.disabled)).toBe(true)
    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(screen.getAllByRole('radio')[0]).toBeChecked()
  })

  it('swaps occupied confidence values on unlocked games', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'My picks' }))
    fireEvent.change(screen.getByLabelText('Pool'), { target: { value: 'week-02' } })
    const selects = screen.getAllByLabelText(/confidence$/)
    expect(selects[2]).toHaveValue('3')
    expect(selects[3]).toHaveValue('4')
    fireEvent.change(selects[2], { target: { value: '4' } })
    expect(selects[2]).toHaveValue('4')
    expect(selects[3]).toHaveValue('3')
  })

  it('starts every game with a unique preset confidence', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'My picks' }))
    expect(screen.getAllByLabelText(/confidence$/).map((select) => select.value)).toEqual(['1', '2', '3', '4'])
  })

  it('shows pregame probabilities on every scheduled preseason matchup', () => {
    history.replaceState({}, '', '/?scenario=scheduled&pool=preseason-03')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'My picks' }))
    const probabilities = screen.getAllByTitle('Pregame win probability')
    expect(probabilities).toHaveLength(32)
    expect(probabilities.slice(0, 2).map((item) => item.textContent)).toEqual(['43%', '57%'])
  })

  it('reorders games by dragging anywhere on a row', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'My picks' }))
    fireEvent.change(screen.getByLabelText('Pool'), { target: { value: 'week-02' } })
    const selects = screen.getAllByLabelText(/confidence$/)
    const rows = screen.getAllByTestId(/game-row-/)
    const sourceId = rows[2].dataset.testid
    const targetId = rows[3].dataset.testid
    const target = rows[3]
    let draggedGameId = ''
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (_, value) => { draggedGameId = value },
      getData: () => draggedGameId,
    }

    fireEvent.dragStart(rows[2], { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    expect(selects[2]).toHaveValue('4')
    expect(selects[3]).toHaveValue('3')
    expect(screen.getAllByTestId(/game-row-/).map((row) => row.dataset.testid).slice(2, 4)).toEqual([targetId, sourceId])
  })

  it('registers three players and keeps their Week 3 picks isolated', async () => {
    const user = userEvent.setup()
    history.replaceState({}, '', '/?scenario=scheduled&pool=preseason-03')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Set up 3 players' }))
    await user.type(screen.getByLabelText('Player 1 name'), 'Pat')
    await user.type(screen.getByLabelText('Player 2 name'), 'Quinn')
    await user.type(screen.getByLabelText('Player 3 name'), 'Riley')
    await user.click(screen.getByRole('button', { name: 'Create players' }))
    await user.click(screen.getByRole('button', { name: 'My picks' }))

    const switcher = screen.getByLabelText('Active user')
    expect(within(switcher).getAllByRole('option').map((option) => option.textContent)).toEqual(['Pat', 'Quinn', 'Riley'])
    expect(document.querySelectorAll('.game')).toHaveLength(16)

    await user.click(screen.getByRole('radio', { name: /PIT/ }))
    await user.selectOptions(screen.getByLabelText('PIT at BUF confidence'), '16')
    await user.selectOptions(switcher, 'Quinn')
    expect(screen.getByRole('radio', { name: /PIT/ })).not.toBeChecked()
    expect(screen.getByLabelText('PIT at BUF confidence')).toHaveValue('1')
    await user.selectOptions(switcher, 'Pat')
    expect(screen.getByRole('radio', { name: /PIT/ })).toBeChecked()
    expect(screen.getByLabelText('PIT at BUF confidence')).toHaveValue('16')
  }, 10000)

  it('shows predictor, no-vig moneyline, and aggregate model picks with logos', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Models' }))
    expect(screen.getByRole('columnheader', { name: 'FPI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Moneyline' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'AVG' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /logo$/ }).length).toBeGreaterThan(8)
  })
})
