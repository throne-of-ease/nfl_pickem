import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'
  );
}

/**
 * Create a Supabase client with the user's JWT for RLS
 * @param {string} accessToken - User's access token from auth header
 */
export function createSupabaseClient(accessToken = null) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const options = {};

  if (accessToken) {
    options.global = {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };
  }

  return createClient(supabaseUrl, supabaseAnonKey, options);
}

/**
 * Create a Supabase client with service role key (bypasses RLS)
 * Use only on the backend for admin operations like aggregating all picks
 */
export function createServiceRoleClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Service role key not configured, falling back to anon client');
    return createSupabaseClient();
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Extract access token from Authorization header
 * @param {object} headers - Request headers
 */
export function getAccessToken(headers) {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Get authenticated user from request
 * @param {object} headers - Request headers
 */
export async function getAuthenticatedUser(headers) {
  const accessToken = getAccessToken(headers);
  if (!accessToken) {
    return { user: null, supabase: null };
  }

  const supabase = createSupabaseClient(accessToken);
  if (!supabase) {
    return { user: null, supabase: null };
  }

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase };
  }

  return { user, supabase };
}

/**
 * Check if user is admin
 * @param {object} supabase - Supabase client
 * @param {string} userId - User ID
 */
export async function isAdmin(supabase, userId) {
  if (!supabase || !userId) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();

  if (error) return false;
  return data?.is_admin === true;
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured() {
  return !!(supabaseUrl && supabaseAnonKey);
}

/**
 * Get user's profile
 * @param {object} supabase - Supabase client
 * @param {string} userId - User ID
 */
export async function getProfile(supabase, userId) {
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get all profiles for leaderboard
 * @param {object} supabase - Supabase client
 */
export async function getAllProfiles(supabase) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('name');

  if (error) return [];
  return data;
}

/**
 * Get user's picks
 * @param {object} supabase - Supabase client
 * @param {string} userId - User ID
 */
export async function getUserPicks(supabase, userId, tournamentKey) {
  if (!supabase || !userId) return [];

  let query = supabase
    .from('picks')
    .select('*')
    .eq('user_id', userId);

  if (tournamentKey) {
    query = query.eq('tournament_key', tournamentKey);
  }

  const { data, error } = await query;

  if (error) return [];
  return data;
}

/**
 * Get all picks (respects RLS - only visible picks returned)
 * @param {object} supabase - Supabase client
 */
export async function getAllPicks(supabase, tournamentKey) {
  if (!supabase) return [];

  // Simple query without join - the join might fail if foreign key isn't set up
  let query = supabase
    .from('picks')
    .select('*');

  if (tournamentKey) {
    query = query.eq('tournament_key', tournamentKey);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching picks:', error.message, error.details, error.hint);
    return [];
  }

  console.log('DEBUG getAllPicks: raw data count:', data?.length, 'first item:', data?.[0]);
  return data;
}

/**
 * Save a pick (validates game hasn't started)
 * @param {object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {string} gameId - Game ID
 * @param {number} teamAScore - Team A score prediction
 * @param {number} teamBScore - Team B score prediction
 * @param {Date} gameStartTime - When the game starts
 */
export async function savePick(supabase, userId, gameId, teamAScore, teamBScore, gameStartTime, tournamentKey) {
  if (!supabase || !userId) {
    throw new Error('Not authenticated');
  }

  // Check if game has started
  if (gameStartTime && new Date(gameStartTime) <= new Date()) {
    throw new Error('Cannot modify picks after game has started');
  }

  const { data, error } = await supabase
    .from('picks')
    .upsert(
      {
        user_id: userId,
        game_id: gameId,
        team_a_score: teamAScore,
        team_b_score: teamBScore,
        tournament_key: tournamentKey || 'mens_ice_hockey',
      },
      {
        onConflict: 'tournament_key,user_id,game_id',
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a pick (validates game hasn't started)
 * @param {object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {string} gameId - Game ID
 * @param {Date} gameStartTime - When the game starts
 */
export async function deletePick(supabase, userId, gameId, gameStartTime, tournamentKey) {
  if (!supabase || !userId) {
    throw new Error('Not authenticated');
  }

  // Check if game has started
  if (gameStartTime && new Date(gameStartTime) <= new Date()) {
    throw new Error('Cannot modify picks after game has started');
  }

  const { error } = await supabase
    .from('picks')
    .delete()
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .eq('tournament_key', tournamentKey || 'mens_ice_hockey');

  if (error) throw error;
}

/**
 * Get all invites (admin only)
 * @param {object} supabase - Supabase client
 */
export async function getInvites(supabase) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return [];
  return data;
}

/**
 * Create an invite (admin only)
 * @param {object} supabase - Supabase client
 * @param {string} email - Email to invite
 * @param {string} invitedBy - Admin user ID
 */
export async function createInvite(supabase, email, invitedBy) {
  if (!supabase) throw new Error('Supabase not configured');

  // Generate invite code
  const { data: inviteCode, error: codeError } = await supabase
    .rpc('generate_invite_code');

  if (codeError) throw codeError;

  const { data, error } = await supabase
    .from('invites')
    .insert({
      email,
      invite_code: inviteCode,
      invited_by: invitedBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete an invite (admin only)
 * Uses service role client to bypass RLS
 * @param {string} inviteId - Invite ID
 * @param {boolean} allowUsed - Whether to allow deleting used invites
 */
export async function deleteInvite(inviteId, allowUsed = false) {
  const serviceClient = createServiceRoleClient();
  if (!serviceClient) throw new Error('Service role not configured');

  let query = serviceClient
    .from('invites')
    .delete()
    .eq('id', inviteId);

  // Only restrict to unused invites if allowUsed is false
  if (!allowUsed) {
    query = query.eq('used', false);
  }

  const { error } = await query;

  if (error) throw error;
}

/**
 * Delete a user and their data (admin only)
 * Requires service role to delete from auth.users
 * @param {string} userId - User ID to delete
 */
export async function deleteUser(userId) {
  const serviceClient = createServiceRoleClient();
  if (!serviceClient) throw new Error('Service role not configured');

  // First, delete user's picks
  const { error: picksError } = await serviceClient
    .from('picks')
    .delete()
    .eq('user_id', userId);

  if (picksError) {
    console.error('Error deleting user picks:', picksError);
  }

  // Delete user's profile
  const { error: profileError } = await serviceClient
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileError) {
    console.error('Error deleting user profile:', profileError);
  }

  // Update any invites used by this user
  const { error: inviteError } = await serviceClient
    .from('invites')
    .update({ used_by: null })
    .eq('used_by', userId);

  if (inviteError) {
    console.error('Error updating invites:', inviteError);
  }

  // Finally, delete from auth.users
  const { error: authError } = await serviceClient.auth.admin.deleteUser(userId);

  if (authError) throw authError;
}

export default createSupabaseClient;
