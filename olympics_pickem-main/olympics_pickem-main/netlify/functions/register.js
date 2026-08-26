import { jsonResponse, errorResponse, corsHeaders } from './utils/response.js';
import { createServiceRoleClient, isSupabaseConfigured } from './utils/supabase.js';

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  // Check if Supabase is configured
  if (!isSupabaseConfigured()) {
    return errorResponse('Database not configured', 503);
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { email, password, name, inviteCode } = body;

  // Validation
  if (!email || typeof email !== 'string') {
    return errorResponse('email is required', 400);
  }

  if (!password || typeof password !== 'string') {
    return errorResponse('password is required', 400);
  }

  if (password.length < 6) {
    return errorResponse('Password must be at least 6 characters', 400);
  }

  if (!name || typeof name !== 'string') {
    return errorResponse('name is required', 400);
  }

  if (!inviteCode || typeof inviteCode !== 'string') {
    return errorResponse('inviteCode is required', 400);
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return errorResponse('Invalid email format', 400);
  }

  try {
    const serviceClient = createServiceRoleClient();
    if (!serviceClient) {
      return errorResponse('Service role not configured', 503);
    }

    const normalizedEmail = email.toLowerCase();
    const normalizedInviteCode = inviteCode.trim().toUpperCase();

    // Validate invite code (and that it hasn't been used/expired)
    const { data: inviteData, error: inviteError } = await serviceClient
      .rpc('validate_invite_code', { code: normalizedInviteCode });

    if (inviteError) {
      console.error('Invite validation error:', inviteError);
      return errorResponse('Failed to validate invite code', 500);
    }

    if (!inviteData || inviteData.length === 0) {
      return errorResponse('Invalid or expired invite code', 400);
    }

    const invite = inviteData[0];
    if (invite?.email && invite.email.toLowerCase() !== normalizedEmail) {
      return errorResponse('Invite code does not match this email', 400);
    }

    // Create user using admin API (bypasses email confirmation)
    const { data: userData, error: createError } = await serviceClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: { name },
    });

    if (createError) {
      // Handle duplicate email error
      if (createError.message?.includes('already been registered') || createError.code === 'email_exists') {
        return errorResponse('An account with this email already exists', 409);
      }
      throw createError;
    }

    if (!userData?.user?.email_confirmed_at) {
      const { error: confirmError } = await serviceClient.auth.admin.updateUserById(
        userData.user.id,
        { email_confirm: true }
      );
      if (confirmError) {
        console.error('Error confirming email:', confirmError);
      }
    }

    // The profile should be created by a database trigger, but let's verify/create it
    const { error: profileError } = await serviceClient
      .from('profiles')
      .upsert({
        id: userData.user.id,
        name,
        is_admin: false,
      }, {
        onConflict: 'id',
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Don't fail the registration, the trigger might have created it
    }

    const { error: inviteUseError } = await serviceClient
      .rpc('mark_invite_used', { code: normalizedInviteCode, user_uuid: userData.user.id });

    if (inviteUseError) {
      console.error('Error marking invite used:', inviteUseError);
    }

    return jsonResponse({
      success: true,
      user: {
        id: userData.user.id,
        email: userData.user.email,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse(error.message || 'Failed to create account');
  }
}
