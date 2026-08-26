import { useMemo } from 'react';
import { useApp } from '../context/AppContext';

export function useLeaderboard() {
  const { leaderboard, tournamentProgress, loading, error, fetchLeaderboard } = useApp();

  const stats = useMemo(() => {
    if (!leaderboard.length) return null;

    const totalPoints = leaderboard.reduce((sum, p) => sum + p.totalPoints, 0);
    const totalCorrect = leaderboard.reduce((sum, p) => sum + p.correctPicks, 0);
    const avgPoints = totalPoints / leaderboard.length;
    const leader = leaderboard[0];

    return {
      totalPlayers: leaderboard.length,
      totalPoints,
      totalCorrect,
      avgPoints: avgPoints.toFixed(1),
      leader,
    };
  }, [leaderboard]);

  const playerById = useMemo(() => {
    return new Map(leaderboard.map(p => [p.playerId, p]));
  }, [leaderboard]);

  return {
    leaderboard,
    tournamentProgress,
    stats,
    playerById,
    loading: loading.leaderboard,
    error: error.leaderboard,
    refresh: fetchLeaderboard,
  };
}

export default useLeaderboard;
