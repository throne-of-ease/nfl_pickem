/**
 * Utility functions for Netlify functions
 * Note: Supabase has been removed - using static CSV files instead
 */

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

export function jsonResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
    body: JSON.stringify(data),
  };
}

export function errorResponse(message, statusCode = 500) {
  return jsonResponse({ error: message }, statusCode);
}
