import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameCard } from '../GameCard.jsx';

describe('GameCard', () => {
  const baseGame = {
    id: '1',
    scheduled_at: '2026-02-15T12:00:00Z',
    status: 'scheduled',
    round_type: 'groupStage',
    team_a: { name: 'Canada', abbreviation: 'CAN' },
    team_b: { name: 'USA', abbreviation: 'USA' },
    score_a: null,
    score_b: null,
    result: null,
    picksVisible: false,
    picks: [],
  };

  it('renders team names', () => {
    render(<GameCard game={baseGame} />);

    expect(screen.getByText('Canada')).toBeInTheDocument();
    expect(screen.getByText('USA')).toBeInTheDocument();
  });

  it('renders round type label', () => {
    render(<GameCard game={baseGame} />);
    expect(screen.getByText('Group Stage')).toBeInTheDocument();
  });

  it('renders knockout round label', () => {
    const knockoutGame = { ...baseGame, round_type: 'knockoutRound' };
    render(<GameCard game={knockoutGame} />);
    expect(screen.getByText('Knockout')).toBeInTheDocument();
  });

  it('renders medal round label', () => {
    const medalGame = { ...baseGame, round_type: 'medalRound' };
    render(<GameCard game={medalGame} />);
    expect(screen.getByText('Medal Round')).toBeInTheDocument();
  });

  it('renders VS separator', () => {
    render(<GameCard game={baseGame} />);
    expect(screen.getByText('VS')).toBeInTheDocument();
  });

  it('shows LIVE badge when game is in progress', () => {
    const liveGame = { ...baseGame, status: 'in_progress', score_a: 2, score_b: 1 };
    render(<GameCard game={liveGame} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows FINAL badge when game is complete', () => {
    const finalGame = { ...baseGame, status: 'final', score_a: 3, score_b: 2, result: 'win_a' };
    render(<GameCard game={finalGame} />);
    expect(screen.getByText('FINAL')).toBeInTheDocument();
  });

  it('shows FINAL/OT badge when game ends in overtime', () => {
    const finalGame = {
      ...baseGame,
      status: 'final',
      status_detail: 'Final/OT',
      score_a: 3,
      score_b: 2,
      result: 'win_a',
    };
    render(<GameCard game={finalGame} />);
    expect(screen.getByText('FINAL/OT')).toBeInTheDocument();
  });

  it('normalizes multi-OT to FINAL/OT', () => {
    const finalGame = {
      ...baseGame,
      status: 'final',
      status_detail: 'Final/2OT',
      score_a: 3,
      score_b: 2,
      result: 'win_a',
    };
    render(<GameCard game={finalGame} />);
    expect(screen.getByText('FINAL/OT')).toBeInTheDocument();
  });

  it('shows FINAL/SO badge when game ends in shootout', () => {
    const finalGame = {
      ...baseGame,
      status: 'final',
      status_detail: 'Final/SO',
      score_a: 3,
      score_b: 2,
      result: 'win_a',
    };
    render(<GameCard game={finalGame} />);
    expect(screen.getByText('FINAL/SO')).toBeInTheDocument();
  });

  it('shows scores when game is final', () => {
    const finalGame = { ...baseGame, status: 'final', score_a: 3, score_b: 2, result: 'win_a' };
    render(<GameCard game={finalGame} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows scores when game is in progress', () => {
    const liveGame = { ...baseGame, status: 'in_progress', score_a: 1, score_b: 0 };
    render(<GameCard game={liveGame} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows hidden picks count when picks not visible', () => {
    const gameWithHiddenPicks = {
      ...baseGame,
      picksVisible: false,
      picks: [
        { playerId: 'p1', playerName: 'Alice' },
        { playerId: 'p2', playerName: 'Bob' },
      ],
    };
    render(<GameCard game={gameWithHiddenPicks} />);

    expect(screen.getByText('2 predictions submitted')).toBeInTheDocument();
  });

  it('shows singular form for 1 hidden pick', () => {
    const gameWithOnePick = {
      ...baseGame,
      picksVisible: false,
      picks: [{ playerId: 'p1', playerName: 'Alice' }],
    };
    render(<GameCard game={gameWithOnePick} />);

    expect(screen.getByText('1 prediction submitted')).toBeInTheDocument();
  });

  it('shows predictions when visible', () => {
    const gameWithVisiblePicks = {
      ...baseGame,
      status: 'final',
      score_a: 3,
      score_b: 2,
      result: 'win_a',
      picksVisible: true,
      picks: [
        {
          playerId: 'p1',
          playerName: 'Alice',
          predictedScoreA: 3,
          predictedScoreB: 2,
          isCorrect: true,
          pointsEarned: 1,
        },
        {
          playerId: 'p2',
          playerName: 'Bob',
          predictedScoreA: 1,
          predictedScoreB: 2,
          isCorrect: false,
          pointsEarned: 0,
        },
      ],
    };
    render(<GameCard game={gameWithVisiblePicks} />);

    expect(screen.getByText('Predictions')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('3 - 2')).toBeInTheDocument();
    expect(screen.getByText('1 - 2')).toBeInTheDocument();
  });

  it('shows points earned for correct picks', () => {
    const gameWithPicks = {
      ...baseGame,
      status: 'final',
      score_a: 3,
      score_b: 2,
      result: 'win_a',
      picksVisible: true,
      picks: [
        {
          playerId: 'p1',
          playerName: 'Alice',
          predictedScoreA: 4,
          predictedScoreB: 1,
          isCorrect: true,
          pointsEarned: 1,
        },
      ],
    };
    render(<GameCard game={gameWithPicks} />);

    expect(screen.getByText('+1.0')).toBeInTheDocument();
  });

  it('shows 0 for incorrect picks', () => {
    const gameWithPicks = {
      ...baseGame,
      status: 'final',
      score_a: 3,
      score_b: 2,
      result: 'win_a',
      picksVisible: true,
      picks: [
        {
          playerId: 'p1',
          playerName: 'Alice',
          predictedScoreA: 1,
          predictedScoreB: 2,
          isCorrect: false,
          pointsEarned: 0,
        },
      ],
    };
    render(<GameCard game={gameWithPicks} />);

    expect(screen.getByText('0.0')).toBeInTheDocument();
  });

  it('handles TBD team', () => {
    const gameTBD = {
      ...baseGame,
      team_a: null,
      team_b: { name: 'USA', abbreviation: 'USA' },
    };
    render(<GameCard game={gameTBD} />);

    expect(screen.getByText('TBD')).toBeInTheDocument();
    expect(screen.getByText('USA')).toBeInTheDocument();
  });
});
