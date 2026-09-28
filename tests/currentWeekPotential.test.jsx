import React from 'react'
import { expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CurrentWeekChart, currentWeekChartData } from '../src/charts.jsx'

it.each([
  ['further loss', 3, -7],
  ['smaller deficit', 7, -3],
  ['crossing zero', 12, 2],
  ['unchanged gap', 5, -5],
  ['ending at zero', 10, 0],
])('shows potential for %s relative to the leader', (_, remaining, expected) => {
  const current = [
    { name: 'Throne of Ease', points: 20, potential: remaining, seasonTotal: 90 },
    { name: 'Hichoose', points: 25, potential: 5, seasonTotal: 100 },
  ]
  render(<CurrentWeekChart current={current} />)
  for (const mode of ['absolute', 'vs_leader', 'vs_total_leader']) {
    fireEvent.change(screen.getByLabelText('Current week display mode'), { target: { value: mode } })
    const projected = mode === 'absolute' ? 20 + remaining : expected
    expect(currentWeekChartData(current, mode).find((item) => item.name === 'Throne of Ease').potential).toBe(projected)
    const chart = screen.getByRole('img')
    const marker = chart.querySelector('[data-potential="Throne of Ease"]')
    expect(marker).not.toBeNull()
    expect(marker.querySelector('text')).toHaveTextContent(`${projected} P`)
    const line = marker.querySelector('line')
    const start = Number(line.getAttribute('y1'))
    const end = Number(line.getAttribute('y2'))
    const earned = mode === 'absolute' ? 20 : -5
    expect(Math.sign(end - start)).toBe(Math.sign(earned - projected))
    expect(end).toBeGreaterThanOrEqual(28)
    expect(end).toBeLessThanOrEqual(304)
    const bar = marker.parentElement.querySelector('rect')
    expect(Number(line.getAttribute('x1'))).toBeGreaterThan(Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')))
  }
  fireEvent.change(screen.getByLabelText('Current week display mode'), { target: { value: 'points_percentage' } })
  expect(screen.getByRole('img').querySelector('[data-potential]')).toBeNull()
})
