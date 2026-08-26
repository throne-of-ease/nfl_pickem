import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common';
import styles from './Header.module.css';

export function Header() {
  const { isAuthenticated, isAdmin, profile, signOut, isConfigured } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <img src="/hockey-puck.svg" alt="" className={styles.icon} />
          <span className={styles.title}>Olympic Hockey Pick'em</span>
        </Link>
        <nav className={styles.nav}>
          <Link to="/" className={styles.link}>Overview</Link>
          <Link to="/leaderboard" className={styles.link}>Standings</Link>
          <Link to="/rules" className={styles.link}>Rules</Link>

          {isConfigured && (
            <>
              {isAuthenticated ? (
                <>
                  <Link to="/my-picks" className={styles.link}>My Picks</Link>
                  {isAdmin && (
                    <Link to="/admin" className={styles.adminLink}>Admin</Link>
                  )}
                  <div className={styles.userMenu}>
                    <span className={styles.userName}>{profile?.name || 'User'}</span>
                    <Button variant="ghost" size="small" onClick={handleSignOut}>
                      Sign Out
                    </Button>
                  </div>
                </>
              ) : (
                <Link to="/login" className={styles.loginLink}>Sign In</Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;
