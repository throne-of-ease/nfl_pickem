import { getTeamFlagFromObject } from '../../utils/countryFlags';
import styles from './CountryFlag.module.css';

export function CountryFlag({ team, size = 'medium', className = '' }) {
  const flag = getTeamFlagFromObject(team);

  if (!flag) return null;

  return (
    <span
      className={`${styles.flag} ${styles[size]} ${className}`}
      role="img"
      aria-label={`${team?.name || team?.displayName || 'Country'} flag`}
    >
      {flag}
    </span>
  );
}

export default CountryFlag;
