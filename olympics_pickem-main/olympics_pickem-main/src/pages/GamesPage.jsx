import { useState, useMemo } from 'react';
import { useGames } from '../hooks/useGames';
import { useApp } from '../context/AppContext';
import { GameList, GameFilters } from '../components/game';
import { Button } from '../components/common';
import { usePolling } from '../hooks/usePolling';
import styles from './GamesPage.module.css';

export function GamesPage() {
  const { games, categorizedGames, gamesByRound, loading, error, refresh } = useGames();
  const { tournamentProgress, includeLiveGames, toggleIncludeLiveGames, forceRefresh } = useApp();
  const [filter, setFilter] = useState('all');
  const [round, setRound] = useState('all');

  // Smart polling: adjusts interval based on tournament state
  // - 1 hour before tournament starts
  // - 5 minutes during live games
  // - 1 hour between games
  // - Disabled after tournament ends
  // Also pauses when browser tab is hidden
  usePolling(refresh, {
    interval: 60000,
    tournamentProgress,
    smartPolling: true,
    pauseOnHidden: true,
  });

  const filteredGames = useMemo(() => {
    let result = games;

    // Apply status filter
    switch (filter) {
      case 'today':
        result = categorizedGames.today;
        break;
      case 'upcoming':
        result = categorizedGames.upcoming;
        break;
      case 'inProgress':
        result = categorizedGames.inProgress;
        break;
      case 'completed':
        result = categorizedGames.completed;
        break;
      default:
        result = games;
    }

    // Apply round filter
    if (round !== 'all') {
      result = result.filter(g => g.round_type === round);
    }

    return result;
  }, [games, categorizedGames, gamesByRound, filter, round]);

  if (error) {
    return (
      <div className={styles.error}>
        <p>Failed to load games: {error}</p>
        <Button onClick={forceRefresh}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Games Schedule</h1>
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

      <GameFilters
        filter={filter}
        onFilterChange={setFilter}
        round={round}
        onRoundChange={setRound}
      />

      <GameList
        games={filteredGames}
        loading={loading && games.length === 0}
        emptyMessage={getEmptyMessage(filter, round)}
      />
    </div>
  );
}

function getEmptyMessage(filter, round) {
  if (filter === 'inProgress') return 'No games currently in progress';
  if (filter === 'today') return 'No games scheduled for today';
  if (filter === 'upcoming') return 'No upcoming games';
  if (filter === 'completed') return 'No completed games yet';
  if (round !== 'all') return `No ${round} games found`;
  return 'No games found';
}

export default GamesPage;
