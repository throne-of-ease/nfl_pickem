# Live Games Scoring Feature

## Overview
This document describes the "Include live games in scoring" feature implementation and the subsequent bug fix.

## Feature Description
The live games scoring feature allows players to see provisional scores for in-progress games on the leaderboard and picks overview page. By default, only final game scores are included in the calculation, but users can toggle a setting to include live games.

### How It Works
- **Toggle OFF (default)**: Only final games are scored. In-progress games show predictions but don't contribute points.
- **Toggle ON**: Both final and in-progress games are scored. Live game picks display with dashed borders to indicate they are provisional.
- The setting is **global** (stored in localStorage) and syncs across all pages instantly.
- Once a game finalizes, the dashed border becomes solid (either green for correct or red for incorrect).

## Implementation Details

### Files Modified

#### 1. `src/services/leaderboardCalculator.js`
**Changes:**
- Added `options` parameter to `enrichGamesWithPicks()` function
- Added `includeLiveGames` option (default: `false`)
- Updated pick scoring logic to score in-progress games when `includeLiveGames` is true
- Added `isProvisional` flag to distinguish live game scores from final scores

**Key Logic:**
```javascript
const canScore = isFinal || (includeLiveGames && isInProgress);
const isCorrect = canScore && actualResult && p.predictedResult === actualResult;
const isProvisional = includeLiveGames && isInProgress && !isFinal;
```

#### 2. `src/context/AppContext.jsx`
**Changes:**
- Updated `enrichGamesWithPicks()` call to pass `{ includeLiveGames }` option
- Added `includeLiveGames` to `fetchTournamentData` dependency array
- Added `useRef` to track initial mount vs. setting changes
- Updated `useEffect` to skip cache when setting changes (triggers recalculation)
- Removed redundant `clearCache()` call from `toggleIncludeLiveGames`

**Bug Fixed:** The toggle now correctly updates scores because `fetchTournamentData` uses the current `includeLiveGames` value via proper dependency tracking.

#### 3. `src/pages/LeaderboardPage.jsx`
**Changes:**
- Already had the toggle implemented
- Wrapped toggle and refresh button in `controls` div for consistent layout

#### 4. `src/pages/PicksOverviewPage.jsx`
**Changes:**
- Added `includeLiveGames` and `toggleIncludeLiveGames` from `useApp()` hook
- Added toggle checkbox in the controls section
- Updated `PickDisplay` component to handle `isProvisional` state
- Changed points display logic to show points for both final and provisional games

#### 5. `src/pages/GamesPage.jsx`
**Changes:**
- Added `includeLiveGames` and `toggleIncludeLiveGames` from `useApp()` hook
- Added toggle checkbox in the header controls

#### 6. `src/pages/PicksOverviewPage.module.css`
**Changes:**
- Added `.toggle` styling for the checkbox label
- Added `.provisionalCorrect` and `.provisionalIncorrect` classes with dashed borders
- Added styles for all three variants: compact, card, and timeline
- Added dark mode support for provisional styling

#### 7. `src/pages/GamesPage.module.css`
**Changes:**
- Added `.controls` div styling
- Added `.toggle` checkbox styling

## Styling Details

### Provisional Pick Styling
When `includeLiveGames` is enabled, in-progress game picks display with special styling:

**Compact View:**
```css
.pickCompact.provisionalCorrect {
  background: rgba(40, 167, 69, 0.15);
  border: 2px dashed rgba(40, 167, 69, 0.6);  /* dashed border */
}

.pickCompact.provisionalIncorrect {
  background: rgba(220, 53, 69, 0.05);
  border: 2px dashed rgba(220, 53, 69, 0.4);  /* dashed border */
}
```

**Timeline View:**
```css
.pickTimeline.provisionalCorrect {
  background: linear-gradient(135deg, rgba(40, 167, 69, 0.15) 0%, rgba(40, 167, 69, 0.08) 100%);
  border: 2px dashed var(--color-success);
}

.pickTimeline.provisionalIncorrect {
  background: linear-gradient(135deg, rgba(220, 53, 69, 0.08) 0%, rgba(220, 53, 69, 0.04) 100%);
  border: 2px dashed rgba(220, 53, 69, 0.4);
}
```

**Card View:**
```css
.pickCard.provisionalCorrect {
  background: linear-gradient(90deg, rgba(40, 167, 69, 0.08) 0%, rgba(40, 167, 69, 0.04) 100%);
  border: 1px dashed rgba(40, 167, 69, 0.5);
}

.pickCard.provisionalIncorrect {
  background: linear-gradient(90deg, rgba(220, 53, 69, 0.06) 0%, rgba(220, 53, 69, 0.03) 100%);
  border: 1px dashed rgba(220, 53, 69, 0.3);
}
```

## Data Flow

### Initial Load
1. `AppProvider` initializes with `includeLiveGames` from localStorage (default: false)
2. `fetchTournamentData()` is called with cache usage allowed
3. Data is calculated with current `includeLiveGames` value
4. Results are cached and displayed

### Toggle Interaction
1. User clicks "Include live games" checkbox
2. `toggleIncludeLiveGames()` is called
3. State updates: `setIncludeLiveGames(newValue)`
4. Settings are persisted to localStorage
5. `fetchTournamentData` callback is recreated (due to dependency)
6. `useEffect` detects change and calls `fetchTournamentData(true)` (skips cache)
7. Leaderboard is recalculated with new setting
8. All pages instantly reflect the change

## Persistence
The `includeLiveGames` setting is persisted in localStorage under the key `olympics-pickem-settings`. It survives page refreshes and browser sessions.

## Testing Checklist
- [ ] Toggle appears on LeaderboardPage, PicksOverviewPage, and GamesPage
- [ ] Toggling OFF excludes in-progress games from scoring
- [ ] Toggling ON includes in-progress games (provisional scores)
- [ ] Live game picks show dashed borders when toggle is ON
- [ ] Final game picks show solid borders regardless of toggle state
- [ ] Points display for both final and provisional games
- [ ] Setting persists across page refreshes
- [ ] Toggle synchronizes across all open pages
- [ ] Leaderboard scores update immediately when toggling

## Bug Fixes Applied

### Issue: Toggle Not Updating Scores
**Root Cause:** `fetchTournamentData` callback was missing `includeLiveGames` in its dependency array. When the toggle changed, the callback still used the old value from its closure.

**Solution:**
- Added `includeLiveGames` to the dependency array of `fetchTournamentData`
- Used a `useRef` to distinguish initial mount from subsequent updates
- Skip cache on subsequent updates to force recalculation with new value

**Commits:**
- `3358439` - Implement live games scoring feature with UI toggles
- `1972141` - Refactor LeaderboardPage header for consistency
- `67dfabd` - Fix includeLiveGames toggle not updating scores

## Future Enhancements
1. Add option to customize styling of provisional picks
2. Add historical tracking of provisional scores vs. final scores
3. Add animations when game transitions from provisional to final
4. Add notification when a watched game finalizes
5. Add option to exclude specific rounds from live scoring (e.g., only group stage)
