import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/common';
import { calculateBrierPoints } from '../services/scoring';
import scoringConfig from '../../config/scoring.json';
import styles from './RulesPage.module.css';

export function RulesPage() {
  const confidences = useMemo(() => [0.5, 0.6, 0.7, 0.8, 0.9, 1.0], []);
  const chartData = useMemo(
    () =>
      confidences.map((confidence) => ({
        confidence,
        win: calculateBrierPoints(true, confidence, 1, scoringConfig),
        lose: calculateBrierPoints(false, confidence, 1, scoringConfig),
      })),
    [confidences]
  );
  const [activePoint, setActivePoint] = useState(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const touchCapable = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
    const coarsePointer =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(hover: none)').matches;
    setIsTouchDevice(Boolean(touchCapable || coarsePointer));
  }, []);

  const roundToOne = (value) => Number(value ?? 0).toFixed(1);
  const winValues = chartData.map((point) => point.win);
  const loseValues = chartData.map((point) => point.lose);
  const minValue = Math.min(...loseValues);
  const maxValue = Math.max(...winValues);
  const minY = Math.floor(minValue / 5) * 5;
  const maxY = Math.ceil(maxValue / 5) * 5;
  const midY = Math.round((minY + maxY) / 2);
  const zeroYValue = 0;

  const chartWidth = 520;
  const chartHeight = 220;
  const padding = { top: 16, right: 20, bottom: 32, left: 44 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const stepX = plotWidth / (chartData.length - 1);
  const valueRange = maxY - minY || 1;
  const xForIndex = (index) => padding.left + stepX * index;
  const yForValue = (value) => padding.top + (maxY - value) * (plotHeight / valueRange);

  const buildLine = (values) =>
    values
      .map((value, index) => `${xForIndex(index)},${yForValue(value)}`)
      .join(' ');

  const winLine = buildLine(winValues);
  const loseLine = buildLine(loseValues);
  const zeroY = yForValue(zeroYValue);

  const buildArea = (values) => {
    const topPoints = values.map((value, index) => `${xForIndex(index)},${yForValue(value)}`).join(' ');
    const leftBase = `${xForIndex(0)},${zeroY}`;
    const rightBase = `${xForIndex(values.length - 1)},${zeroY}`;
    return `${leftBase} ${topPoints} ${rightBase}`;
  };

  const winArea = buildArea(winValues);
  const loseArea = buildArea(loseValues);

  const labelSummary = chartData
    .map((point) => `${Math.round(point.confidence * 100)}%: +${roundToOne(point.win)} / ${roundToOne(point.lose)}`)
    .join(', ');

  const getPointInfo = (index, series) => {
    if (index === null || index === undefined) return null;
    const point = chartData[index];
    if (!point) return null;
    const confidenceLabel = `${Math.round(point.confidence * 100)}%`;
    const winLabel = `Win +${roundToOne(point.win)}`;
    const loseLabel = `Lose ${roundToOne(point.lose)}`;
    const seriesLabel = series === 'win' ? winLabel : loseLabel;
    return {
      confidenceLabel,
      winLabel,
      loseLabel,
      seriesLabel,
      x: xForIndex(index),
      y: yForValue(series === 'win' ? point.win : point.lose),
    };
  };

  const tooltip = activePoint ? getPointInfo(activePoint.index, activePoint.series) : null;
  const tooltipStyle = tooltip
    ? {
        left: `${(tooltip.x / chartWidth) * 100}%`,
        top: `${(tooltip.y / chartHeight) * 100}%`,
      }
    : undefined;

  const handleActivatePoint = (index, series) => {
    setActivePoint({ index, series });
  };

  const handleDeactivatePoint = () => {
    if (isTouchDevice) return;
    setActivePoint(null);
  };

  const handleTogglePoint = (index, series) => {
    if (!isTouchDevice) return;
    setActivePoint((prev) => {
      if (!prev || prev.index !== index || prev.series !== series) {
        return { index, series };
      }
      return null;
    });
  };

  return (
    <div className={styles.page}>
      <h1>Rules</h1>

      <Card className={styles.section}>
        <h2>How It Works</h2>
        <p>
          You can make or update your picks right up until a game begins. Once a
          game starts, all predictions for that game become visible to everyone.
          Points are awarded based on correct predictions.
        </p>
      </Card>

      <Card className={styles.section}>
        <h2>Scoring: Brier Score</h2>
        <p>
          This tournament uses a <strong>Brier score</strong> system.
          This rewards not only predicting the correct outcome but also how confident you are in that prediction.
        </p>
        <p>
          The formula effectively penalizes overconfidence, especially when a high-confidence pick is wrong.
        </p>
        <p>
          For each game, you choose the winner and a <strong>Confidence Level</strong> from 50% (toss-up) to 100% (certain).
        </p>

        <div className={styles.exampleHeader}>Example Points (Group Stage):</div>
        <div className={styles.pointsTable}>
          <div className={styles.pointsRow}>
            <span className={styles.round}>100% Correct</span>
            <span className={styles.points}>+25 pts</span>
          </div>
          <div className={styles.pointsRow}>
            <span className={styles.round}>90% Correct</span>
            <span className={styles.points}>+16 pts</span>
          </div>
          <div className={styles.pointsRow}>
            <span className={styles.round}>75% Correct</span>
            <span className={styles.points}>+18.75 pts</span>
          </div>
          <div className={styles.pointsRow}>
            <span className={styles.round}>50% (Any Result)</span>
            <span className={styles.points}>0 pts</span>
          </div>
          <div className={styles.pointsRow}>
            <span className={styles.round}>75% Wrong</span>
            <span className={styles.points}>-31.25 pts</span>
          </div>
          <div className={styles.pointsRow}>
            <span className={styles.round}>90% Wrong</span>
            <span className={styles.points}>-56 pts</span>
          </div>
          <div className={styles.pointsRow}>
            <span className={styles.round}>100% Wrong</span>
            <span className={styles.points}>-75 pts</span>
          </div>
        </div>

        <div className={styles.chartSection}>
          <div className={styles.chartHeader}>Win vs Lose Points by Confidence (Group Stage)</div>
          <div className={styles.chartLegend}>
            <span className={`${styles.legendItem} ${styles.legendWin}`}>Win points</span>
            <span className={`${styles.legendItem} ${styles.legendLose}`}>Lose points</span>
          </div>
          <div className={styles.chartWrapper}>
            <svg
              className={styles.chart}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label="Line chart comparing win and lose points across confidence levels"
            >
              <line
                className={styles.chartAxis}
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={chartHeight - padding.bottom}
              />
              <line
                className={styles.chartAxis}
                x1={padding.left}
                y1={chartHeight - padding.bottom}
                x2={chartWidth - padding.right}
                y2={chartHeight - padding.bottom}
              />
              <line
                className={styles.zeroLine}
                x1={padding.left}
                y1={zeroY}
                x2={chartWidth - padding.right}
                y2={zeroY}
              />

              {[maxY, midY, zeroYValue, minY].map((value) => (
                <g key={`y-${value}`} className={styles.axisLabel}>
                  <text x={padding.left - 8} y={yForValue(value) + 4} textAnchor="end">
                    {roundToOne(value)}
                  </text>
                  <line
                    className={styles.chartGrid}
                    x1={padding.left}
                    y1={yForValue(value)}
                    x2={chartWidth - padding.right}
                    y2={yForValue(value)}
                  />
                </g>
              ))}

              {chartData.map((point, index) => (
                <text
                  key={`x-${point.confidence}`}
                  className={styles.axisLabel}
                  x={xForIndex(index)}
                  y={chartHeight - padding.bottom + 18}
                  textAnchor="middle"
                >
                  {Math.round(point.confidence * 100)}%
                </text>
              ))}

              <polygon className={styles.areaWin} points={winArea} />
              <polygon className={styles.areaLose} points={loseArea} />
              <polyline className={styles.lineWin} points={winLine} />
              <polyline className={styles.lineLose} points={loseLine} />

              {chartData.map((point, index) => (
                <g key={`point-${point.confidence}`}>
                  <circle
                    className={styles.pointWin}
                    cx={xForIndex(index)}
                    cy={yForValue(point.win)}
                    r="4"
                    tabIndex="0"
                    role="button"
                    aria-label={`${Math.round(point.confidence * 100)}% confidence: win +${roundToOne(point.win)} points`}
                    onMouseEnter={() => handleActivatePoint(index, 'win')}
                    onMouseLeave={handleDeactivatePoint}
                    onFocus={() => handleActivatePoint(index, 'win')}
                    onBlur={handleDeactivatePoint}
                    onClick={() => handleTogglePoint(index, 'win')}
                  />
                  <circle
                    className={styles.pointLose}
                    cx={xForIndex(index)}
                    cy={yForValue(point.lose)}
                    r="4"
                    tabIndex="0"
                    role="button"
                    aria-label={`${Math.round(point.confidence * 100)}% confidence: lose ${roundToOne(point.lose)} points`}
                    onMouseEnter={() => handleActivatePoint(index, 'lose')}
                    onMouseLeave={handleDeactivatePoint}
                    onFocus={() => handleActivatePoint(index, 'lose')}
                    onBlur={handleDeactivatePoint}
                    onClick={() => handleTogglePoint(index, 'lose')}
                  />
                </g>
              ))}
            </svg>
            {tooltip && (
              <div
                className={`${styles.tooltip} ${tooltip.seriesLabel.startsWith('Win') ? styles.tooltipWin : styles.tooltipLose}`}
                style={tooltipStyle}
              >
                <div className={styles.tooltipTitle}>{tooltip.confidenceLabel} confidence</div>
                <div className={styles.tooltipRow}>{tooltip.winLabel} pts</div>
                <div className={styles.tooltipRow}>{tooltip.loseLabel} pts</div>
              </div>
            )}
          </div>
          <p className={styles.chartNote}>
            Values use the group-stage regulation multiplier (1x). {labelSummary}.
          </p>
        </div>

        <p className={styles.note}>
          <strong>Formula:</strong> Points = Round Multiplier × (25 - (100 × (Outcome - Confidence)²))
          <br />
          Where Outcome is 1 for correct and 0 for incorrect.
          <br />
          Confidence in the formula is a decimal between 0.5 and 1.0 (e.g., 80% = 0.8).
        </p>
      </Card>

      <Card className={styles.section}>
        <h2>Round Multipliers</h2>
        <p>
          Points are multiplied based on the importance of the round and whether it ended in overtime or a shootout:
        </p>
        <div className={styles.pointsTable}>
          <div className={styles.pointsRow}>
            <span className={styles.round}>Group Stage</span>
            <span className={styles.points}>1x (0.75x OT/SO)</span>
          </div>
          <div className={styles.pointsRow}>
            <span className={styles.round}>Playoffs</span>
            <span className={styles.points}>2x (1.5x OT/SO)</span>
          </div>
        </div>
      </Card>

      <Card className={styles.section}>
        <h2>Pick Visibility</h2>
        <p>
          Your predictions are hidden from other players until each game starts.
          Once the puck drops, everyone can see what you predicted for that game.
        </p>
      </Card>

      <Card className={styles.section}>
        <h2>Skipped Games</h2>
        <p>
          If you don't submit a prediction for a game, you simply receive 0 points
          for that game. There's no penalty — you just miss the opportunity to score.
        </p>
      </Card>
    </div>
  );
}

export default RulesPage;
