import styles from './GameFilters.module.css';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Games' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'inProgress', label: 'Live' },
  { value: 'completed', label: 'Completed' },
];

const ROUND_OPTIONS = [
  { value: 'all', label: 'All Rounds' },
  { value: 'groupStage', label: 'Group Stage' },
  { value: 'knockoutRound', label: 'Knockout' },
  { value: 'medalRound', label: 'Medal Round' },
];

export function GameFilters({ filter, onFilterChange, round, onRoundChange }) {
  return (
    <div className={styles.filters}>
      <div className={styles.group}>
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`${styles.button} ${filter === option.value ? styles.active : ''}`}
            onClick={() => onFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <select
        className={styles.select}
        value={round}
        onChange={(e) => onRoundChange(e.target.value)}
      >
        {ROUND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default GameFilters;
