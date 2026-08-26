import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGames } from '../useGames.js';

// Mock the useApp hook
vi.mock('../../context/AppContext', () => ({
  useApp: vi.fn(),
}));

import { useApp } from '../../context/AppContext';

describe('useGames', () => {
  const mockFetchGames = vi.fn();

  it('returns games from context', () => {
    const mockGames = [
      { id: '1', name: 'Game 1', status: 'scheduled', scheduled_at: '2026-02-15T12:00:00Z' },
      { id: '2', name: 'Game 2', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
    ];

    useApp.mockReturnValue({
      games: mockGames,
      loading: { games: false },
      error: { games: null },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.games).toEqual(mockGames);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.refresh).toBe(mockFetchGames);
  });

  it('categorizes games by status', () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const futureStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const mockGames = [
      { id: '1', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
      { id: '2', status: 'in_progress', scheduled_at: `${todayStr}T12:00:00Z` },
      { id: '3', status: 'scheduled', scheduled_at: futureStr },
    ];

    useApp.mockReturnValue({
      games: mockGames,
      loading: { games: false },
      error: { games: null },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.categorizedGames.completed).toHaveLength(1);
    expect(result.current.categorizedGames.inProgress).toHaveLength(1);
    expect(result.current.categorizedGames.upcoming).toHaveLength(1);
    expect(result.current.categorizedGames.all).toHaveLength(3);
  });

  it('groups games by round type', () => {
    const mockGames = [
      { id: '1', round_type: 'groupStage', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
      { id: '2', round_type: 'groupStage', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
      { id: '3', round_type: 'knockoutRound', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
      { id: '4', round_type: 'medalRound', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
    ];

    useApp.mockReturnValue({
      games: mockGames,
      loading: { games: false },
      error: { games: null },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.gamesByRound.groupStage).toHaveLength(2);
    expect(result.current.gamesByRound.knockoutRound).toHaveLength(1);
    expect(result.current.gamesByRound.medalRound).toHaveLength(1);
  });

  it('defaults to groupStage for unknown round types', () => {
    const mockGames = [
      { id: '1', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' }, // no round_type
    ];

    useApp.mockReturnValue({
      games: mockGames,
      loading: { games: false },
      error: { games: null },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.gamesByRound.groupStage).toHaveLength(1);
  });

  it('creates gameById map', () => {
    const mockGames = [
      { id: '1', name: 'Game 1', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
      { id: '2', name: 'Game 2', status: 'final', scheduled_at: '2026-02-11T12:00:00Z' },
    ];

    useApp.mockReturnValue({
      games: mockGames,
      loading: { games: false },
      error: { games: null },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.gameById.get('1')).toEqual(mockGames[0]);
    expect(result.current.gameById.get('2')).toEqual(mockGames[1]);
    expect(result.current.gameById.get('3')).toBeUndefined();
  });

  it('handles empty games array', () => {
    useApp.mockReturnValue({
      games: [],
      loading: { games: false },
      error: { games: null },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.games).toEqual([]);
    expect(result.current.categorizedGames.all).toEqual([]);
    expect(result.current.gamesByRound.groupStage).toEqual([]);
  });

  it('reflects loading state', () => {
    useApp.mockReturnValue({
      games: [],
      loading: { games: true },
      error: { games: null },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.loading).toBe(true);
  });

  it('reflects error state', () => {
    useApp.mockReturnValue({
      games: [],
      loading: { games: false },
      error: { games: 'Failed to fetch' },
      fetchGames: mockFetchGames,
    });

    const { result } = renderHook(() => useGames());

    expect(result.current.error).toBe('Failed to fetch');
  });
});
