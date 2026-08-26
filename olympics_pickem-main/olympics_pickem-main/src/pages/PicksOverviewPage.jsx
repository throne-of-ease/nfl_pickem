import { useState, useMemo } from 'react';
import { format, parseISO, isAfter } from 'date-fns';
import { useGames } from '../hooks/useGames';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useApp } from '../context/AppContext';
import { Button, CountryFlag, Loading } from '../components/common';
import { usePolling } from '../hooks/usePolling';
import { getTeamFlagFromObject } from '../utils/countryFlags';
import { getFinalLabel } from '../utils/gameStatus';
import styles from './PicksOverviewPage.module.css';

const DESIGN_OPTIONS = [
  { id: 'compact', label: 'Table' },
  { id: 'cards', label: 'Cards' },
];

const formatPoints = (value) => Number(value ?? 0).toFixed(1);
const formatPointsWithSign = (value) => {
  const num = Number(value ?? 0);
  const formatted = num.toFixed(1);
  return num > 0 ? `+${formatted}` : formatted;
};
const formatScoreInline = (game) => {
  const scoreA = game?.score_a;
  const scoreB = game?.score_b;
  const scoreAValue = (scoreA === null || scoreA === undefined || scoreA === '') ? null : Number(scoreA);
  const scoreBValue = (scoreB === null || scoreB === undefined || scoreB === '') ? null : Number(scoreB);
  const hasScores = Number.isFinite(scoreAValue) && Number.isFinite(scoreBValue);
  return hasScores ? `${scoreAValue}-${scoreBValue}` : 'vs';
};
const formatLiveStatus = (game) => {
  const periodRaw = game?.status_period ?? game?.status?.period;
  const clock = game?.status_clock ?? game?.status?.clock;
  const detail = game?.status_detail ?? game?.status?.detail;
  const period = periodRaw !== null && periodRaw !== undefined ? Number(periodRaw) : null;
  const hasPeriod = Number.isFinite(period);
  const hasClock = typeof clock === 'string' && clock.trim() !== '';

  if (hasPeriod && hasClock) return `P${period} ${clock}`;
  if (hasPeriod) return `P${period}`;
  if (hasClock) return clock;
  if (detail) return detail;
  return 'LIVE';
};

export function PicksOverviewPage() {
  const { games, loading: gamesLoading, error: gamesError, refresh: refreshGames } = useGames();
  const { leaderboard, loading: lbLoading, error: lbError, refresh: refreshLb } = useLeaderboard();
  const { tournamentProgress, includeLiveGames, toggleIncludeLiveGames, forceRefresh } = useApp();
  const [design, setDesign] = useState(() => {
    return 'compact';
  });

  const loading = gamesLoading || lbLoading;
  const error = gamesError || lbError;

  // Smart polling: adjusts interval based on tournament state
  // Also pauses when browser tab is hidden
  usePolling(() => { refreshGames(); refreshLb(); }, {
    interval: 60000,
    tournamentProgress,
    smartPolling: true,
    pauseOnHidden: true,
  });

  // Sort players by total points (leader first)
  const sortedPlayers = useMemo(() => {
    return [...leaderboard].sort((a, b) => b.totalPoints - a.totalPoints);
  }, [leaderboard]);

  // Sort games by date (most recent/upcoming first for better UX)
  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const roundA = a.round_type || 'groupStage';
      const roundB = b.round_type || 'groupStage';
      const isPlayoffA = roundA !== 'groupStage' ? 0 : 1;
      const isPlayoffB = roundB !== 'groupStage' ? 0 : 1;
      if (isPlayoffA !== isPlayoffB) return isPlayoffA - isPlayoffB;
      const dateA = parseISO(a.scheduled_at);
      const dateB = parseISO(b.scheduled_at);
      return dateA - dateB;
    });
  }, [games]);

  const refresh = () => {
    forceRefresh();
  };

  if (error) {
    return (
      <div className={styles.error}>
        <p>Failed to load data: {error}</p>
        <Button onClick={refresh}>Try Again</Button>
      </div>
    );
  }

  if (loading && games.length === 0) {
    return <Loading />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Overview</h1>
        <div className={styles.controls}>
          <div className={styles.designToggle}>
            {DESIGN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`${styles.toggleBtn} ${design === opt.id ? styles.active : ''}`}
                onClick={() => setDesign(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            onClick={refresh}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {design === 'compact' && (
        <CompactTableView games={sortedGames} players={sortedPlayers} />
      )}
      {design === 'cards' && (
        <CardGridView games={sortedGames} players={sortedPlayers} />
      )}
    </div>
  );
}

// ============================================
// DESIGN 1: Compact Table View
// ============================================
function CompactTableView({ games, players }) {
  // Get abbreviated name (e.g., "Jirka P" -> "JP", "Honza" -> "H")
  const getInitials = (name) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.compactTable}>
        <thead>
          <tr>
            <th className={styles.gameCol}>Game</th>
            {players.map((player, idx) => (
              <th key={player.playerId} className={styles.playerCol}>
                <div className={styles.playerHeader}>
                  <span className={styles.playerName}>{player.playerName}</span>
                  <span className={styles.playerInitials}>{getInitials(player.playerName)}</span>
                  <span className={`${styles.playerPoints} ${idx === 0 ? styles.leader : ''}`}>
                    {formatPoints(player.totalPoints)}
                  </span>
                  {idx === 0 && (
                    <span className={styles.leaderLabel}>Leader</span>
                  )}
                  {idx > 0 && (
                    <span className={styles.pointsDiff}>
                      {formatPoints(player.totalPoints - players[0].totalPoints)}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.map((game) => (
            <CompactTableRow key={game.id} game={game} players={players} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactTableRow({ game, players }) {
  const scheduledAt = parseISO(game.scheduled_at);
  const statusState = typeof game.status === 'string' ? game.status : game.status?.state;
  const isFinal = statusState === 'final';
  const isLive = statusState === 'in_progress';
  const isWinnerA = isFinal && game.result === 'win_a';
  const isWinnerB = isFinal && game.result === 'win_b';
  const now = new Date();
  const gameStarted = isAfter(now, scheduledAt) || isLive || isFinal;
  const liveStatus = isLive ? formatLiveStatus(game) : null;
  const finalLabel = isFinal ? getFinalLabel(game) : null;

  const getPickForPlayer = (playerId) => {
    return game.picks?.find(p => p.playerId === playerId);
  };

  const getAbbrev = (team) => team?.abbreviation || team?.name?.slice(0, 3).toUpperCase() || '?';

  return (
    <tr className={`${styles.gameRow} ${isLive ? styles.liveRow : ''}`}>
      <td className={styles.gameCell}>
        <div className={styles.gameInfo}>
          <div className={styles.teams}>
            <TeamBadge team={game.team_a} isWinner={isWinnerA} />
            <span className={`${styles.teamAbbrev} ${isWinnerA ? styles.teamAbbrevWinner : ''}`}>
              {getAbbrev(game.team_a)}
            </span>
            <span className={styles.scoreInline}>
              {(isFinal || isLive) ? formatScoreInline(game) : 'vs'}
            </span>
            <span className={`${styles.teamAbbrev} ${isWinnerB ? styles.teamAbbrevWinner : ''}`}>
              {getAbbrev(game.team_b)}
            </span>
            <TeamBadge team={game.team_b} isWinner={isWinnerB} />
          </div>
          <div className={styles.gameTime}>
            {isLive && <span className={styles.liveBadge}>LIVE</span>}
            {isFinal && <span className={styles.finalBadge}>{finalLabel || 'FINAL'}</span>}
            {!isFinal && !isLive && (
              <span>{format(scheduledAt, 'd/M HH:mm')}</span>
            )}
            {isLive && <span className={styles.liveTime}>{liveStatus}</span>}
          </div>
        </div>
      </td>
      {players.map((player) => {
        const pick = getPickForPlayer(player.playerId);
        return (
          <td key={player.playerId} className={styles.pickCell}>
            {gameStarted && pick ? (
              <PickDisplay pick={pick} game={game} variant="compact" />
            ) : gameStarted && !pick ? (
              <span className={styles.noPick}>-</span>
            ) : (
              <span className={styles.hidden}>?</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ============================================
// DESIGN 2: Cards View (Player Cards + Timeline Games)
// ============================================
function CardGridView({ games, players }) {
  // Group games by date
  const gamesByDate = useMemo(() => {
    const grouped = {};
    games.forEach(game => {
      const date = format(parseISO(game.scheduled_at), 'yyyy-MM-dd');
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(game);
    });
    return grouped;
  }, [games]);

  return (
    <div className={styles.cardGrid}>
      {/* Player Score Cards */}
      <div className={styles.playerCards}>
        {players.map((player, idx) => (
          <div
            key={player.playerId}
            className={`${styles.playerCard} ${idx === 0 ? styles.leaderCard : ''}`}
          >
            <div className={styles.cardRank}>#{idx + 1}</div>
            <div className={styles.cardName}>{player.playerName}</div>
            <div className={styles.cardScore}>{formatPoints(player.totalPoints)}</div>
            <div className={styles.cardAccuracy}>{player.accuracy}% accuracy</div>
          </div>
        ))}
      </div>

      {/* Timeline Games */}
      <div className={styles.timelineContent}>
        {Object.entries(gamesByDate).map(([date, dateGames]) => (
          <div key={date} className={styles.timelineDay}>
            <div className={styles.timelineDate}>
              <span className={styles.dateBubble}>
                {format(parseISO(date), 'EEE, MMM d')}
              </span>
            </div>
            <div className={styles.timelineGames}>
              {dateGames.map((game) => (
                <TimelineGameRow key={game.id} game={game} players={players} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineGameRow({ game, players }) {
  const scheduledAt = parseISO(game.scheduled_at);
  const statusState = typeof game.status === 'string' ? game.status : game.status?.state;
  const isFinal = statusState === 'final';
  const isLive = statusState === 'in_progress';
  const now = new Date();
  const gameStarted = isAfter(now, scheduledAt) || isLive || isFinal;
  const timeLabel = isLive ? formatLiveStatus(game) : format(scheduledAt, 'HH:mm');
  const finalLabel = isFinal ? getFinalLabel(game) : null;

  const getPickForPlayer = (playerId) => {
    return game.picks?.find(p => p.playerId === playerId);
  };

  return (
    <div className={`${styles.timelineGame} ${isLive ? styles.timelineLive : ''}`}>
      <div className={styles.timelineTime}>
        {isLive && <span className={styles.timelineLiveDot} />}
        <span>{timeLabel}</span>
      </div>

      <div className={styles.timelineMatchup}>
        <div className={styles.timelineTeams}>
          <TeamBadge team={game.team_a} isWinner={isFinal && game.result === 'win_a'} showFlag />
          <span className={styles.timelineVs}>
            {(isFinal || isLive) ? formatScoreInline(game) : 'vs'}
          </span>
          <TeamBadge team={game.team_b} isWinner={isFinal && game.result === 'win_b'} showFlag />
        </div>
        {(isFinal || isLive) && (
          <span className={`${styles.timelineStatus} ${isLive ? styles.live : ''}`}>
            {isLive ? 'LIVE' : (finalLabel || 'FINAL')}
          </span>
        )}
      </div>

      <div className={styles.timelinePicks}>
        {players.map((player) => {
          const pick = getPickForPlayer(player.playerId);
          return (
            <div key={player.playerId} className={styles.timelinePickSlot}>
              {gameStarted && pick ? (
                <PickDisplay pick={pick} game={game} variant="timeline" />
              ) : gameStarted && !pick ? (
                <span className={styles.timelineNoPick}>-</span>
              ) : (
                <span className={styles.timelineHidden}>?</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Shared Components
// ============================================
function TeamBadge({ team, isWinner, showName = false, showFlag = false }) {
  if (!team) {
    return <span className={styles.tbd}>TBD</span>;
  }

  return (
    <div className={`${styles.teamBadge} ${isWinner ? styles.winnerBadge : ''}`}>
      {showFlag && <CountryFlag team={team} size="small" />}
      {!showFlag && team.logo && (
        <img src={team.logo} alt="" className={styles.teamLogo} />
      )}
      {showName && <span className={styles.teamNameBadge}>{team.abbreviation || team.name?.slice(0, 3).toUpperCase()}</span>}
    </div>
  );
}

function PickDisplay({ pick, game, variant }) {
  const statusState = typeof game.status === 'string' ? game.status : game.status?.state;
  const isFinal = statusState === 'final';
  const isLive = statusState === 'in_progress';
  const isCorrect = pick.isCorrect;
  const isProvisional = pick.isProvisional;
  const predictedWinner = pick.predictedResult === 'win_a' ? game.team_a :
                          pick.predictedResult === 'win_b' ? game.team_b : null;
  const hasFlag = predictedWinner ? !!getTeamFlagFromObject(predictedWinner) : false;
  const confidence = pick.confidence ?? 0.5;
  const confidencePercent = Math.round(confidence * 100);

  const baseClass = variant === 'compact' ? styles.pickCompact :
                    variant === 'card' ? styles.pickCard :
                    styles.pickTimeline;

  // Determine result class: provisional (live + scored), final, or pending
  let resultClass;
  if (isProvisional) {
    resultClass = isCorrect ? styles.provisionalCorrect : styles.provisionalIncorrect;
  } else if (isFinal) {
    resultClass = isCorrect ? styles.correct : styles.incorrect;
  } else {
    resultClass = styles.pending;
  }

  const canShowPoints = isFinal || isProvisional;

  const getAbbrev = (team) => team?.abbreviation || team?.name?.slice(0, 3).toUpperCase() || '?';

  // Format points: show + for positive, just the number for negative/zero
  const formatPickPoints = (points) => formatPointsWithSign(points);

  if (variant === 'compact') {
    return (
      <div className={`${baseClass} ${resultClass}`} title={`${confidencePercent}% confidence`}>
        <div className={styles.pickContent}>
          {predictedWinner ? (
            <>
              {hasFlag ? (
                <CountryFlag team={predictedWinner} size="small" className={styles.pickFlag} />
              ) : (
                <span className={styles.pickAbbrev}>{getAbbrev(predictedWinner)}</span>
              )}
            </>
          ) : (
            <span className={styles.pickTie}>TIE</span>
          )}
          <span className={styles.pickConfidence}>{confidencePercent}%</span>
        </div>
        {canShowPoints && (
          <span className={`${styles.pickPoints} ${pick.pointsEarned < 0 ? styles.negative : ''}`}>
            {formatPickPoints(pick.pointsEarned)}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`${baseClass} ${resultClass}`}>
        {predictedWinner ? (
          <>
            {hasFlag ? (
              <CountryFlag team={predictedWinner} size="small" className={styles.cardPickFlag} />
            ) : (
              <span className={styles.cardPickTeam}>{getAbbrev(predictedWinner)}</span>
            )}
          </>
        ) : (
          <span className={styles.cardPickTeam}>TIE</span>
        )}
        <span className={styles.cardPickConfidence}>{confidencePercent}%</span>
        {canShowPoints && (
          <span className={`${styles.cardPickPoints} ${pick.pointsEarned < 0 ? styles.negative : ''}`}>
            {formatPickPoints(pick.pointsEarned)}
          </span>
        )}
      </div>
    );
  }

  // timeline
  return (
    <div className={`${baseClass} ${resultClass}`} title={`${confidencePercent}% confidence`}>
      <span className={styles.timelineConfidence}>{confidencePercent}%</span>
      <div className={styles.timelinePickContent}>
        {predictedWinner ? (
          <>
            {hasFlag ? (
              <CountryFlag team={predictedWinner} size="small" className={styles.timelinePickFlag} />
            ) : (
              <span className={styles.timelinePickAbbrev}>{getAbbrev(predictedWinner)}</span>
            )}
          </>
        ) : (
          <span className={styles.timelineTie}>T</span>
        )}
      </div>
      {canShowPoints && (
        <span className={`${styles.timelinePoints} ${pick.pointsEarned < 0 ? styles.negative : ''}`}>
          {formatPickPoints(pick.pointsEarned)}
        </span>
      )}
    </div>
  );
}

export default PicksOverviewPage;
