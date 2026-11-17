import React from 'react'
import { it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Overview } from '../src/overview.jsx'
import { POOLS } from '../src/domain.js'

it.each(['week-11', 'week-12', 'week-18', 'super-bowl'])('shows every player column for %s before anyone picks', (key) => {
  const players = [{ id: 'u1', name: 'Pat' }, { id: 'u2', name: 'Alex' }]
  render(<Overview players={players} games={[{ id: 'future', kickoff: '2099-11-20T18:00:00Z', away: 'BUF', home: 'MIA', status: 'scheduled' }]}
    picksByUser={{ u1: [], u2: [] }} history={{ users: [] }} modelHistory={{ users: [] }} pool={POOLS.find((p) => p.key === key)} provisional={false} onProvisional={() => {}} />)
  const table = screen.getByRole('table', { name: /All player picks/ })
  for (const player of players) expect(within(table).getByRole('columnheader', { name: new RegExp(player.name) })).toBeInTheDocument()
  expect(within(table).getAllByLabelText('No pick saved yet')).toHaveLength(2)
})
