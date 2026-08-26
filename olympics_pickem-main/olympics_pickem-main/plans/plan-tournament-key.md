# Plan: Tournament Key Isolation with Config Toggle (Women/Men)

## Summary
Add a `tournament_key` dimension across storage, APIs, and ESPN integration so women’s and men’s tournaments stay isolated while sharing the same Supabase project. A config toggle switches endpoints/date ranges without code edits.

## Scope
- In: Supabase schema migration, API filtering/writes, ESPN endpoint/date range switch, env/config, overrides/mocks alignment, tests.
- Out: New Supabase project; unrelated UI features.

## Design Decisions
- Tournament keys: `mens_ice_hockey` (default), `womens_ice_hockey`.
- Env: `VITE_TOURNAMENT_KEY` (client), `TOURNAMENT_KEY` (functions).
- ESPN bases: men `olympics-mens-ice-hockey`, women `olympics-womens-ice-hockey`.
- Date ranges stored per tournament config (women range provisional: Feb 6–20, 2026).

## Schema Changes (Supabase)
- Add `tournament_key TEXT NOT NULL DEFAULT 'mens_ice_hockey'` to `picks`, `games_cache`.
- Backfill existing rows to default.
- Constraints: unique `(tournament_key, user_id, game_id)` on picks; PK `(tournament_key, game_id)` on games_cache.
- Indexes: `idx_picks_tournament_game`, `idx_games_cache_tournament_status`.
- RLS: viewing others’ picks joins `games_cache` on both `tournament_key` and `game_id`.
- Migration file: `config/migrations/20260205_tournament_key.sql`.

## Configuration
- `.env.example`: add `VITE_TOURNAMENT_KEY`, `TOURNAMENT_KEY`.
- New configs: `src/config/tournamentConfig.js`, `netlify/functions/utils/tournamentConfig.js` with base URLs/date ranges and helpers.

## Application Changes (Server)
- `netlify/functions/tournament-data.js`: use tournament config for ESPN base/date; pass tournament key into picks load; keep overrides intact.
- `netlify/functions/picks.js`: scope all pick operations by tournament key.
- `netlify/functions/utils/supabase.js`: filter selects by tournament key; write tournament_key; conflict on `(tournament_key,user_id,game_id)`.
- `netlify/functions/utils/pickLoader.js`: accept tournament key; filter picks from Supabase.

## Application Changes (Client)
- `src/services/espnApi.js`: derive base URL/date range from `VITE_TOURNAMENT_KEY`.
- `src/context/AppContext.jsx`: use default schedule (tournament-config-driven) instead of hardcoded range.

## Testing
- Update ESPN API tests to continue asserting men’s URL/date by default; add cases for config-driven URLs as needed.
- Add/extend backend unit tests to ensure tournament_key filtering and writes.

## Acceptance Criteria
- Toggling env keys switches ESPN endpoint and date range with no code edits.
- Men’s data unchanged after migration; women’s data stays isolated.
- Picks uniqueness enforced per tournament.
- RLS still blocks viewing others’ picks pre-start, using matching tournament.
