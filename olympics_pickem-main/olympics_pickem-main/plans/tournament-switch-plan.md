# On-Site Tournament Switcher Plan

## Summary
Add an admin-only tournament selector in the header that persists to localStorage and triggers a full page reload on change. Update `getActiveTournamentKey()` to prefer a stored client selection (when in browser), while leaving serverless functions on env vars. This keeps existing module-level tournament constants intact and minimizes refactors.

## Implementation Details

### 1) Add client-side storage for active tournament
**File:** `src/config/tournamentConfig.js`

- Add a stable localStorage key:
  - `const TOURNAMENT_STORAGE_KEY = 'olympics-pickem-active-tournament';`

- Add helpers:
  - `export function getStoredTournamentKey()`:
    - Only runs in browser (`typeof window !== 'undefined'`)
    - Reads localStorage value
    - Validates against `TOURNAMENTS` keys; return `null` if invalid/missing
  - `export function setStoredTournamentKey(key)`:
    - Validates against `TOURNAMENTS`
    - Writes to localStorage (or removes if null)
  - `export function getTournamentOptions()`:
    - Returns array of `{ key, label }` from `TOURNAMENTS`

- Update `getActiveTournamentKey()`:
  - If browser and `getStoredTournamentKey()` returns a valid key, return it
  - Otherwise fall back to `VITE_TOURNAMENT_KEY` or `'mens_ice_hockey'`
  - Keep server-side behavior unchanged (`process.env`)

### 2) Add admin-only header dropdown
**File:** `src/components/layout/Header.jsx`

- Import:
  - `getActiveTournamentKey`, `getTournamentOptions`, `setStoredTournamentKey`
- Render a `<select>` inside the nav **only when `isAdmin`** and `isConfigured`
- Options from `getTournamentOptions()` with labels
- Current value from `getActiveTournamentKey()`

- `onChange` handler:
  - `setStoredTournamentKey(selectedKey)`
  - `window.location.reload()` to reinitialize all module-level constants and caches

### 3) Style the selector
**File:** `src/components/layout/Header.module.css`

- Add styles for a compact dropdown that matches the header:
  - Similar size/weight as links
  - Use existing CSS variables for border, radius, text, background
- Ensure it stays usable on mobile (align with `.nav` overflow)

### 4) Keep existing data flow intact
No refactor to AppContext or services needed because:
- Reload ensures `getActiveTournamentKey()` is re-evaluated and module-level constants (AppContext cache keys, Supabase service constants, ESPN endpoints) load with the new tournament.

## Public API / Interface Changes
- New exported helpers in `src/config/tournamentConfig.js`:
  - `getStoredTournamentKey`
  - `setStoredTournamentKey`
  - `getTournamentOptions`
- `getActiveTournamentKey()` now considers localStorage when in browser.

## Test Plan

### Manual
1. Sign in as an admin.
2. Confirm dropdown appears in header.
3. Switch to Women’s tournament -> page reloads.
4. Verify data reflects women’s schedule and picks.
5. Refresh the browser -> selection persists.
6. Sign in as non-admin -> dropdown not visible.

### Optional (unit)
- Add a small test for `getActiveTournamentKey()` preferring stored key when present.

## Assumptions & Defaults
- Full page reload is acceptable on tournament change.
- Admin-only toggle is desired; non-admins never see the selector.
- localStorage persistence is sufficient; no profile-level persistence.
