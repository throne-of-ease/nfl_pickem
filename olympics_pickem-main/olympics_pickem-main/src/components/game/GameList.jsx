import { GameCard } from './GameCard';
import { Loading } from '../common';
import styles from './GameList.module.css';

export function GameList({ games, loading, emptyMessage = 'No games found' }) {
  if (loading) {
    return <Loading text="Loading games..." />;
  }

  if (!games || games.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.list}>
      {games.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}

export default GameList;
