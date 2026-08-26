import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerScoreCard } from '../PlayerScoreCard.jsx';

describe('PlayerScoreCard', () => {
  const basePlayer = {
    playerId: 'p1',
    playerName: 'Alice',
    rank: 1,
    totalPoints: 15,
    correctPicks: 10,
    scoredGames: 12,
    accuracy: '83.3',
    roundBreakdown: {
      groupStage: { correct: 6, total: 8, points: 6 },
      knockoutRound: { correct: 3, total: 3, points: 6 },
      medalRound: { correct: 1, total: 1, points: 3 },
    },
  };

  it('renders player name', () => {
    render(<PlayerScoreCard player={basePlayer} position={1} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders player rank', () => {
    render(<PlayerScoreCard player={basePlayer} position={1} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders total points', () => {
    render(<PlayerScoreCard player={basePlayer} position={1} />);
    expect(screen.getByText('15.0')).toBeInTheDocument();
    expect(screen.getByText('pts')).toBeInTheDocument();
  });

  it('renders correct picks and accuracy', () => {
    render(<PlayerScoreCard player={basePlayer} position={1} />);
    expect(screen.getByText('10/12 correct (83.3%)')).toBeInTheDocument();
  });

  it('renders round breakdown when showDetails is true', () => {
    render(<PlayerScoreCard player={basePlayer} position={1} showDetails={true} />);

    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(screen.getByText('Knockout')).toBeInTheDocument();
    expect(screen.getByText('Medal')).toBeInTheDocument();
  });

  it('hides round breakdown when showDetails is false', () => {
    render(<PlayerScoreCard player={basePlayer} position={1} showDetails={false} />);

    expect(screen.queryByText('Group')).not.toBeInTheDocument();
    expect(screen.queryByText('Knockout')).not.toBeInTheDocument();
    expect(screen.queryByText('Medal')).not.toBeInTheDocument();
  });

  it('shows dash for rounds with no games', () => {
    const playerNoKnockout = {
      ...basePlayer,
      roundBreakdown: {
        ...basePlayer.roundBreakdown,
        knockoutRound: { correct: 0, total: 0, points: 0 },
      },
    };
    render(<PlayerScoreCard player={playerNoKnockout} position={1} />);

    // There should be at least one dash for the knockout round
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('applies gold class for position 1', () => {
    const { container } = render(<PlayerScoreCard player={basePlayer} position={1} />);
    // CSS Modules add a hash suffix to class names
    expect(container.firstChild.className).toMatch(/gold/i);
  });

  it('applies silver class for position 2', () => {
    const { container } = render(<PlayerScoreCard player={basePlayer} position={2} />);
    expect(container.firstChild.className).toMatch(/silver/i);
  });

  it('applies bronze class for position 3', () => {
    const { container } = render(<PlayerScoreCard player={basePlayer} position={3} />);
    expect(container.firstChild.className).toMatch(/bronze/i);
  });

  it('does not apply medal class for position 4+', () => {
    const { container } = render(<PlayerScoreCard player={basePlayer} position={4} />);
    expect(container.firstChild.className).not.toMatch(/gold/i);
    expect(container.firstChild.className).not.toMatch(/silver/i);
    expect(container.firstChild.className).not.toMatch(/bronze/i);
  });

  it('handles missing roundBreakdown', () => {
    const playerNoBreakdown = { ...basePlayer, roundBreakdown: undefined };
    render(<PlayerScoreCard player={playerNoBreakdown} position={1} />);

    // Should show dashes for all rounds
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBe(3);
  });
});
