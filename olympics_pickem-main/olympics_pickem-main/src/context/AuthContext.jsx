import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, profiles, isSupabaseConfigured } from '../services/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isConfigured = isSupabaseConfigured();

  // Load user profile
  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    try {
      const profileData = await profiles.get(userId);
      setProfile(profileData);
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Get initial session
    auth.getSession().then((session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        loadProfile(currentUser.id);
      }
      setLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);

      if (event === 'SIGNED_IN' && currentUser) {
        loadProfile(currentUser.id);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [isConfigured, loadProfile]);

  const signIn = useCallback(async (email, password) => {
    setError(null);
    try {
      const data = await auth.signIn(email, password);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email, password, name, inviteCode) => {
    setError(null);
    try {
      const data = await auth.signUp(email, password, name, inviteCode);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await auth.signOut();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    setError(null);
    try {
      await auth.resetPassword(email);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    setError(null);
    try {
      await auth.updatePassword(newPassword);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updateProfile = useCallback(async (updates) => {
    if (!user) return;
    setError(null);
    try {
      const updatedProfile = await profiles.update(user.id, updates);
      setProfile(updatedProfile);
      return updatedProfile;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [user]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    user,
    profile,
    loading,
    error,
    isConfigured,
    isAuthenticated: !!user,
    isAdmin: profile?.is_admin === true,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
