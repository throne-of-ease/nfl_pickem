import { createClient } from '@supabase/supabase-js';
import { getActiveTournamentKey } from '../config/tournamentConfig';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const TOURNAMENT_KEY = getActiveTournamentKey();

/**
 * Check if Supabase is configured and available
 */
export function isSupabaseConfigured() {
  return supabase !== null;
}

/**
 * Auth helper functions
 */
export const auth = {
  /**
   * Sign up with email and password via backend API
   * Uses admin API to bypass email confirmation
   */
  async signUp(email, password, name, inviteCode) {
    if (!supabase) throw new Error('Supabase not configured');

    // Use backend API to register (bypasses email confirmation)
    const response = await fetch('/.netlify/functions/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name, inviteCode }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create account');
    }

    // After successful registration, sign in the user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) throw signInError;

    return signInData;
  },

  /**
   * Sign in with email and password
   */
  async signIn(email, password) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Sign out
   */
  async signOut() {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Get current session
   */
  async getSession() {
    if (!supabase) return null;

    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  /**
   * Get current user
   */
  async getUser() {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Send password reset email
   */
  async resetPassword(email) {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  },

  /**
   * Update password (after reset)
   */
  async updatePassword(newPassword) {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  },

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback) {
    if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };

    return supabase.auth.onAuthStateChange(callback);
  },
};

/**
 * Profile helper functions
 */
export const profiles = {
  /**
   * Get user profile
   */
  async get(userId) {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update user profile
   */
  async update(userId, updates) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get all profiles (for leaderboard)
   */
  async getAll() {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  },

  /**
   * Delete a user via API (admin only)
   */
  async delete(userId) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`/.netlify/functions/admin-users?id=${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete user');
    }
  },
};

/**
 * Picks helper functions
 */
export const picks = {
  /**
   * Get user's picks
   */
  async getUserPicks(userId) {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('user_id', userId)
      .eq('tournament_key', TOURNAMENT_KEY)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Get all picks for a specific game (only returns if game started due to RLS)
   */
  async getGamePicks(gameId) {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('game_id', gameId)
      .eq('tournament_key', TOURNAMENT_KEY);

    if (error) throw error;
    return data;
  },

  /**
   * Submit or update a pick
   */
  async upsert(userId, gameId, teamAScore, teamBScore, confidence = 0.5) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from('picks')
      .upsert(
        {
          user_id: userId,
          game_id: gameId,
          team_a_score: teamAScore,
          team_b_score: teamBScore,
          confidence: confidence,
          tournament_key: TOURNAMENT_KEY,
        },
        {
          onConflict: 'tournament_key,user_id,game_id',
        }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a pick
   */
  async delete(userId, gameId) {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('picks')
      .delete()
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .eq('tournament_key', TOURNAMENT_KEY);

    if (error) throw error;
  },

  /**
   * Get all picks for all users (for leaderboard calculation)
   * Only returns picks for games that have started (due to RLS)
   */
  async getAllVisible() {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('tournament_key', TOURNAMENT_KEY);

    if (error) throw error;
    return data;
  },
};

/**
 * Invites helper functions (admin only)
 */
export const invites = {
  /**
   * Create a new invite (admin only)
   */
  async create(email) {
    if (!supabase) throw new Error('Supabase not configured');

    // Get current user for invited_by
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Generate invite code
    const { data: codeData, error: codeError } = await supabase
      .rpc('generate_invite_code');

    if (codeError) throw codeError;

    const { data, error } = await supabase
      .from('invites')
      .insert({
        email,
        invite_code: codeData,
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get all invites (admin only)
   */
  async getAll() {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Delete an unused invite via API (admin only)
   */
  async delete(inviteId) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`/.netlify/functions/invites?id=${inviteId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete invite');
    }
  },

  /**
   * Delete a used invite via API (admin only)
   */
  async deleteUsed(inviteId) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`/.netlify/functions/invites?id=${inviteId}&allowUsed=true`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete invite');
    }
  },
};

/**
 * Games cache helper functions
 */
export const gamesCache = {
  /**
   * Get cached game
   */
  async get(gameId) {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('games_cache')
      .select('*')
      .eq('game_id', gameId)
      .eq('tournament_key', TOURNAMENT_KEY)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Get all cached games
   */
  async getAll() {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('games_cache')
      .select('*')
      .eq('tournament_key', TOURNAMENT_KEY)
      .order('scheduled_at');

    if (error) throw error;
    return data;
  },

  /**
   * Check if game has started
   */
  async hasGameStarted(gameId) {
    if (!supabase) return false;

    const { data, error } = await supabase
      .from('games_cache')
      .select('scheduled_at')
      .eq('game_id', gameId)
      .eq('tournament_key', TOURNAMENT_KEY)
      .single();

    if (error) return false;
    return new Date(data.scheduled_at) <= new Date();
  },
};

export default supabase;
