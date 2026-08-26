import { format, parseISO } from 'date-fns';
import { Card, CountryFlag } from '../common';
import { getFinalLabel } from '../../utils/gameStatus';
import styles from './GameCard.module.css';

const ROUND_LABELS = {
  groupStage: 'Group Stage',
  knockoutRound: 'Knockout',
  medalRound: 'Medal Round',
};

export function GameCard({ game }) {
  const scheduledAt = parseISO(game.scheduled_at);
  const isFinal = game.status === 'final';
  const isLive = game.status === 'in_progress';
  const finalLabel = isFinal ? getFinalLabel(game) : null;

  return (
    <Card className={styles.card} padding="none">
      <div className={styles.header}>
        <span className={`${styles.round} ${styles[game.round_type]}`}>
          {ROUND_LABELS[game.round_type] || 'Group Stage'}
        </span>
        <span className={styles.date}>
          {format(scheduledAt, 'EEE, MMM d')} at {format(scheduledAt, 'h:mm a')}
        </span>
        {isLive && <span className={styles.live}>LIVE</span>}
        {isFinal && <span className={styles.final}>{finalLabel || 'FINAL'}</span>}
      </div>

      <div className={styles.matchup}>
        <TeamDisplay
          team={game.team_a}
          score={game.score_a}
          isWinner={isFinal && game.result === 'win_a'}
          showScore={isFinal || isLive}
        />
        <div className={styles.vs}>VS</div>
        <TeamDisplay
          team={game.team_b}
          score={game.score_b}
          isWinner={isFinal && game.result === 'win_b'}
          showScore={isFinal || isLive}
        />
      </div>

      {game.picksVisible && game.picks?.length > 0 && (
        <div className={styles.picks}>
          <h4 className={styles.picksTitle}>Predictions</h4>
          <div className={styles.picksList}>
            {game.picks.map((pick) => (
              <PredictionRow key={pick.playerId} pick={pick} game={game} />
            ))}
          </div>
        </div>
      )}

      {!game.picksVisible && game.picks?.length > 0 && (
        <div className={styles.hidden}>
          {game.picks.length} prediction{game.picks.length !== 1 ? 's' : ''} submitted
        </div>
      )}
    </Card>
  );
}

function TeamDisplay({ team, score, isWinner, showScore }) {
  if (!team) {
    return <div className={styles.team}>TBD</div>;
  }

  return (
    <div className={`${styles.team} ${isWinner ? styles.winner : ''}`}>
      <CountryFlag team={team} size="medium" className={styles.flag} />
      <span className={styles.teamName}>{team.name}</span>
      {showScore && (
        <span className={styles.score}>{score ?? '-'}</span>
      )}
    </div>
  );
}

function PredictionRow({ pick, game }) {
  const isFinal = game.status === 'final';
  const isCorrect = pick.isCorrect;
  const isProvisional = pick.isProvisional;
  const canShowPoints = isFinal || isProvisional;
  const hasConfidence = pick.confidence !== undefined && pick.confidence !== null;

  // Format points: show + for positive, just the number for negative/zero
  const formatPoints = (points) => {
    const value = Number(points ?? 0);
    const formatted = value.toFixed(1);
    if (value > 0) return `+${formatted}`;
    return formatted;
  };

  let resultClass = '';
  if (isProvisional) {
    resultClass = isCorrect ? styles.provisionalCorrect : styles.provisionalIncorrect;
  } else if (isFinal) {
    resultClass = isCorrect ? styles.correct : styles.incorrect;
  }

  return (
    <div className={`${styles.pickRow} ${resultClass}`}>
      <span className={styles.playerName}>{pick.playerName}</span>
      <span className={styles.prediction}>
        {pick.predictedScoreA} - {pick.predictedScoreB}
        {hasConfidence && (
          <small className={styles.confidence}> ({Math.round(pick.confidence * 100)}%)</small>
        )}
      </span>
      {canShowPoints && (
        <span className={`${styles.points} ${pick.pointsEarned < 0 ? styles.negative : ''}`}>
          {formatPoints(pick.pointsEarned)}
        </span>
      )}
    </div>
  );
}

export default GameCard;
