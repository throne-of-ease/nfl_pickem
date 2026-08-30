import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App.jsx'

describe('four-user application flow', () => {
  it('opens on the four-player game overview with compact logo picks', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Game overview' })).toBeInTheDocument()
    expect(screen.queryByText('Every revealed pick, confidence, score, and player position in one place.')).not.toBeInTheDocument()
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

  it('orders the overview by kickoff when the Score header is selected', async () => {
    history.replaceState({}, '', '/?scenario=scheduled&pool=week-02')
    const user = userEvent.setup()
    render(<App />)
    const scoreHeader = screen.getByTestId('overview-sort-score').closest('th')
    expect(scoreHeader).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByTestId('overview-sort-score'))
    expect(screen.getAllByTestId(/overview-row-/).map((row) => row.dataset.testid)).toEqual([
      'overview-row-week-02-g4', 'overview-row-week-02-g3', 'overview-row-week-02-g2', 'overview-row-week-02-g1',
    ])
    expect(scoreHeader).toHaveAttribute('aria-sort', 'descending')
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
    expect(screen.getByText(/32%.*68%/)).toBeInTheDocument()
    expect(screen.queryByText(/ESPN WP/)).not.toBeInTheDocument()
    expect(screen.getByText(/Q3 · 04:12/)).toBeInTheDocument()
    expect(document.querySelectorAll('.overview-table tr.live')).toHaveLength(1)
    expect(document.querySelectorAll('.overview-table .live-badge')).toHaveLength(1)
    const liveRow = screen.getByTestId('overview-row-week-02-g1')
    expect(liveRow.querySelector('.overview-score')).not.toHaveTextContent('LIVE')
    expect(liveRow.querySelector('.overview-game-column')).toHaveTextContent('LIVE')
    await user.click(screen.getByTestId('overview-sort-gq'))
    const rows = screen.getAllByTestId(/overview-row-/)
    expect(rows[0]).toHaveAttribute('data-testid', 'overview-row-week-02-g1')
    await user.click(screen.getByTestId('overview-sort-gq'))
    expect(screen.getAllByTestId(/overview-row-/)[0]).toHaveAttribute('data-testid', 'overview-row-week-02-g1')
    await user.click(screen.getByRole('checkbox', { name: 'Show GQ / Dev' }))
    expect(screen.queryByRole('columnheader', { name: 'GQ' })).not.toBeInTheDocument()
  })

  it('shows the latest ESPN probability beside live pick-sheet scores', async () => {
    history.replaceState({}, '', '/?scenario=live&pool=week-02')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'My picks' }))
    expect(screen.getAllByTitle('ESPN real-time win probability')).toHaveLength(2)
    expect(screen.getAllByTitle('ESPN real-time win probability').map((item) => item.textContent)).toEqual(['32%', '68%'])
    expect(document.querySelectorAll('.game.live .live-badge')).toHaveLength(1)
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
    await user.selectOptions(screen.getByLabelText('Week'), 'week-02')
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect([...document.querySelectorAll('.chart-card h3')].map((heading) => heading.textContent)).toEqual(['Points vs season leader', 'Current week', 'Points per week', 'Game of the Week'])
    const cumulative = document.querySelector('svg[aria-label="Cumulative points versus season leader"]')
    expect(cumulative).not.toBeNull()
    expect(cumulative.querySelectorAll('polyline')).toHaveLength(8)
    await user.click(screen.getByRole('button', { name: 'Hide potential' }))
    expect(cumulative.querySelectorAll('polyline')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Download chart as PNG' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Share chart as PNG' })).toHaveLength(4)
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

  it('puts compact standings first inside Charts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    expect(screen.queryByRole('button', { name: 'Standings' })).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Current standings' })).toBeInTheDocument()
    expect(screen.getAllByTestId(/standings-table/)).toHaveLength(1)
    expect(document.querySelector('.standings-card').nextElementSibling).toHaveClass('charts')
    expect(within(screen.getByRole('table', { name: 'Current standings' })).getAllByRole('row')).toHaveLength(5)
  })

  it('keeps model rankings and charts opt-in on the Charts tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    const models = screen.getByRole('checkbox', { name: 'Include model picks' })
    expect(models).not.toBeChecked()
    expect(within(screen.getByRole('table', { name: 'Current standings' })).getAllByRole('row')).toHaveLength(5)
    await user.click(models)
    expect(within(screen.getByRole('table', { name: 'Current standings' })).getAllByRole('row')).toHaveLength(8)
    expect(screen.getByRole('img', { name: 'Cumulative points versus season leader' })).toBeInTheDocument()
    expect(screen.getAllByText('FPI').length).toBeGreaterThan(0)
  })

  it('includes rehearsal results in the season charts', async () => {
    const user = userEvent.setup()
    history.replaceState({}, '', '/?pool=preseason-01')
    render(<App />)
    expect(screen.queryByText('2026 season')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Preseason 1' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Rehearsal.*does not count/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Charts' }))
    expect(screen.queryByRole('heading', { name: 'Season charts' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Preseason, regular season, and postseason results/)).not.toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Week'), { target: { value: 'week-02' } })
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
    fireEvent.change(screen.getByLabelText('Week'), { target: { value: 'week-02' } })
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
    await user.click(screen.getByRole('button', { name: 'Win probs.' }))
    expect(screen.getByRole('columnheader', { name: 'FPI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Moneyline' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'AVG' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /logo$/ }).length).toBeGreaterThan(8)
  })

  it('orders model rows by clicking every model table heading', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Win probs.' }))
    const rows = () => [...document.querySelectorAll('table tbody tr')]
    expect(rows()[0]).toHaveTextContent('DAL')
    await user.click(screen.getByTestId('models-sort-fpi'))
    expect(rows()[0]).toHaveTextContent('KC')
    await user.click(screen.getByTestId('models-sort-fpi'))
    expect(rows()[0]).toHaveTextContent('DAL')
    for (const key of ['game', 'fpi-rank', 'moneyline', 'moneyline-rank', 'avg', 'avg-rank', 'probability', 'disagreement']) {
      await user.click(screen.getByTestId(`models-sort-${key}`))
      expect(rows()).toHaveLength(4)
    }
    expect(screen.getByTestId('models-sort-disagreement').closest('th')).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByTestId('models-sort-game'))
    expect(rows()[0]).toHaveTextContent('DAL')
  })
})
