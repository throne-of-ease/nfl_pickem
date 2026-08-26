import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameFilters } from '../GameFilters.jsx';

describe('GameFilters', () => {
  const defaultProps = {
    filter: 'all',
    onFilterChange: vi.fn(),
    round: 'all',
    onRoundChange: vi.fn(),
  };

  it('renders all filter buttons', () => {
    render(<GameFilters {...defaultProps} />);

    expect(screen.getByText('All Games')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders round dropdown with all options', () => {
    render(<GameFilters {...defaultProps} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    expect(screen.getByText('All Rounds')).toBeInTheDocument();
    expect(screen.getByText('Group Stage')).toBeInTheDocument();
    expect(screen.getByText('Knockout')).toBeInTheDocument();
    expect(screen.getByText('Medal Round')).toBeInTheDocument();
  });

  it('calls onFilterChange when filter button clicked', () => {
    const onFilterChange = vi.fn();
    render(<GameFilters {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByText('Today'));
    expect(onFilterChange).toHaveBeenCalledWith('today');

    fireEvent.click(screen.getByText('Completed'));
    expect(onFilterChange).toHaveBeenCalledWith('completed');
  });

  it('calls onRoundChange when round selection changes', () => {
    const onRoundChange = vi.fn();
    render(<GameFilters {...defaultProps} onRoundChange={onRoundChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'knockoutRound' } });

    expect(onRoundChange).toHaveBeenCalledWith('knockoutRound');
  });

  it('shows active state for current filter', () => {
    render(<GameFilters {...defaultProps} filter="completed" />);

    const completedButton = screen.getByText('Completed');
    // CSS Modules add a hash suffix to class names
    expect(completedButton.className).toMatch(/active/i);
  });

  it('shows correct value in round dropdown', () => {
    render(<GameFilters {...defaultProps} round="medalRound" />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('medalRound');
  });
});
