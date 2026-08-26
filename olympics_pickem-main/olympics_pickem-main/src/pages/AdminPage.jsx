import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { invites as invitesApi, profiles } from '../services/supabase';
import { Button, Card, Loading } from '../components/common';
import styles from './AdminPage.module.css';

export function AdminPage() {
  const { user, isAdmin, isAuthenticated } = useAuth();
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load invites and users
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invitesList, usersList] = await Promise.all([
        invitesApi.getAll(),
        profiles.getAll(),
      ]);
      setInvites(invitesList || []);
      setUsers(usersList || []);
    } catch (err) {
      console.error('Error loading admin data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, isAdmin, loadData]);

  // Create new invite
  const handleCreateInvite = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setCreating(true);
    try {
      const newInvite = await invitesApi.create(email.trim().toLowerCase());
      setInvites((prev) => [newInvite, ...prev]);
      setEmail('');
      setSuccess(`Invite created! Code: ${newInvite.invite_code}`);
    } catch (err) {
      setError(err.message || 'Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  // Delete invite (unused)
  const handleDeleteInvite = async (inviteId) => {
    if (!window.confirm('Delete this invite?')) return;

    try {
      await invitesApi.delete(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      setError(err.message || 'Failed to delete invite');
    }
  };

  // Delete used invite
  const handleDeleteUsedInvite = async (inviteId) => {
    if (!window.confirm('Delete this used invite from the log?')) return;

    try {
      await invitesApi.deleteUsed(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      setSuccess('Invite log entry deleted');
    } catch (err) {
      setError(err.message || 'Failed to delete invite');
    }
  };

  // Delete user
  const handleDeleteUser = async (userId, userName) => {
    if (userId === user?.id) {
      setError('You cannot delete your own account');
      return;
    }

    if (!window.confirm(`Delete user "${userName}"? This will remove all their picks and data permanently.`)) return;

    try {
      await profiles.delete(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setSuccess(`User "${userName}" deleted`);
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    }
  };

  // Copy invite code to clipboard
  const copyToClipboard = (code) => {
    navigator.clipboard.writeText(code);
    setSuccess(`Copied ${code} to clipboard`);
    setTimeout(() => setSuccess(null), 2000);
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.unauthorized}>
          <h2>Sign in required</h2>
          <p>You need to be logged in to access this page.</p>
          <Button onClick={() => (window.location.href = '/login')}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.unauthorized}>
          <h2>Admin Access Required</h2>
          <p>You don't have permission to view this page.</p>
          <Button onClick={() => (window.location.href = '/')}>
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <Loading message="Loading admin data..." />;
  }

  return (
    <div className={styles.page}>
      <h1>Admin Dashboard</h1>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* Create Invite Section */}
      <Card className={styles.section}>
        <h2>Create Invite</h2>
        <form onSubmit={handleCreateInvite} className={styles.inviteForm}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            className={styles.emailInput}
          />
          <Button type="submit" loading={creating}>
            Create Invite
          </Button>
        </form>
      </Card>

      {/* Pending Invites Section */}
      <Card className={styles.section}>
        <h2>Pending Invites ({invites.filter((i) => !i.used).length})</h2>
        {invites.filter((i) => !i.used).length === 0 ? (
          <p className={styles.empty}>No pending invites</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>Email</span>
              <span>Code</span>
              <span>Created</span>
              <span>Actions</span>
            </div>
            {invites
              .filter((i) => !i.used)
              .map((invite) => (
                <div key={invite.id} className={styles.tableRow}>
                  <span className={styles.email}>{invite.email}</span>
                  <span
                    className={styles.code}
                    onClick={() => copyToClipboard(invite.invite_code)}
                    title="Click to copy"
                  >
                    {invite.invite_code}
                  </span>
                  <span className={styles.date}>
                    {new Date(invite.created_at).toLocaleDateString()}
                  </span>
                  <span className={styles.actions}>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => copyToClipboard(invite.invite_code)}
                    >
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleDeleteInvite(invite.id)}
                    >
                      Delete
                    </Button>
                  </span>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* Used Invites Section */}
      <Card className={styles.section}>
        <h2>Used Invites ({invites.filter((i) => i.used).length})</h2>
        {invites.filter((i) => i.used).length === 0 ? (
          <p className={styles.empty}>No used invites yet</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>Email</span>
              <span>Code</span>
              <span>Used At</span>
              <span>Actions</span>
            </div>
            {invites
              .filter((i) => i.used)
              .map((invite) => (
                <div key={invite.id} className={`${styles.tableRow} ${styles.used}`}>
                  <span className={styles.email}>{invite.email}</span>
                  <span className={styles.code}>{invite.invite_code}</span>
                  <span className={styles.date}>
                    {invite.used_at
                      ? new Date(invite.used_at).toLocaleDateString()
                      : '-'}
                  </span>
                  <span className={styles.actions}>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleDeleteUsedInvite(invite.id)}
                    >
                      Remove
                    </Button>
                  </span>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* Registered Users Section */}
      <Card className={styles.section}>
        <h2>Registered Users ({users.length})</h2>
        {users.length === 0 ? (
          <p className={styles.empty}>No users registered yet</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>Name</span>
              <span>Role</span>
              <span>Joined</span>
              <span>Actions</span>
            </div>
            {users.map((u) => (
              <div key={u.id} className={styles.tableRow}>
                <span className={styles.name}>
                  {u.name}
                  {u.id === user?.id && ' (you)'}
                </span>
                <span className={styles.role}>
                  {u.is_admin ? (
                    <span className={styles.adminBadge}>Admin</span>
                  ) : (
                    'Player'
                  )}
                </span>
                <span className={styles.date}>
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
                <span className={styles.actions}>
                  {u.id !== user?.id && (
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleDeleteUser(u.id, u.name)}
                    >
                      Delete
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default AdminPage;
