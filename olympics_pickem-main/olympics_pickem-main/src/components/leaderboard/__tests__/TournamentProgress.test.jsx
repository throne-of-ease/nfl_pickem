import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TournamentProgress } from '../TournamentProgress.jsx';

describe('TournamentProgress', () => {
  const baseProgress = {
    totalGames: 20,
    completedGames: 10,
    inProgressGames: 2,
    percentComplete: 50,
  };

  it('renders null when progress is null', () => {
    const { container } = render(<TournamentProgress progress={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when progress is undefined', () => {
    const { container } = render(<TournamentProgress progress={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title', () => {
    render(<TournamentProgress progress={baseProgress} />);
    expect(screen.getByText('Tournament Progress')).toBeInTheDocument();
  });

  it('renders completed games count', () => {
    render(<TournamentProgress progress={baseProgress} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders live games count when there are games in progress', () => {
    render(<TournamentProgress progress={baseProgress} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('does not render live count when no games in progress', () => {
    const noLiveProgress = { ...baseProgress, inProgressGames: 0 };
    render(<TournamentProgress progress={noLiveProgress} />);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('renders remaining games count', () => {
    render(<TournamentProgress progress={baseProgress} />);
    // 20 total - 10 completed - 2 in progress = 8 remaining
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
  });

  it('renders percent complete', () => {
    render(<TournamentProgress progress={baseProgress} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders progress bar with correct width', () => {
    const { container } = render(<TournamentProgress progress={baseProgress} />);
    const fill = container.querySelector('[class*="fill"]');
    expect(fill).toHaveStyle({ width: '50%' });
  });

  it('handles 0% complete', () => {
    const zeroProgress = {
      totalGames: 20,
      completedGames: 0,
      inProgressGames: 0,
      percentComplete: 0,
    };
    render(<TournamentProgress progress={zeroProgress} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('handles 100% complete', () => {
    const fullProgress = {
      totalGames: 20,
      completedGames: 20,
      inProgressGames: 0,
      percentComplete: 100,
    };
    render(<TournamentProgress progress={fullProgress} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument(); // completed
  });
});
