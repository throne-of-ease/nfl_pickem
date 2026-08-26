import styles from './Card.module.css';

export function Card({ children, className = '', padding = 'medium', ...props }) {
  const classNames = [styles.card, styles[padding], className].filter(Boolean).join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`${styles.header} ${className}`}>{children}</div>;
}

export function CardBody({ children, className = '' }) {
  return <div className={`${styles.body} ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return <div className={`${styles.footer} ${className}`}>{children}</div>;
}

export default Card;
