# Olympic Men's Ice Hockey Tournament Scoring & Tracking App
## Complete Web Application Specification (Adjusted for CSV-Based Picks)

---

## CORE FEATURES

### 1. Tournament Management
- Cover the entire Olympic men's ice hockey tournament (group stage through finals)
- **PRIMARY METHOD**: Use ESPN API to fetch tournament data

#### ESPN API Endpoints to Use:
- **Schedule**: `https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey/scoreboard?dates=20260211-20260222`
  * Fetches all games for the date range
  * Parse to extract: game_id, date, time, team names, status
  * Adjust date range as needed for full tournament coverage

- **Game Results/Summary**: `https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey/summary?event={EVENT_ID}`
  * Replace {EVENT_ID} with specific game ID
  * Fetches detailed game information including final scores
  * Use this to get completed game results

- **Teams**: `https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey/teams`
  * Fetches all team information
  * Use for team names, logos, colors, etc.

- **Standings**: `https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey/standings`
  * Fetches current tournament standings
  * Display group standings and tournament progress

#### Backup Method:
If ESPN API fails or is unavailable, load from static JSON file

#### Schedule/Results Update Strategy:
- Fetch schedule once on initial load and store in database
- Periodically refresh game results (every 5-10 minutes) for games in progress or recently completed
- Provide manual "Refresh Results" button for admin
- Cache API responses appropriately to avoid rate limiting

#### Display:
- Tournament bracket and current standings using ESPN standings API

---

### 2. Player Picks - CSV IMPORT & MANAGEMENT (ADJUSTED)

#### Overview:
Instead of in-app prediction submission, players submit their picks via a CSV file that is uploaded/imported into the application. The app then tracks predictions against actual results.

#### CSV Format:
Players should submit predictions in the following CSV structure:

```
game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,4,USA,3
401845664,Russia,2,Finland,2
401845665,Sweden,3,Czech_Republic,1
...
```

**CSV Column Definitions:**
- `game_id`: ESPN event ID (used to match against live tournament data)
- `team_a`: Name of first team (must match ESPN team names)
- `team_a_score`: Predicted score for team A (non-negative integer)
- `team_b`: Name of second team (must match ESPN team names)
- `team_b_score`: Predicted score for team B (non-negative integer)

#### Pick Submission Process:
1. Each of the 4 players prepares a CSV file with all their predictions before the tournament starts
2. Players can predict ALL games or SOME games:
   - It's acceptable if a player misses picking one or more games (no penalty, just no points for those games)
   - Players predict as many games as they want in any order
3. Administrator uploads each player's CSV file to the application (one file per player)
4. Application parses CSV and stores predictions in database mapped to player ID and game ID
5. Players can view their submitted picks before tournament starts (for verification)

#### Ties:
- Players can predict ties by entering equal scores for both teams (e.g., `team_a_score=2, team_b_score=2`)
- System must handle tie predictions and results
- Check ESPN API response to understand how ties are represented

#### Pick Validation (Upon CSV Upload):
- Verify all game_ids exist in tournament schedule
- Validate team names match ESPN data
- Validate scores are non-negative integers
- Validate score format is correct
- Show validation report before importing
- Allow user to fix CSV and re-upload if errors found

#### Pick Visibility:
- Predictions remain HIDDEN from other players until each game starts
- After a game starts, all predictions for that game become visible to everyone
- Players can view their own picks anytime

---

### 3. Scoring System

#### PRIMARY SCORING:
Points awarded for correct RESULT only (Win/Tie/Loss)

- **Correct result** = points awarded (regardless of exact score)
  - Example: Player predicts "Canada 4-2", actual is "Canada 3-1" → **POINTS** (correct winner)
  - Example: Player predicts "Canada 3-3" (tie), actual is "3-3" → **POINTS** (correct tie)
  - Example: Player predicts "Canada 4-2", actual is "USA 3-2" → **NO POINTS** (wrong result)

#### Points Configuration:
Configuration file controls points for correct results:
- Points for correct group stage result
- Points for correct knockout round result
- Points for correct medal round result

#### FUTURE ENHANCEMENT (notes in code for easy addition):
- Bonus points for exact score prediction
- Bonus points for correct goal differential
- These can be added to config.json later without major code changes

#### config.json Structure:
```json
{
  "scoring": {
    "groupStage": {
      "correctResult": 1
    },
    "knockoutRound": {
      "correctResult": 2
    },
    "medalRound": {
      "correctResult": 3
    }
  },
  "players": 4,
  "espnApi": {
    "baseUrl": "https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey",
    "endpoints": {
      "scoreboard": "/scoreboard",
      "summary": "/summary",
      "teams": "/teams",
      "standings": "/standings"
    },
    "tournamentDates": "20260211-20260222",
    "refreshInterval": 300000
  }
}
```

---

### 4. Leaderboard & Display

#### Real-Time Leaderboard:
- Shows all 4 players' total scores
- Updates automatically as games complete
- Sorted by total points (descending)
- Shows player names and current rank

#### Game-by-Game Breakdown:
Displays for each game:
- Team A vs Team B (with logos from ESPN API)
- Date and time (from ESPN scoreboard API)
- Round/group information
- Each player's prediction: "Team A score - Team B score"
- Actual result: "Team A score - Team B score" (updated from ESPN)
- Points earned by each player (if game completed)
- Visual indicators:
  - ✓ Correct result
  - ✗ Incorrect result
  - \- Not picked/No prediction submitted

#### Tournament Progress Tracker:
- Total games in tournament
- Games completed
- Games remaining
- Percentage of tournament complete
- Each player's pick completion percentage (X picks out of Y total games)

#### Visual Enhancements:
- Display team logos and colors from ESPN teams API
- Show live standings from ESPN standings API
- Color-coded by round type (group vs knockout vs medal)

#### Filtering Options:
- All games
- Completed games
- Upcoming games
- Games by round (group stage, quarterfinals, semifinals, finals, etc.)
- Games by team

#### Sort Options:
- By date
- By round
- By pick completion

---

### 5. Pick Management & Admin Upload Interface

#### CSV Upload Interface:
- Clean upload area to import player pick CSV files
- File selection for each of the 4 players
- Drag-and-drop support
- Pre-upload validation with detailed error reporting:
  - Missing required columns
  - Invalid game_ids
  - Invalid team names
  - Invalid score format
  - Duplicate entries
- Option to preview CSV data before confirming import
- Confirmation dialog showing:
  - Number of picks being imported
  - Number of games not picked
  - Any warnings or issues

#### Pick Review Interface:
- View all submitted picks by player
- See which games each player picked
- See which games are missing picks
- Option to delete and re-upload a player's picks
- Show "last uploaded" timestamp for each player

#### Bulk Pick View:
- Show all games for a day/round on one screen
- Easy navigation between dates/rounds
- Display all 4 players' predictions side-by-side for each game
- Show actual result once game completes
- Show points awarded

---

### 6. User Interface for Viewing Tournament

#### Game Card View:
For each game, display:
- Team A vs Team B (with logos from ESPN API)
- Date and time (from ESPN scoreboard API)
- Round/group information
- Status badge (upcoming, in progress, completed)
- All 4 players' predictions:
  - "Team A score - Team B score"
  - Hidden until game starts
  - Revealed when game starts or completes
- Actual result (once game completes):
  - "Team A score - Team B score"
  - Fetched from ESPN summary API
- Points awarded to each player (once game completes)
- Visual indicators for correct/incorrect predictions

#### Tournament Calendar View:
- Games organized by date
- Shows upcoming games by date
- Quick jump to today's games
- Games color-coded by status

#### Standings View:
- Live tournament standings from ESPN API
- Group standings (if applicable)
- Medal round brackets
- Playoff progression

---

## TECHNICAL REQUIREMENTS

### Frontend:
- React (use modern hooks, functional components)
- Responsive design: mobile-first, works on all devices
- Clean, intuitive UI for viewing tournament and predictions

### Backend:
Use a Netlify-compatible backend service:
- Netlify Functions + Fauna DB, or
- Firebase (Firestore + Authentication), or
- Supabase

Choose whichever is most straightforward to set up and deploy.

### Data Storage:
- Game schedule (loaded from ESPN API and cached in database)
- Game results (fetched periodically from ESPN summary API)
- Player picks: `{gameId, playerId, teamAScore, teamBScore, uploadTimestamp}`
- Calculated scores (updated when game results arrive)
- Upload history/audit trail for pick imports

### ESPN API Integration:
- Parse ESPN API responses correctly
- Handle API errors gracefully (fallback to cached data)
- Implement polling/refresh for live game updates
- Store ESPN event IDs to fetch individual game summaries
- Map ESPN team data to consistent internal team IDs

### CSV Processing:
- Parse CSV files with proper error handling
- Validate all data before import
- Handle edge cases (empty cells, extra whitespace, etc.)
- Support common CSV encoding (UTF-8, UTF-16)
- Provide detailed validation error messages to user

### Validation:
- Scores must be non-negative integers
- Game IDs must exist in tournament schedule
- Team names must match ESPN data (with fuzzy matching as backup)
- CSV format must match specification
- Clear error messages for all validation failures

### Responsive Design:
- Mobile-first approach
- Works on all screen sizes
- Touch-friendly on mobile devices
- Optimized for desktop viewing of game results

### Deployment:
- Fully configured for Netlify deployment with environment variables
- Environment variables for:
  - Database connection strings
  - API keys
  - Tournament date ranges

---

## ESPN API INTEGRATION DETAILS

### 1. Initial Setup:
- Fetch schedule from scoreboard API on first load
- Fetch teams data for logos and metadata
- Store all games with ESPN event IDs in database
- Parse game status: scheduled, in progress, completed

### 2. Ongoing Updates:
- Poll scoreboard API every 5-10 minutes (configurable)
- For completed games, fetch detailed results from summary API
- Update game records with final scores
- Trigger score recalculation when results are updated

### 3. Data Mapping:
- Extract from scoreboard API: event ID, competitors, date, status
- Extract from summary API: final score, game details
- Map round/stage information (group stage vs knockout)
- Handle time zones properly
- Map ESPN team IDs to consistent internal format for CSV matching

### 4. Error Handling:
- If API is down, use last cached data
- Show "last updated" timestamp
- Admin can manually refresh or enter results as fallback
- Log API errors for debugging

### 5. Rate Limiting:
- Implement reasonable polling intervals
- Cache responses appropriately
- Batch requests where possible
- Don't hammer the API unnecessarily

---

## RESULT UPDATES

### PRIMARY:
- Automatic updates from ESPN summary API
- Polls every 5-10 minutes for game status and results
- Automatically recalculates scores when new results arrive

### SECONDARY:
- Admin panel with manual override if needed

---

## ADMIN FEATURES

Protected admin panel to:
- View ESPN API sync status and last update time
- Manually refresh data from ESPN APIs
- View all player predictions and comparisons
- See pick completion rates for each player
- Upload/re-upload player pick CSV files
- Delete or modify player picks (if needed)
- Override game results manually if ESPN API fails
- Force recalculation of all player scores
- View upload history and validation logs
- Export results to CSV (leaderboard, game results, etc.)
- View API error logs and troubleshooting info

---

## DELIVERABLES

1. **Complete React application code**
   - Main game/tournament view
   - Leaderboard and scoring display
   - Admin upload and management interface

2. **Backend configuration**
   - Netlify Functions (or equivalent)
   - Database schema/setup
   - CSV processing functions

3. **ESPN API integration module** (services/espnApi.js)
   - `fetchSchedule()`
   - `fetchGameSummary(eventId)`
   - `fetchTeams()`
   - `fetchStandings()`
   - `parseGameResult(summaryData)`
   - `mapTeamData(teamData)`

4. **CSV processing module** (services/csvProcessor.js)
   - `parsePlayerPicksCSV(csvData)`
   - `validatePicks(picks, gameSchedule, teams)`
   - `transformPicksToDatabase(picks, playerId)`
   - `generateValidationReport(errors, warnings)`

5. **Scoring calculation module** (services/scoring.js)
   - `getResult(scoreA, scoreB)` → 'win_a' | 'win_b' | 'tie'
   - `compareResults(predictedResult, actualResult)` → boolean
   - `calculatePlayerScore(playerPicks, gameResults, config)` → number
   - `calculateAllScores(allPicksByPlayer, gameResults, config)` → {playerId: score}

6. **config.json**
   - Scoring configuration
   - API endpoints and settings
   - Tournament date ranges

7. **Sample ESPN API responses**
   - Saved as JSON files for reference and testing
   - Example responses for all 4 endpoints
   - Examples with both upcoming and completed games

8. **Sample CSV files**
   - Example player pick CSV in correct format
   - CSV with validation errors (for testing error handling)
   - Test data for development

9. **README** with:
   - Setup instructions
   - Netlify deployment steps
   - Environment variable configuration
   - ESPN API integration documentation
   - CSV format specification and examples
   - How to handle API failures
   - How to modify scoring rules in config.json
   - How the scoring system works (result-based)
   - Troubleshooting ESPN API issues
   - Instructions for players on submitting picks via CSV

---

## IMPLEMENTATION PRIORITY

1. Set up ESPN API integration first - test all 4 endpoints
2. Parse scoreboard API to build initial game schedule
3. Implement teams API integration for logos and metadata
4. Build CSV parsing and validation logic
5. Create admin upload interface
6. Build game result display with prediction comparison
7. Implement polling mechanism for result updates
8. Implement summary API calls for completed games
9. Build result comparison logic (predicted result vs actual result)
10. Build scoring calculation and leaderboard display
11. Integrate standings API for tournament display
12. Properly handle ties in both predictions and results
13. Add manual override as backup to API integration
14. Responsive design and UI polish

---

## CODE STRUCTURE NOTES

### ESP API Service Module (services/espnApi.js):
```javascript
export const fetchSchedule = async (dateRange) => {}
export const fetchGameSummary = async (eventId) => {}
export const fetchTeams = async () => {}
export const fetchStandings = async () => {}
export const parseGameResult = (summaryData) => {}
export const mapTeamData = (teamData) => {}
export const getGameStatus = (game) => {}
```

### CSV Processing Module (services/csvProcessor.js):
```javascript
export const parsePlayerPicksCSV = (csvData) => {}
export const validatePicks = (picks, gameSchedule, teams) => {}
export const transformPicksToDatabase = (picks, playerId) => {}
export const generateValidationReport = (errors, warnings) => {}
export const findTeamByName = (teamName, availableTeams) => {}
```

### Scoring Module (services/scoring.js):
```javascript
export const getResult = (scoreA, scoreB) => 'win_a' | 'win_b' | 'tie'
export const compareResults = (predictedResult, actualResult) => boolean
export const calculatePlayerScore = (playerPicks, gameResults, config) => {}
export const calculateAllScores = (allPicksByPlayer, gameResults, config) => {}
export const getRoundType = (game) => 'groupStage' | 'knockoutRound' | 'medalRound'
export const getPointsForRound = (roundType, config) => {}
```

### Reusable Functions:
- **Result comparison**: Create single source of truth for comparing predicted vs actual results
- **Round detection**: Determine tournament round from game metadata for scoring multiplier
- **Team matching**: Fuzzy matching for team names from CSV to ESPN data
- **Structure code to easily add exact score bonuses later** (comments indicating where to add)

### Implement proper TypeScript interfaces or PropTypes:
- For ESPN API responses
- For player pick objects
- For game result objects
- For scoring configuration

---

## CRITICAL: Pre-Implementation Testing

### ESPN API Endpoint Testing:
- Examine actual response structures
- Verify date ranges work correctly
- Confirm event IDs format
- Test with both scheduled and completed games
- Document any quirks or gotchas in the API responses
- Verify team name format and consistency
- Check how ties are represented in API responses
- Understand status codes and state transitions

### Sample Data:
- Save example responses from each endpoint
- Create mock responses for development/testing
- Document any API changes or nuances discovered

---

## DELIVERABLE SUMMARY

Create a **fully functional, production-ready application** with:
- ✅ Clean, maintainable code
- ✅ Proper error handling throughout
- ✅ Robust ESPN API integration as primary data source
- ✅ CSV parsing and validation
- ✅ Admin upload interface
- ✅ Real-time score calculation and leaderboard
- ✅ Polished, responsive UI
- ✅ Focus on **correct result prediction** (win/tie/loss)
- ✅ Automatic data fetching and updates from ESPN
- ✅ Complete deployment configuration for Netlify

The application should be ready to deploy immediately and handle the entire 2026 Olympic Men's Ice Hockey tournament with 4 competing players and their manually-submitted picks loaded via CSV.