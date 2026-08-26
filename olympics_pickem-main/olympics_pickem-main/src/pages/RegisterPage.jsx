import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/common';
import styles from './AuthPage.module.css';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { signUp, isConfigured } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const normalizedInviteCode = inviteCode.replace(/[\s-]+/g, '').toUpperCase();

    // Validation
    if (!normalizedInviteCode) {
      setError('Invite code is required');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, name, normalizedInviteCode);
      navigate('/login?registered=1');
    } catch (err) {
      const message = err.message || 'Failed to create account';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1>Registration Unavailable</h1>
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
          <h1>Join the Pick'em</h1>
          <p>Create your account to start making picks</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label htmlFor="name">Display Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How should we call you?"
              required
              autoComplete="name"
            />
          </div>

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
              placeholder="At least 6 characters"
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="inviteCode">Invite Code</label>
            <input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => {
                const value = e.target.value.replace(/[\s-]+/g, '').toUpperCase();
                setInviteCode(value);
              }}
              placeholder="8-character code (letters/numbers)"
              required
              autoComplete="off"
              className={styles.inviteInput}
              maxLength={24}
            />
            <span className={styles.hint}>Enter the code you received from the admin.</span>
          </div>

          <Button type="submit" loading={loading} className={styles.submitButton}>
            Create Account
          </Button>
        </form>

        <div className={styles.footer}>
          <span>Already have an account?</span>
          <Link to="/login" className={styles.link}>
            Sign In
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default RegisterPage;
