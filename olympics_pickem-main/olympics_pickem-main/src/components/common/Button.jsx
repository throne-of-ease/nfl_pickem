import styles from './Button.module.css';

export function Button({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  className = '',
  ...props
}) {
  const classNames = [
    styles.button,
    styles[variant],
    styles[size],
    loading && styles.loading,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classNames}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <span className={styles.spinner} />}
      <span className={loading ? styles.hidden : ''}>{children}</span>
    </button>
  );
}

export default Button;
