import { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/common';
import styles from './AuthPage.module.css';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { signIn, isConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';
  const showRegistered = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('registered') === '1';
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1>Login Unavailable</h1>
            <p>Authentication is not configured. Please contact the administrator.</p>
          </div>
          <Link to="/" className={styles.link}>Return to Home</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1>Welcome Back</h1>
          <p>Sign in to make your picks</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {showRegistered && (
            <div className={styles.success}>
              Account created! You can sign in now.
            </div>
          )}
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" loading={loading} className={styles.submitButton}>
            Sign In
          </Button>
        </form>

        <div className={styles.footer}>
          <Link to="/forgot-password" className={styles.link}>
            Forgot your password?
          </Link>
          <span className={styles.divider}>|</span>
          <Link to="/register" className={styles.link}>
            Have an invite code? Register
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default LoginPage;
