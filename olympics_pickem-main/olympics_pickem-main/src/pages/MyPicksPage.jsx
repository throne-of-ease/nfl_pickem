import { useState, useEffect, useCallback, useMemo } from 'react';
import { parseISO, isPast, isFuture, compareAsc } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { picks as picksApi } from '../services/supabase';
import { PickForm } from '../components/picks';
import { Button, Loading } from '../components/common';
import styles from './MyPicksPage.module.css';

export function MyPicksPage() {
  const { user, isAuthenticated } = useAuth();
  const { games, loading: appLoading, forceRefresh } = useApp();
  const gamesLoading = appLoading.games;
  const [myPicks, setMyPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('upcoming');

  // Load user's picks
  const loadPicks = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const userPicks = await picksApi.getUserPicks(user.id);
      setMyPicks(userPicks || []);
    } catch (err) {
      console.error('Error loading picks:', err);
      setError('Failed to load your picks');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated) {
      loadPicks();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, loadPicks]);

  // Get pick for a specific game
  const getPickForGame = useCallback(
    (gameId) => myPicks.find((p) => p.game_id === gameId),
    [myPicks]
  );

  // Filter and sort games
  const filteredGames = useMemo(() => {
    if (!games) return [];

    let filtered = [...games];
    const now = new Date();

    switch (filter) {
      case 'upcoming':
        filtered = filtered.filter(
          (g) => isFuture(parseISO(g.scheduled_at)) && g.status !== 'final'
        );
        break;
      case 'picked':
        filtered = filtered.filter((g) => getPickForGame(g.game_id));
        break;
      case 'unpicked':
        filtered = filtered.filter(
          (g) => !getPickForGame(g.game_id) && isFuture(parseISO(g.scheduled_at))
        );
        break;
      case 'locked':
        filtered = filtered.filter((g) => isPast(parseISO(g.scheduled_at)));
        break;
    }

    // Sort by date
    filtered.sort((a, b) =>
      compareAsc(parseISO(a.scheduled_at), parseISO(b.scheduled_at))
    );

    return filtered;
  }, [games, filter, getPickForGame]);

  const stats = useMemo(() => {
    const upcoming = games?.filter((g) => isFuture(parseISO(g.scheduled_at))).length || 0;
    const unpicked = upcoming - myPicks.filter(p => {
      const game = games?.find(g => g.game_id === p.game_id);
      return game && isFuture(parseISO(game.scheduled_at));
    }).length;

    return { unpicked };
  }, [games, myPicks]);

  // Submit pick
  const handleSubmitPick = async (gameId, teamAScore, teamBScore, confidence) => {
    if (!user) return;

    setSaving(true);
    try {
      const game = games.find((g) => g.game_id === gameId);
      const newPick = await picksApi.upsert(
        user.id,
        gameId,
        teamAScore,
        teamBScore,
        confidence
      );

      setMyPicks((prev) => {
        const existing = prev.findIndex((p) => p.game_id === gameId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newPick;
          return updated;
        }
        return [...prev, newPick];
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete pick
  const handleDeletePick = async (gameId) => {
    if (!user) return;

    setSaving(true);
    try {
      const game = games.find((g) => g.game_id === gameId);
      await picksApi.delete(user.id, gameId);
      setMyPicks((prev) => prev.filter((p) => p.game_id !== gameId));
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.notLoggedIn}>
          <h2>Sign in to make your picks</h2>
          <p>You need to be logged in to submit predictions.</p>
          <Button onClick={() => (window.location.href = '/login')}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (loading || gamesLoading) {
    return <Loading message="Loading your picks..." />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>My Picks</h1>
        <Button
          variant="ghost"
          size="small"
          className={styles.refreshButton}
          onClick={forceRefresh}
        >
          Refresh
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {stats.unpicked > 0 && (
        <div className={styles.warning}>
          You have {stats.unpicked} upcoming game{stats.unpicked !== 1 ? 's' : ''} without predictions
        </div>
      )}

      <div className={styles.filters}>
        <Button
          variant={filter === 'upcoming' ? 'primary' : 'ghost'}
          size="small"
          onClick={() => setFilter('upcoming')}
        >
          Upcoming
        </Button>
        <Button
          variant={filter === 'unpicked' ? 'primary' : 'ghost'}
          size="small"
          onClick={() => setFilter('unpicked')}
        >
          Need Pick
        </Button>
        <Button
          variant={filter === 'picked' ? 'primary' : 'ghost'}
          size="small"
          onClick={() => setFilter('picked')}
        >
          Picked
        </Button>
        <Button
          variant={filter === 'locked' ? 'primary' : 'ghost'}
          size="small"
          onClick={() => setFilter('locked')}
        >
          Locked
        </Button>
        <Button
          variant={filter === 'all' ? 'primary' : 'ghost'}
          size="small"
          onClick={() => setFilter('all')}
        >
          All
        </Button>
      </div>

      <div className={styles.gamesList}>
        {filteredGames.length === 0 ? (
          <div className={styles.empty}>
            {filter === 'unpicked'
              ? 'All upcoming games have predictions!'
              : filter === 'picked'
              ? 'No picks submitted yet'
              : 'No games found'}
          </div>
        ) : (
          filteredGames.map((game) => (
            <PickForm
              key={game.game_id}
              game={game}
              existingPick={getPickForGame(game.game_id)}
              onSubmit={handleSubmitPick}
              onDelete={handleDeletePick}
              loading={saving}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default MyPicksPage;
