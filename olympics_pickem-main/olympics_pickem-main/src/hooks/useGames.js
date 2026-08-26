import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { parseISO, isBefore, isAfter, isToday } from 'date-fns';

export function useGames() {
  const { games, loading, error, fetchGames } = useApp();

  const categorizedGames = useMemo(() => {
    const now = new Date();

    const completed = [];
    const inProgress = [];
    const upcoming = [];
    const today = [];

    for (const game of games) {
      const scheduledAt = parseISO(game.scheduled_at);

      if (game.status === 'final') {
        completed.push(game);
      } else if (game.status === 'in_progress') {
        inProgress.push(game);
      } else if (isToday(scheduledAt)) {
        today.push(game);
        upcoming.push(game);
      } else if (isAfter(scheduledAt, now)) {
        upcoming.push(game);
      } else {
        // Past but not final (shouldn't happen normally)
        completed.push(game);
      }
    }

    return {
      all: games,
      completed,
      inProgress,
      upcoming,
      today,
    };
  }, [games]);

  const gamesByRound = useMemo(() => {
    const rounds = {
      groupStage: [],
      knockoutRound: [],
      medalRound: [],
    };

    for (const game of games) {
      const roundType = game.round_type || 'groupStage';
      if (rounds[roundType]) {
        rounds[roundType].push(game);
      }
    }

    return rounds;
  }, [games]);

  const gameById = useMemo(() => {
    return new Map(games.map(g => [g.id, g]));
  }, [games]);

  return {
    games,
    categorizedGames,
    gamesByRound,
    gameById,
    loading: loading.games,
    error: error.games,
    refresh: fetchGames,
  };
}

export default useGames;
