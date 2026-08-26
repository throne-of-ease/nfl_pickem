import { Card } from '../common';
import { PlayerScoreCard } from './PlayerScoreCard';
import styles from './Leaderboard.module.css';

export function Leaderboard({ leaderboard, showDetails = true }) {
  if (!leaderboard || leaderboard.length === 0) {
    return (
      <Card className={styles.empty}>
        <p>No players yet. Upload picks in the admin panel to get started.</p>
      </Card>
    );
  }

  return (
    <div className={styles.container}>
      {leaderboard.map((player, index) => (
        <PlayerScoreCard
          key={player.playerId}
          player={player}
          position={index + 1}
          showDetails={showDetails}
        />
      ))}
    </div>
  );
}

export default Leaderboard;
