import styles from './Loading.module.css';

export function Loading({ size = 'medium', text = 'Loading...' }) {
  return (
    <div className={styles.container}>
      <div className={`${styles.spinner} ${styles[size]}`} />
      {text && <p className={styles.text}>{text}</p>}
    </div>
  );
}

export function LoadingOverlay({ text }) {
  return (
    <div className={styles.overlay}>
      <Loading text={text} size="large" />
    </div>
  );
}

export default Loading;
