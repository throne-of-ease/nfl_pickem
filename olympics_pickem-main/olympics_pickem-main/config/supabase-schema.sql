-- Olympics Pick'em Supabase Schema
-- Run this in Supabase SQL Editor to set up the database

-- ===========================================
-- PROFILES TABLE
-- Extended user data (auth.users handles email/password)
-- ===========================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INVITES TABLE
-- Invite-only registration system
-- ===========================================
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id),
  used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create index for faster lookups
CREATE INDEX idx_invites_code ON invites(invite_code);
CREATE INDEX idx_invites_email ON invites(email);

-- ===========================================
-- PICKS TABLE
-- User predictions for games
-- ===========================================
CREATE TABLE picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  game_id TEXT NOT NULL,  -- ESPN event ID
  tournament_key TEXT NOT NULL DEFAULT 'mens_ice_hockey',
  team_a_score INTEGER NOT NULL CHECK (team_a_score >= 0),
  team_b_score INTEGER NOT NULL CHECK (team_b_score >= 0),
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0.5 AND confidence <= 1.0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_key, user_id, game_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_picks_user ON picks(user_id);
CREATE INDEX idx_picks_game ON picks(game_id);
CREATE INDEX idx_picks_tournament_game ON picks(tournament_key, game_id);

-- ===========================================
-- GAMES CACHE TABLE (optional)
-- Cache ESPN game data to reduce API calls
-- ===========================================
CREATE TABLE games_cache (
  tournament_key TEXT NOT NULL DEFAULT 'mens_ice_hockey',
  game_id TEXT NOT NULL,
  game_data JSONB NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,  -- 'scheduled', 'in_progress', 'completed'
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tournament_key, game_id)
);

CREATE INDEX idx_games_status ON games_cache(status);
CREATE INDEX idx_games_scheduled ON games_cache(scheduled_at);
CREATE INDEX idx_games_cache_tournament_status ON games_cache(tournament_key, status);

-- ===========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE games_cache ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------
-- PROFILES POLICIES
-- -------------------------------------------

-- Anyone can read profiles (for leaderboard display names)
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles are created via trigger (see below)
CREATE POLICY "Profiles are created via trigger"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- -------------------------------------------
-- INVITES POLICIES
-- -------------------------------------------

-- Only admins can view invites
CREATE POLICY "Admins can view invites"
  ON invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = TRUE
    )
  );

-- Only admins can create invites
CREATE POLICY "Admins can create invites"
  ON invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = TRUE
    )
  );

-- Anyone can check their own invite (for registration)
-- This is handled by a function, not direct access

-- -------------------------------------------
-- PICKS POLICIES
-- -------------------------------------------

-- Users can view their own picks anytime
CREATE POLICY "Users can view own picks"
  ON picks FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view others' picks only for games that have started
-- (game_started check is done in application layer via games_cache)
CREATE POLICY "Users can view others picks after game starts"
  ON picks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games_cache
      WHERE games_cache.game_id = picks.game_id
        AND games_cache.tournament_key = picks.tournament_key
        AND games_cache.scheduled_at <= NOW()
    )
  );

-- Users can insert their own picks (game not started check in app)
CREATE POLICY "Users can insert own picks"
  ON picks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own picks (game not started check in app)
CREATE POLICY "Users can update own picks"
  ON picks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own picks
CREATE POLICY "Users can delete own picks"
  ON picks FOR DELETE
  USING (auth.uid() = user_id);

-- -------------------------------------------
-- GAMES CACHE POLICIES
-- -------------------------------------------

-- Everyone can read games cache
CREATE POLICY "Games cache is public"
  ON games_cache FOR SELECT
  USING (true);

-- Only service role can modify (done via backend)
-- No insert/update/delete policies for anon users

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to validate invite code during registration
CREATE OR REPLACE FUNCTION validate_invite_code(code TEXT)
RETURNS TABLE (
  valid BOOLEAN,
  email TEXT,
  invite_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE as valid,
    i.email,
    i.id as invite_id
  FROM invites i
  WHERE i.invite_code = code
    AND i.used = FALSE
    AND (i.expires_at IS NULL OR i.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark invite as used
CREATE OR REPLACE FUNCTION mark_invite_used(code TEXT, user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE invites
  SET used = TRUE,
      used_by = user_uuid,
      used_at = NOW()
  WHERE invite_code = code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate random invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New Player')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_picks_updated_at
  BEFORE UPDATE ON picks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- PERMISSIONS FOR ANONYMOUS USERS
-- Required for registration flow (validate invite before authenticated)
-- ===========================================
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION mark_invite_used(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION generate_invite_code() TO authenticated;

-- ===========================================
-- INITIAL ADMIN SETUP
-- After first user registers, run this to make them admin:
-- UPDATE profiles SET is_admin = TRUE
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
-- ===========================================
