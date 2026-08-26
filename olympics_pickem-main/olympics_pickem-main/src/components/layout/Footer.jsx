import styles from './Footer.module.css';
import { useApp } from '../../context/AppContext';
import { format } from 'date-fns';

export function Footer() {
  const { lastUpdated } = useApp();

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p className={styles.text}>
          2026 Milan-Cortina Olympics Men's Hockey Pick'em
        </p>
        {lastUpdated && (
          <p className={styles.updated}>
            Last updated: {format(lastUpdated, 'MMM d, h:mm a')}
          </p>
        )}
      </div>
    </footer>
  );
}

export default Footer;
