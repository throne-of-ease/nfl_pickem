# Olympic Hockey Pick'em

A pick'em application for the 2026 Milan-Cortina Olympic Men's Ice Hockey Tournament. Players can submit predictions via CSV or the in-app pick form, and the app tracks their scores against actual results from ESPN APIs.

## Tech Stack

- **Frontend**: React (Vite) with functional components/hooks
- **Backend**: Netlify Functions
- **Database**: Supabase (PostgreSQL)
- **Styling**: CSS Modules + CSS Variables

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Netlify CLI (`npm install -g netlify-cli`)
- Supabase account

### 1. Clone and Install

```bash
cd olympics_pickem
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor and run `config/supabase-schema.sql` to create tables
3. Optionally run `data/seed-data.sql` to add sample data

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (public)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
- `ADMIN_SECRET` - Secret token for admin authentication

### 4. Run Locally

```bash
# Start development server with Netlify Functions
netlify dev
```

The app will be available at http://localhost:8888

### 5. Deploy to Netlify

```bash
# Link to Netlify
netlify link

# Set environment variables
netlify env:set VITE_SUPABASE_URL "your-url"
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"
netlify env:set SUPABASE_SERVICE_ROLE_KEY "your-service-key"
netlify env:set ADMIN_SECRET "your-admin-secret"

# Deploy
netlify deploy --prod
```

## Project Structure

```
olympics_pickem/
├── src/
│   ├── components/
│   │   ├── common/        # Button, Card, Loading, Modal
│   │   ├── game/          # GameCard, GameList, GameFilters
│   │   ├── leaderboard/   # Leaderboard, PlayerScoreCard, TournamentProgress
│   │   ├── admin/         # AdminPanel, CsvUploader, PicksManager
│   │   └── layout/        # Header, Navigation, Footer
│   ├── hooks/             # useGames, useLeaderboard, usePolling
│   ├── services/          # espnApi, csvProcessor, scoring, supabase
│   ├── pages/             # GamesPage, LeaderboardPage, AdminPage
│   └── context/           # AppContext for state
├── netlify/functions/     # API endpoints
├── config/scoring.json    # Scoring configuration
└── data/                  # Sample CSVs, mock ESPN responses, SQL schemas
```

## Testing Notes

- Scoring integration tests rely on mock fixtures in `public/data/mock-games.json` and `public/data/picks/*.csv`.
- If you regenerate fixtures, keep game IDs aligned with the test expectations in `src/services/__tests__/scoring-integration.test.js`.

## Scoring Rules

Points awarded for correct **result only** (win/loss/tie):
- Group stage: 1 point
- Knockout round: 2 points
- Medal round: 3 points

## CSV Format for Player Picks

```csv
game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,4,USA,3
```

## Admin Panel

Access the admin panel at `/admin`. Features:
- Upload player picks via CSV
- View and delete player picks
- Trigger ESPN data sync
- Manually override game results

## Registration & Picks UX

- Registration is invite-only (invite code required).
- Picks auto-submit when a team and confidence are selected (manual submit remains as fallback).
- Scores display rounded to 1 decimal place across the UI.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/games | List games with picks (visibility enforced) |
| GET | /api/leaderboard | Current scores for all players |
| GET | /api/standings | Tournament standings from ESPN |
| POST | /api/admin-upload | Upload player CSV (requires auth) |
| POST | /api/admin-sync | Trigger ESPN refresh (requires auth) |
| POST | /api/admin-override | Manual result override (requires auth) |
| GET/DELETE | /api/admin-picks | Manage player picks (requires auth) |

## ESP API Integration

The app fetches data from ESPN's public API:
- Scoreboard: Game schedule and live scores
- Teams: Team information and logos
- Standings: Tournament standings

Automatic sync runs every 5 minutes via Netlify scheduled functions.
