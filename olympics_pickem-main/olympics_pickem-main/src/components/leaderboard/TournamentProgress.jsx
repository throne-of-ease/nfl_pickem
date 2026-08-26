import { Card } from '../common';
import styles from './TournamentProgress.module.css';

export function TournamentProgress({ progress }) {
  if (!progress) return null;

  const { totalGames, completedGames, inProgressGames, percentComplete } = progress;

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>Tournament Progress</h3>

      <div className={styles.bar}>
        <div
          className={styles.fill}
          style={{ width: `${percentComplete}%` }}
        />
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.value}>{completedGames}</span>
          <span className={styles.label}>Completed</span>
        </div>
        {inProgressGames > 0 && (
          <div className={styles.stat}>
            <span className={`${styles.value} ${styles.live}`}>{inProgressGames}</span>
            <span className={styles.label}>Live</span>
          </div>
        )}
        <div className={styles.stat}>
          <span className={styles.value}>{totalGames - completedGames - inProgressGames}</span>
          <span className={styles.label}>Remaining</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.value}>{percentComplete}%</span>
          <span className={styles.label}>Complete</span>
        </div>
      </div>
    </Card>
  );
}

export default TournamentProgress;
