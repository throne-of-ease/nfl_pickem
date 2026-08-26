import { jsonResponse, errorResponse, corsHeaders } from './utils/response.js';
import {
  getAuthenticatedUser,
  getUserPicks,
  savePick,
  deletePick,
  isSupabaseConfigured,
} from './utils/supabase.js';
import { getActiveTournamentKey } from './utils/tournamentConfig.js';

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
    const tournamentKey = getActiveTournamentKey();

    // Get authenticated user
    const { user, supabase } = await getAuthenticatedUser(event.headers);

    if (!user) {
      return errorResponse('Authentication required', 401);
    }

    // Route to appropriate handler
    switch (event.httpMethod) {
      case 'GET':
        return handleGetPicks(supabase, user, tournamentKey);
      case 'POST':
      case 'PUT':
        return handleSavePick(event, supabase, user, tournamentKey);
      case 'DELETE':
        return handleDeletePick(event, supabase, user, tournamentKey);
      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error) {
    console.error('Picks API error:', error);
    return errorResponse(error.message);
  }
}

/**
 * GET /api/picks - Get user's picks
 */
async function handleGetPicks(supabase, user, tournamentKey) {
  const picks = await getUserPicks(supabase, user.id, tournamentKey);

  return jsonResponse({
    picks,
    userId: user.id,
  });
}

/**
 * POST/PUT /api/picks - Save or update a pick
 * Body: { gameId, teamAScore, teamBScore, gameStartTime }
 */
async function handleSavePick(event, supabase, user, tournamentKey) {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { gameId, teamAScore, teamBScore, gameStartTime } = body;

  // Validate required fields
  if (!gameId) {
    return errorResponse('gameId is required', 400);
  }

  if (typeof teamAScore !== 'number' || typeof teamBScore !== 'number') {
    return errorResponse('teamAScore and teamBScore must be numbers', 400);
  }

  if (teamAScore < 0 || teamBScore < 0) {
    return errorResponse('Scores cannot be negative', 400);
  }

  try {
    const pick = await savePick(
      supabase,
      user.id,
      gameId,
      teamAScore,
      teamBScore,
      gameStartTime,
      tournamentKey
    );

    return jsonResponse({
      success: true,
      pick,
    });
  } catch (error) {
    if (error.message.includes('game has started')) {
      return errorResponse('Cannot modify picks after game has started', 403);
    }
    throw error;
  }
}

/**
 * DELETE /api/picks - Delete a pick
 * Query params: gameId, gameStartTime
 */
async function handleDeletePick(event, supabase, user, tournamentKey) {
  const params = event.queryStringParameters || {};
  const { gameId, gameStartTime } = params;

  if (!gameId) {
    return errorResponse('gameId is required', 400);
  }

  try {
    await deletePick(supabase, user.id, gameId, gameStartTime, tournamentKey);

    return jsonResponse({
      success: true,
      deleted: gameId,
    });
  } catch (error) {
    if (error.message.includes('game has started')) {
      return errorResponse('Cannot modify picks after game has started', 403);
    }
    throw error;
  }
}
