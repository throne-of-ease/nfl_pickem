/**
 * Admin endpoint to manually override game results for testing
 *
 * POST /api/admin-game-override
 * Body: {
 *   gameId: "401845001",
 *   scoreA: 5,
 *   scoreB: 3,
 *   status: "final" | "in_progress" | "scheduled"
 * }
 *
 * GET /api/admin-game-override
 * Returns current overrides
 *
 * DELETE /api/admin-game-override
 * Body: { gameId: "401845001" } - Remove single override
 * Body: { clearAll: true } - Clear all overrides
 *
 * Overrides are stored in memory (reset on function cold start)
 * For persistent storage, use Supabase games_cache table
 */

import { jsonResponse, errorResponse, corsHeaders } from './utils/response.js';

// In-memory store for game overrides (resets on cold start)
// In production, you'd want to use Supabase for persistence
const gameOverrides = new Map();

// Simple admin key check (in production, use proper auth)
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key-2026';

function isAuthorized(event) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  const apiKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];

  // Check Bearer token or API key
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) === ADMIN_KEY;
  }
  return apiKey === ADMIN_KEY;
}

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // Check authorization
  if (!isAuthorized(event)) {
    return errorResponse('Unauthorized - provide X-Admin-Key header', 401);
  }

  try {
    switch (event.httpMethod) {
      case 'GET':
        return handleGet();

      case 'POST':
        return handlePost(event);

      case 'DELETE':
        return handleDelete(event);

      default:
        return errorResponse('Method not allowed', 405);
    }
  } catch (error) {
    console.error('Admin game override error:', error);
    return errorResponse(error.message);
  }
}

function handleGet() {
  const overrides = Object.fromEntries(gameOverrides);
  return jsonResponse({
    message: 'Current game overrides',
    count: gameOverrides.size,
    overrides,
    usage: {
      set: 'POST with { gameId, scoreA, scoreB, status }',
      remove: 'DELETE with { gameId } or { clearAll: true }',
    }
  });
}

function handlePost(event) {
  const body = JSON.parse(event.body || '{}');
  const { gameId, scoreA, scoreB, status } = body;

  if (!gameId) {
    return errorResponse('gameId is required', 400);
  }

  if (scoreA === undefined || scoreB === undefined) {
    return errorResponse('scoreA and scoreB are required', 400);
  }

  if (typeof scoreA !== 'number' || typeof scoreB !== 'number') {
    return errorResponse('scoreA and scoreB must be numbers', 400);
  }

  if (scoreA < 0 || scoreB < 0) {
    return errorResponse('Scores cannot be negative', 400);
  }

  const validStatuses = ['final', 'in_progress', 'scheduled'];
  const gameStatus = status || 'final';
  if (!validStatuses.includes(gameStatus)) {
    return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
  }

  const override = {
    gameId,
    scoreA,
    scoreB,
    status: gameStatus,
    result: getResult(scoreA, scoreB),
    createdAt: new Date().toISOString(),
  };

  gameOverrides.set(gameId, override);

  return jsonResponse({
    message: 'Game override saved',
    override,
    totalOverrides: gameOverrides.size,
  });
}

function handleDelete(event) {
  const body = JSON.parse(event.body || '{}');

  if (body.clearAll) {
    const count = gameOverrides.size;
    gameOverrides.clear();
    return jsonResponse({
      message: 'All overrides cleared',
      clearedCount: count,
    });
  }

  if (body.gameId) {
    const existed = gameOverrides.has(body.gameId);
    gameOverrides.delete(body.gameId);
    return jsonResponse({
      message: existed ? 'Override removed' : 'Override not found',
      gameId: body.gameId,
      removed: existed,
    });
  }

  return errorResponse('Provide gameId or clearAll: true', 400);
}

function getResult(scoreA, scoreB) {
  if (scoreA > scoreB) return 'win_a';
  if (scoreB > scoreA) return 'win_b';
  return 'tie';
}

// Export overrides getter for use by games.js
export function getGameOverrides() {
  return gameOverrides;
}
