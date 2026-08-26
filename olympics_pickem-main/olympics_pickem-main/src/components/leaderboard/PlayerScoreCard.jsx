import { Card } from '../common';
import styles from './PlayerScoreCard.module.css';

export function PlayerScoreCard({ player, position, showDetails = true }) {
  const getMedalClass = (pos) => {
    if (pos === 1) return styles.gold;
    if (pos === 2) return styles.silver;
    if (pos === 3) return styles.bronze;
    return '';
  };

  const formatPoints = (value) => Number(value ?? 0).toFixed(1);

  return (
    <Card className={`${styles.card} ${getMedalClass(position)}`} padding="none">
      <div className={styles.main}>
        <div className={styles.rank}>
          <span className={styles.position}>{player.rank}</span>
        </div>

        <div className={styles.info}>
          <span className={styles.name}>{player.playerName}</span>
          <span className={styles.stats}>
            {player.correctPicks}/{player.scoredGames} correct ({player.accuracy}%)
          </span>
        </div>

        <div className={styles.points}>
          <span className={styles.total}>{formatPoints(player.totalPoints)}</span>
          <span className={styles.label}>pts</span>
        </div>
      </div>

      {showDetails && (
        <div className={styles.breakdown}>
          <RoundBreakdown
            label="Group"
            data={player.roundBreakdown?.groupStage}
          />
          <RoundBreakdown
            label="Knockout"
            data={player.roundBreakdown?.knockoutRound}
          />
          <RoundBreakdown
            label="Medal"
            data={player.roundBreakdown?.medalRound}
          />
        </div>
      )}
    </Card>
  );
}

function RoundBreakdown({ label, data }) {
  if (!data || data.total === 0) {
    return (
      <div className={styles.roundItem}>
        <span className={styles.roundLabel}>{label}</span>
        <span className={styles.roundValue}>-</span>
      </div>
    );
  }

  const formatPoints = (value) => Number(value ?? 0).toFixed(1);

  return (
    <div className={styles.roundItem}>
      <span className={styles.roundLabel}>{label}</span>
      <span className={styles.roundValue}>
        {data.correct}/{data.total}
        <small> ({formatPoints(data.points)}pts)</small>
      </span>
    </div>
  );
}

export default PlayerScoreCard;
