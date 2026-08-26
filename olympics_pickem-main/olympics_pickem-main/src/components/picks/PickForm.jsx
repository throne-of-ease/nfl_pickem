import { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO, isPast } from 'date-fns';
import { Button, Card, CountryFlag } from '../common';
import { calculateBrierPoints, getBrierRoundBucket, getBrierBaseMultiplier } from '../../services/scoring';
import scoringConfig from '../../../config/scoring.json';
import { getFinalLabel } from '../../utils/gameStatus';
import styles from './PickForm.module.css';

export function PickForm({ game, existingPick, onSubmit, onDelete, loading }) {
  const [selectedTeam, setSelectedTeam] = useState(null); // 'team_a' or 'team_b'
  const [confidence, setConfidence] = useState(0.5);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [hasInteractedConfidence, setHasInteractedConfidence] = useState(false);
  const defaultConfidence = 0.5;

  const autoSubmitTimeoutRef = useRef(null);
  const statusTimeoutRef = useRef(null);
  const lastSubmittedRef = useRef({ selectedTeam: null, confidence: null });
  const didMountRef = useRef(false);
  const initialPickRef = useRef(false);
  const hasUserInteractedRef = useRef(false);

  const scheduledAt = parseISO(game.scheduled_at);
  const isFinal = game.status === 'final';
  const isLive = game.status === 'in_progress';
  const finalLabel = isFinal ? getFinalLabel(game) : null;
  const hasStarted = isPast(scheduledAt) || isLive || isFinal;
  const isEditing = !!existingPick;

  // Derive selected team from existing pick scores
  const getSelectedTeamFromPick = (pick) => {
    if (!pick) return null;
    const scoreA = pick.team_a_score;
    const scoreB = pick.team_b_score;
    if (scoreA > scoreB) return 'team_a';
    if (scoreB > scoreA) return 'team_b';
    // Legacy tie picks - user needs to re-select
    return null;
  };

  // Calculate points preview for both teams based on confidence
  const pointsPreview = useMemo(() => {
    const roundType = game.roundType || game.round_type || 'groupStage';
    const roundMultiplier = getBrierBaseMultiplier(getBrierRoundBucket(roundType), scoringConfig);
    const winPoints = calculateBrierPoints(true, confidence, roundMultiplier, scoringConfig);
    const losePoints = calculateBrierPoints(false, confidence, roundMultiplier, scoringConfig);
    return { winPoints, losePoints };
  }, [confidence, game]);

  const formatPoints = (value) => Number(value ?? 0).toFixed(1);

  // Initialize form with existing pick
  const scheduleSavedStatus = () => {
    setSaveStatus('saved');
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => {
      setSaveStatus('idle');
    }, 1500);
  };

  useEffect(() => {
    setHasInteractedConfidence(false);
    hasUserInteractedRef.current = false;
    initialPickRef.current = false;
  }, [game.game_id]);

  useEffect(() => {
    if (existingPick) {
      const team = getSelectedTeamFromPick(existingPick);
      const conf = existingPick.confidence ?? 0.5;
      setSelectedTeam(team);
      setConfidence(conf);
      lastSubmittedRef.current = { selectedTeam: team, confidence: conf };
      if (!hasUserInteractedRef.current) {
        initialPickRef.current = !!team;
      }
    } else {
      setSelectedTeam(null);
      setConfidence(defaultConfidence);
      lastSubmittedRef.current = { selectedTeam: null, confidence: defaultConfidence };
      if (!hasUserInteractedRef.current) {
        initialPickRef.current = false;
      }
    }
    setSaveStatus('idle');
  }, [existingPick, game.game_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedTeam) {
      setError('Please select a winner');
      return;
    }

    setSaveStatus('saving');

    // Convert team selection to scores for storage
    // These are representative scores - actual scoring uses Brier formula
    let teamAScore, teamBScore;
    if (selectedTeam === 'team_a') {
      teamAScore = 1;
      teamBScore = 0;
    } else {
      teamAScore = 0;
      teamBScore = 1;
    }

    try {
      await onSubmit(game.game_id, teamAScore, teamBScore, confidence);
      lastSubmittedRef.current = { selectedTeam, confidence };
      scheduleSavedStatus();
    } catch (err) {
      setSaveStatus('idle');
      setError(err.message || 'Failed to save pick');
    }
  };

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (hasStarted || !selectedTeam || loading) return;

    const currentConfidence = Number(confidence ?? 0.5);
    const lastSubmitted = lastSubmittedRef.current;
    if (
      lastSubmitted.selectedTeam === selectedTeam &&
      Number(lastSubmitted.confidence ?? 0.5) === currentConfidence
    ) {
      return;
    }

    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
    }

    autoSubmitTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      setError(null);

      let teamAScore;
      let teamBScore;
      if (selectedTeam === 'team_a') {
        teamAScore = 1;
        teamBScore = 0;
      } else {
        teamAScore = 0;
        teamBScore = 1;
      }

      try {
        await onSubmit(game.game_id, teamAScore, teamBScore, currentConfidence);
        lastSubmittedRef.current = { selectedTeam, confidence: currentConfidence };
        scheduleSavedStatus();
      } catch (err) {
        setSaveStatus('idle');
        setError(err.message || 'Failed to save pick');
      }
    }, 300);

    return () => {
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
      }
    };
  }, [selectedTeam, confidence, hasStarted, loading, onSubmit, game.game_id]);

  useEffect(() => {
    return () => {
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
      }
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handleDelete = async () => {
    if (!window.confirm('Remove your prediction for this game?')) return;

    try {
      await onDelete(game.game_id);
      setSelectedTeam(null);
      setConfidence(defaultConfidence);
    } catch (err) {
      setError(err.message || 'Failed to delete pick');
    }
  };

  const getTeamDisplayName = (teamKey) => {
    const team = teamKey === 'team_a' ? game.team_a : game.team_b;
    return team?.name || team?.abbreviation || 'TBD';
  };

  if (hasStarted) {
    const showScore = (isLive || isFinal) && game.score_a !== null && game.score_a !== undefined
      && game.score_b !== null && game.score_b !== undefined;
    const teamAName = getTeamDisplayName('team_a');
    const teamBName = getTeamDisplayName('team_b');
    const winnerA = isFinal && game.result === 'win_a';
    const winnerB = isFinal && game.result === 'win_b';

    return (
      <Card className={styles.card}>
        <div className={styles.locked}>
          <div className={styles.lockedHeader}>
            <span className={styles.lockIcon}>🔒</span>
            <span className={styles.lockedLabel}>Locked</span>
            <span className={`${styles.lockedStatus} ${isLive ? styles.lockedLive : isFinal ? styles.lockedFinal : ''}`}>
              {isLive ? 'LIVE' : isFinal ? (finalLabel || 'FINAL') : 'STARTED'}
            </span>
          </div>
          <div className={styles.lockedMatchup}>
            <div className={`${styles.lockedTeam} ${winnerA ? styles.lockedWinner : ''}`}>
              {game.team_a ? <CountryFlag team={game.team_a} size="small" /> : null}
              <span>{teamAName}</span>
            </div>
            <div className={styles.lockedScore}>
              {showScore ? `${game.score_a}-${game.score_b}` : 'vs'}
            </div>
            <div className={`${styles.lockedTeam} ${winnerB ? styles.lockedWinner : ''}`}>
              {game.team_b ? <CountryFlag team={game.team_b} size="small" /> : null}
              <span>{teamBName}</span>
            </div>
          </div>
        </div>
        {existingPick ? (
          <div className={styles.submittedPick}>
            <div className={styles.submittedTeam}>
              Your pick:{' '}
              {getSelectedTeamFromPick(existingPick)
                ? getTeamDisplayName(getSelectedTeamFromPick(existingPick))
                : 'Not set'}
            </div>
            <div className={styles.submittedConfidence}>
              Confidence: {Math.round((existingPick.confidence ?? 0.5) * 100)}%
            </div>
          </div>
        ) : (
          <div className={styles.submittedPick}>
            <div className={styles.submittedTeam}>No pick submitted</div>
          </div>
        )}
      </Card>
    );
  }

  const hasConfidenceSatisfied = hasInteractedConfidence || (initialPickRef.current && selectedTeam);
  const isDefaultConfidence = Math.abs((confidence ?? defaultConfidence) - defaultConfidence) < 0.0001;
  const helperText = selectedTeam && hasConfidenceSatisfied && isDefaultConfidence
    ? 'Pick saved but confidence=50%'
    : selectedTeam && hasConfidenceSatisfied
    ? 'Pick saved'
    : !selectedTeam && !hasConfidenceSatisfied
    ? 'Pick a team and confidence'
    : !selectedTeam
    ? 'Pick a team'
    : !hasConfidenceSatisfied
    ? 'Pick confidence'
    : '';

  return (
    <Card className={styles.card}>
      <div className={styles.iconCluster}>
        {helperText && (
          <span className={styles.savedGroup} aria-label="Pick saved">
            {selectedTeam && hasConfidenceSatisfied && (
              <span className={styles.savedIcon} aria-hidden="true">
                <svg viewBox="0 0 16 16">
                  <path d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 5-5L12.6 5z" />
                </svg>
              </span>
            )}
            <span className={styles.savedLabel}>{helperText}</span>
          </span>
        )}
        {isEditing && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleDelete}
            disabled={loading}
            aria-label="Remove pick"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.2 4.2 8 8m0 0 3.8 3.8M8 8 11.8 4.2M8 8 4.2 11.8" />
            </svg>
          </button>
        )}
      </div>
      <div className={styles.time}>
        {format(scheduledAt, 'EEE, MMM d')} at {format(scheduledAt, 'h:mm a')}
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.teamSelection}>
          <div className={styles.pointsHint}>
            <span className={styles.winPoints}>+{formatPoints(pointsPreview.winPoints)}</span>
            <span className={styles.losePoints}>{formatPoints(pointsPreview.losePoints)}</span>
          </div>

          <button
            type="button"
            className={`${styles.teamButton} ${selectedTeam === 'team_a' ? styles.selected : ''}`}
            onClick={() => {
              hasUserInteractedRef.current = true;
              setSelectedTeam('team_a');
            }}
          >
            <CountryFlag team={game.team_a} size="medium" />
            <span className={styles.teamButtonName}>{game.team_a?.abbreviation || game.team_a?.name || 'A'}</span>
          </button>

          <span className={styles.vs}>vs</span>

          <button
            type="button"
            className={`${styles.teamButton} ${selectedTeam === 'team_b' ? styles.selected : ''}`}
            onClick={() => {
              hasUserInteractedRef.current = true;
              setSelectedTeam('team_b');
            }}
          >
            <CountryFlag team={game.team_b} size="medium" />
            <span className={styles.teamButtonName}>{game.team_b?.abbreviation || game.team_b?.name || 'B'}</span>
          </button>

          <div className={styles.pointsHint}>
            <span className={styles.winPoints}>+{formatPoints(pointsPreview.winPoints)}</span>
            <span className={styles.losePoints}>{formatPoints(pointsPreview.losePoints)}</span>
          </div>
        </div>

        <div className={styles.confidenceSection}>
          <label className={styles.confidenceLabel}>
            Confidence: {Math.round(confidence * 100)}%
          </label>
          <input
            type="range"
            min="0.5"
            max="1.0"
            step="0.01"
            value={confidence}
            onChange={(e) => {
              hasUserInteractedRef.current = true;
              setHasInteractedConfidence(true);
              setConfidence(parseFloat(e.target.value));
            }}
            className={styles.slider}
          />
          <div className={styles.sliderLabels}>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <div className={styles.actions} />
      </form>
    </Card>
  );
}

export default PickForm;
