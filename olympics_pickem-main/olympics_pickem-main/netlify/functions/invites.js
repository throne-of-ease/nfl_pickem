import { jsonResponse, errorResponse, corsHeaders } from './utils/response.js';
import {
  getAuthenticatedUser,
  isAdmin,
  getInvites,
  createInvite,
  deleteInvite,
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
        return handleGetInvites(supabase);
      case 'POST':
        return handleCreateInvite(event, supabase, user);
      case 'DELETE':
        return handleDeleteInvite(event);
      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error) {
    console.error('Invites API error:', error);
    return errorResponse(error.message);
  }
}

/**
 * GET /api/invites - Get all invites (admin only)
 */
async function handleGetInvites(supabase) {
  const invites = await getInvites(supabase);

  return jsonResponse({
    invites,
  });
}

/**
 * POST /api/invites - Create a new invite (admin only)
 * Body: { email }
 */
async function handleCreateInvite(event, supabase, user) {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { email } = body;

  if (!email || typeof email !== 'string') {
    return errorResponse('email is required', 400);
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return errorResponse('Invalid email format', 400);
  }

  try {
    const invite = await createInvite(supabase, email.toLowerCase(), user.id);

    return jsonResponse({
      success: true,
      invite,
    });
  } catch (error) {
    if (error.code === '23505') {
      return errorResponse('An invite for this email already exists', 409);
    }
    throw error;
  }
}

/**
 * DELETE /api/invites - Delete an invite (admin only)
 * Query params: id, allowUsed (optional, to delete used invites)
 */
async function handleDeleteInvite(event) {
  const params = event.queryStringParameters || {};
  const { id, allowUsed } = params;

  if (!id) {
    return errorResponse('id is required', 400);
  }

  try {
    await deleteInvite(id, allowUsed === 'true');

    return jsonResponse({
      success: true,
      deleted: id,
    });
  } catch (error) {
    throw error;
  }
}
