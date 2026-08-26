-- Tournament key isolation for men’s vs women’s tournaments
-- Run in Supabase SQL editor before deploying code changes.

-- 1) Add tournament_key column with default
ALTER TABLE picks
  ADD COLUMN IF NOT EXISTS tournament_key TEXT NOT NULL DEFAULT 'mens_ice_hockey';

ALTER TABLE games_cache
  ADD COLUMN IF NOT EXISTS tournament_key TEXT NOT NULL DEFAULT 'mens_ice_hockey';

-- 2) Backfill existing rows (no-op if default already applied)
UPDATE picks SET tournament_key = 'mens_ice_hockey' WHERE tournament_key IS NULL;
UPDATE games_cache SET tournament_key = 'mens_ice_hockey' WHERE tournament_key IS NULL;

-- 3) Adjust uniqueness / primary keys
DO $$
BEGIN
  -- picks unique on user + game + tournament
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picks_user_id_game_id_key') THEN
    ALTER TABLE picks DROP CONSTRAINT picks_user_id_game_id_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picks_user_game_tournament_key') THEN
    ALTER TABLE picks ADD CONSTRAINT picks_user_game_tournament_key UNIQUE (tournament_key, user_id, game_id);
  END IF;
END$$;

DO $$
BEGIN
  -- games_cache primary key to include tournament
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_cache_pkey') THEN
    ALTER TABLE games_cache DROP CONSTRAINT games_cache_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_cache_tournament_game_pkey') THEN
    ALTER TABLE games_cache ADD CONSTRAINT games_cache_tournament_game_pkey PRIMARY KEY (tournament_key, game_id);
  END IF;
END$$;

-- 4) Indexes to keep lookups fast
CREATE INDEX IF NOT EXISTS idx_picks_tournament_game ON picks (tournament_key, game_id);
CREATE INDEX IF NOT EXISTS idx_games_cache_tournament_status ON games_cache (tournament_key, status);

-- 5) RLS policy tweak: ensure tournament matches when checking game start
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can view others picks after game starts') THEN
    DROP POLICY "Users can view others picks after game starts" ON picks;
  END IF;
END$$;

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

-- 6) Verify
-- SELECT tournament_key, COUNT(*) FROM picks GROUP BY 1;
-- SELECT tournament_key, COUNT(*) FROM games_cache GROUP BY 1;
