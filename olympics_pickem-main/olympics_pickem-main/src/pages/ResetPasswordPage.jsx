import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/common';
import styles from './AuthPage.module.css';

export function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  const { resetPassword, updatePassword, isConfigured, user } = useAuth();
  const navigate = useNavigate();

  // Check if user came from reset email link (they'll be logged in with recovery token)
  useEffect(() => {
    // Check URL for recovery mode
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsResetting(true);
    }
  }, []);

  // Also check if user is authenticated with recovery session
  useEffect(() => {
    if (user && window.location.hash.includes('type=recovery')) {
      setIsResetting(true);
    }
  }, [user]);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await resetPassword(email);
      setEmailSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await updatePassword(newPassword);
      setResetComplete(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1>Password Reset Unavailable</h1>
            <p>Authentication is not configured. Please contact the administrator.</p>
          </div>
          <Link to="/" className={styles.link}>Return to Home</Link>
        </Card>
      </div>
    );
  }

  // Password reset complete
  if (resetComplete) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1>Password Updated</h1>
            <p>Your password has been successfully reset. Redirecting to login...</p>
          </div>
          <Link to="/login" className={styles.link}>
            Go to Sign In
          </Link>
        </Card>
      </div>
    );
  }

  // Set new password form (after clicking email link)
  if (isResetting) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1>Set New Password</h1>
            <p>Enter your new password below</p>
          </div>

          <form onSubmit={handleResetPassword} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="newPassword">New Password</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your new password"
                required
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" loading={loading} className={styles.submitButton}>
              Update Password
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Email sent confirmation
  if (emailSent) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1>Check Your Email</h1>
            <p>
              We've sent password reset instructions to <strong>{email}</strong>.
              Click the link in the email to reset your password.
            </p>
          </div>
          <div className={styles.footer}>
            <Link to="/login" className={styles.link}>
              Back to Sign In
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Request reset form
  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1>Forgot Password?</h1>
          <p>Enter your email and we'll send you a reset link</p>
        </div>

        <form onSubmit={handleRequestReset} className={styles.form}>
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

          <Button type="submit" loading={loading} className={styles.submitButton}>
            Send Reset Link
          </Button>
        </form>

        <div className={styles.footer}>
          <Link to="/login" className={styles.link}>
            Back to Sign In
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default ResetPasswordPage;
