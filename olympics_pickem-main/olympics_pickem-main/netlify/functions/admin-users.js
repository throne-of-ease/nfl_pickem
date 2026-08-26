import { jsonResponse, errorResponse, corsHeaders } from './utils/response.js';
import {
  getAuthenticatedUser,
  isAdmin,
  getAllProfiles,
  deleteUser,
  isSupabaseConfigured,
} from './utils/supabase.js';

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // Check if Supabase is configured
  if (!isSupabaseConfigured()) {
    return errorResponse('Database not configured', 503);
  }

  try {
    // Get authenticated user
    const { user, supabase } = await getAuthenticatedUser(event.headers);

    if (!user) {
      return errorResponse('Authentication required', 401);
    }

    // Check admin status
    const userIsAdmin = await isAdmin(supabase, user.id);
    if (!userIsAdmin) {
      return errorResponse('Admin access required', 403);
    }

    // Route to appropriate handler
    switch (event.httpMethod) {
      case 'GET':
        return handleGetUsers(supabase);
      case 'DELETE':
        return handleDeleteUser(event, user);
      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error) {
    console.error('Admin users API error:', error);
    return errorResponse(error.message);
  }
}

/**
 * GET /api/admin-users - Get all users (admin only)
 */
async function handleGetUsers(supabase) {
  const users = await getAllProfiles(supabase);

  return jsonResponse({
    users,
  });
}

/**
 * DELETE /api/admin-users - Delete a user (admin only)
 * Query params: id
 */
async function handleDeleteUser(event, currentUser) {
  const params = event.queryStringParameters || {};
  const { id } = params;

  if (!id) {
    return errorResponse('id is required', 400);
  }

  // Prevent admin from deleting themselves
  if (id === currentUser.id) {
    return errorResponse('Cannot delete your own account', 400);
  }

  try {
    await deleteUser(id);

    return jsonResponse({
      success: true,
      deleted: id,
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}
