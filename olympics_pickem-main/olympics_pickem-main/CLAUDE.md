# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Olympic Men's Ice Hockey Tournament Pick'em application. Players submit predictions and the app tracks their scores against actual results from ESPN APIs. Uses Brier scoring with confidence points for pick accuracy.

## Tech Stack

- **Frontend**: React + Vite (functional components, hooks)
- **Backend**: Netlify Functions
- **Database**: Supabase (PostgreSQL with RLS)
- **Deployment**: Netlify
- **Testing**: Vitest + Testing Library

## Development Commands

```bash
# Start dev server (Vite on :5173, proxied through Netlify on :8888)
npm run dev              # Runs netlify dev (includes functions)
npm run dev:vite         # Vite only (no backend functions)

# Testing
npm test                 # Watch mode
npm run test:run         # Single run
npm run test:coverage    # With coverage

# Build
npm run build            # Vite build to dist/
npm run preview          # Preview production build

# Deployment
netlify deploy --prod
```

## Architecture Overview

### State Management
- **AppContext** (`src/context/AppContext.jsx`) - Tournament data, games, picks, leaderboard
  - Manages localStorage cache (1min TTL)
  - Provides `refresh()` and `clearCacheAndRefresh()` methods
  - Handles `includeLiveGames` setting for live score updates
- **AuthContext** (`src/context/AuthContext.jsx`) - User authentication & profiles
  - Wraps Supabase auth with React state
  - Auto-loads user profile on sign-in

### Backend Authentication Pattern
All Netlify Functions use this pattern:
```javascript
import { getAuthenticatedUser, createServiceRoleClient } from './utils/supabase.js';

// For user-scoped operations (RLS enforced)
const { user, supabase } = await getAuthenticatedUser(event.headers);

// For admin operations (bypasses RLS)
const serviceClient = createServiceRoleClient();
```

**Key distinction:**
- User client: Respects Row Level Security, scoped to authenticated user
- Service role client: Admin operations, bypasses RLS (leaderboard aggregation, invite management)

### Recent UX Notes
- Registration is invite-only; `/.netlify/functions/register` validates invite codes and auto-confirms emails.
- Picks auto-submit when team + confidence are set (debounced); manual submit remains as fallback.
- Scores and points display rounded to 1 decimal place.

## Scoring System

Uses **Brier scoring** with confidence points:
- Players assign confidence (1-10) to each pick
- Brier score: `confidence² × (1 - correct)` (lower is better)
- Final score: `1000 - sum(brier_scores)` (higher is better)
- Perfect picks with max confidence = 1000 points

Round multipliers in `config/scoring.json`:
- Group stage: 1x
- Knockout: 2x
- Medal round: 3x

### Key Service Modules

**services/scoring.js** - Core scoring logic
- `getResult(scoreA, scoreB)` - Returns 'win_a' | 'win_b' | 'tie'
- `calculatePickScore(pick, game, config)` - Individual pick Brier score
- `calculatePlayerScore(picks, games, config)` - Total player score
- `calculateLeaderboard(games, players, config)` - Full standings

**services/leaderboardCalculator.js** - Client-side wrapper
- `calculateLeaderboard(games, picks, profiles, options)` - Client version
- `enrichGamesWithPicks(games, picks, userId)` - Merge picks into games (respects visibility)

**services/espnApi.js** - External API integration
- `fetchSchedule(dateRange)` - Game schedule and live scores
- `fetchGameSummary(eventId)` - Detailed completed game results
- `fetchTeams()`, `fetchStandings()` - Tournament metadata

**services/csvProcessor.js** - Pick import/export
- `parsePlayerPicksCSV(csvData)` - Parse CSV picks
- `validatePicks(picks, games, teams)` - Validation against ESPN data
- `transformPicksToDatabase(picks, userId)` - Format for Supabase

**services/supabase.js** - Database operations
- `auth` - Sign in/up, session management, uses backend `/api/register` to bypass email confirmation
- `picks` - CRUD for user picks (RLS enforced)
- `profiles` - User profiles and admin status
- `games` - Game data sync

## Pick Visibility Logic

**Critical business rule**: Picks are hidden until game start time
- Enforced in RLS policies (`picks` table)
- `enrichGamesWithPicks()` filters based on `game.date` vs `now()`
- Leaderboard only scores completed/in-progress games (never future games)

## API Endpoints

All routes use `/api/*` → `/.netlify/functions/*` proxy:

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/tournament-data` | GET | Games + picks + leaderboard (one call) | Optional |
| `/api/picks` | GET/POST/PUT/DELETE | User pick CRUD | Required |
| `/api/invites` | GET/POST/DELETE | Invite management | Admin |
| `/api/register` | POST | Sign up (bypasses email confirmation) | None |
| `/api/admin-users` | GET/PUT | User management | Admin |
| `/api/admin-game-override` | POST | Manual game result override | Admin |

## Database Schema (Supabase)

**profiles** - User accounts
- `id` (uuid, FK to auth.users)
- `name`, `email`, `is_admin`, `display_order`
- RLS: Users see all profiles, only admins modify

**picks** - Player predictions
- `id`, `user_id`, `game_id`, `team_a_score`, `team_b_score`, `confidence` (1-10)
- RLS: Users CRUD own picks, read others' picks only after game starts

**invites** - Registration invite codes
- `id`, `email`, `code`, `invited_by`, `used_at`, `used_by`
- RLS: Users see invites they created/used, admins see all

**games** - Cached ESPN game data
- `espn_id`, `date`, `team_a`, `team_b`, `scores`, `status`, `round`
- Synced from ESPN API, manual overrides stored in `override_*` fields

## Testing Notes

- Tests use Vitest with jsdom environment
- Setup in `src/test/setup.js`
- Mock data in `public/data/mock-games.json` and `public/data/picks/*.csv`
- Scoring integration tests in `src/services/__tests__/scoring-integration.test.js`
- Keep mock game IDs aligned with test expectations when regenerating fixtures

## ESPN API Integration

Base URL: `https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey`
- `/scoreboard?dates=20260211-20260222` - Schedule + live scores
- `/summary?event={EVENT_ID}` - Detailed results
- `/teams`, `/standings` - Tournament metadata

Data sync handled by `tournament-data` function (called by frontend polling)
