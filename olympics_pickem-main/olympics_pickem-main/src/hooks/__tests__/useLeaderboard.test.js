import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLeaderboard } from '../useLeaderboard.js';

// Mock the useApp hook
vi.mock('../../context/AppContext', () => ({
  useApp: vi.fn(),
}));

import { useApp } from '../../context/AppContext';

describe('useLeaderboard', () => {
  const mockFetchLeaderboard = vi.fn();

  it('returns leaderboard from context', () => {
    const mockLeaderboard = [
      { playerId: 'p1', playerName: 'Alice', totalPoints: 10, correctPicks: 5 },
      { playerId: 'p2', playerName: 'Bob', totalPoints: 8, correctPicks: 4 },
    ];

    useApp.mockReturnValue({
      leaderboard: mockLeaderboard,
      tournamentProgress: { completedGames: 5, totalGames: 10 },
      loading: { leaderboard: false },
      error: { leaderboard: null },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.leaderboard).toEqual(mockLeaderboard);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.refresh).toBe(mockFetchLeaderboard);
  });

  it('calculates stats correctly', () => {
    const mockLeaderboard = [
      { playerId: 'p1', playerName: 'Alice', totalPoints: 10, correctPicks: 5 },
      { playerId: 'p2', playerName: 'Bob', totalPoints: 8, correctPicks: 4 },
      { playerId: 'p3', playerName: 'Charlie', totalPoints: 6, correctPicks: 3 },
    ];

    useApp.mockReturnValue({
      leaderboard: mockLeaderboard,
      tournamentProgress: null,
      loading: { leaderboard: false },
      error: { leaderboard: null },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.stats).toEqual({
      totalPlayers: 3,
      totalPoints: 24,
      totalCorrect: 12,
      avgPoints: '8.0',
      leader: mockLeaderboard[0],
    });
  });

  it('returns null stats for empty leaderboard', () => {
    useApp.mockReturnValue({
      leaderboard: [],
      tournamentProgress: null,
      loading: { leaderboard: false },
      error: { leaderboard: null },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.stats).toBeNull();
  });

  it('creates playerById map', () => {
    const mockLeaderboard = [
      { playerId: 'p1', playerName: 'Alice', totalPoints: 10, correctPicks: 5 },
      { playerId: 'p2', playerName: 'Bob', totalPoints: 8, correctPicks: 4 },
    ];

    useApp.mockReturnValue({
      leaderboard: mockLeaderboard,
      tournamentProgress: null,
      loading: { leaderboard: false },
      error: { leaderboard: null },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.playerById.get('p1')).toEqual(mockLeaderboard[0]);
    expect(result.current.playerById.get('p2')).toEqual(mockLeaderboard[1]);
    expect(result.current.playerById.get('p3')).toBeUndefined();
  });

  it('returns tournamentProgress from context', () => {
    const mockProgress = {
      completedGames: 8,
      totalGames: 20,
      inProgressGames: 2,
      percentComplete: 40,
    };

    useApp.mockReturnValue({
      leaderboard: [],
      tournamentProgress: mockProgress,
      loading: { leaderboard: false },
      error: { leaderboard: null },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.tournamentProgress).toEqual(mockProgress);
  });

  it('reflects loading state', () => {
    useApp.mockReturnValue({
      leaderboard: [],
      tournamentProgress: null,
      loading: { leaderboard: true },
      error: { leaderboard: null },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.loading).toBe(true);
  });

  it('reflects error state', () => {
    useApp.mockReturnValue({
      leaderboard: [],
      tournamentProgress: null,
      loading: { leaderboard: false },
      error: { leaderboard: 'Network error' },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.error).toBe('Network error');
  });

  it('identifies leader correctly', () => {
    const mockLeaderboard = [
      { playerId: 'p1', playerName: 'Leader', totalPoints: 15, correctPicks: 7 },
      { playerId: 'p2', playerName: 'Second', totalPoints: 10, correctPicks: 5 },
    ];

    useApp.mockReturnValue({
      leaderboard: mockLeaderboard,
      tournamentProgress: null,
      loading: { leaderboard: false },
      error: { leaderboard: null },
      fetchLeaderboard: mockFetchLeaderboard,
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.stats.leader.playerName).toBe('Leader');
    expect(result.current.stats.leader.totalPoints).toBe(15);
  });
});
