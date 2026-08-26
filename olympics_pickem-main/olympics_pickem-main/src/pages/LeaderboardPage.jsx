import { useLeaderboard } from '../hooks/useLeaderboard';
import { Leaderboard, TournamentProgress } from '../components/leaderboard';
import { Loading, Button } from '../components/common';
import { usePolling } from '../hooks/usePolling';
import { useApp } from '../context/AppContext';
import styles from './LeaderboardPage.module.css';

export function LeaderboardPage() {
  const { leaderboard, tournamentProgress, loading, error, refresh } = useLeaderboard();
  const { includeLiveGames, toggleIncludeLiveGames, forceRefresh } = useApp();

  // Smart polling: adjusts interval based on tournament state
  // Also pauses when browser tab is hidden
  usePolling(refresh, {
    interval: 60000,
    tournamentProgress,
    smartPolling: true,
    pauseOnHidden: true,
  });

  if (loading && leaderboard.length === 0) {
    return <Loading text="Loading leaderboard..." />;
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>Failed to load leaderboard: {error}</p>
        <Button onClick={forceRefresh}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Standings</h1>
        <div className={styles.controls}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={includeLiveGames}
              onChange={(e) => toggleIncludeLiveGames(e.target.checked)}
            />
            <span>Include live</span>
          </label>
          <Button
            variant="ghost"
            size="small"
            className={styles.refreshButton}
            onClick={forceRefresh}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <TournamentProgress progress={tournamentProgress} />

      <div className={styles.leaderboard}>
        <Leaderboard leaderboard={leaderboard} />
      </div>
    </div>
  );
}

export default LeaderboardPage;
