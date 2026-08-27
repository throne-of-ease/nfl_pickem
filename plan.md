# NFL Pick’em 2026 — Revised Stability-First Plan

  ## Summary and Critical Corrections

  The existing plan has a sound stack and security direction, but is not yet decision-complete. Replace it with a plan that:

  - Adds deployable preseason rehearsal pools plus deterministic local preseason testing.
  - Separates public data revisions from each user’s draft revision, preventing unrelated users from causing autosave conflicts.
  - Defines scoring, confidence, model, lock, and tie behavior instead of leaving “ambiguous” rules to the implementer.
  - Reorders delivery into genuinely end-to-end vertical slices.
  - Keeps live ESPN testing optional. A direct ESPN API request was denied with HTTP 403 in the current environment, so fixtures and last-good data must remain sufficient.
  - Builds a clean React/Vite application at the repository root; the nested Olympics app and legacy tracker remain read-only references.

  ## Domain, Data, and API Changes

  - Configure these pool mappings explicitly:
      - preseason-hof maps to ESPN preseason week 1; preseason-01 through preseason-03 map to ESPN weeks 2 through 4 so the UI follows the NFL's user-facing preseason week numbers. All are excluded from aggregate season standings.
      - week-01 through week-18: ESPN season type 2; included in season standings.
      - wild-card, divisional, conference, and super-bowl: ESPN season type 3, weeks 1, 2, 3, and 5 respectively; omit Pro Bowl week 4.
      - Never rely on ESPN’s implicit current season/week defaults. ESPN exposes preseason Week 4 separately and maps the Super Bowl to postseason Week 5 while Week 4 is the Pro Bowl. ESPN preseason Week 4
        (https://www.espn.com/nfl/scoreboard/_/week/4/year/2025/seasontype/1), ESPN postseason Week 4 (https://www.espn.com/nfl/scoreboard/_/week/4/year/2025/seasontype/3), ESPN postseason Week 5
        (https://www.espn.com/nfl/scoreboard/_/week/5/year/2025/seasontype/3).

  - Give every pool metadata including key, label, phase, espnSeason, espnSeasonType, espnWeek, and countsTowardSeason.
  - For a pool with N games, confidence values are 1..N. Partial drafts may use any unique subset; completed drafts must use every value once.
  - Locked games retain their confidence values. Users may swap confidence only among unlocked games, and locked values cannot be reused.
  - Lock each game at its server-held kickoff time. Once locked or revealed, it never automatically unlocks after a schedule change; an audited admin override is required.
  - A final tie awards every submitted team pick its full confidence and GotW bonus, preserving tracker behavior.
  - GotW adds five points to a correct pick. Official results use final games only; provisional results use the current score leader and win probability only to break a live score tie.
  - Freeze the latest valid pregame predictor and pregame moneyline snapshots when the game first becomes live. If no scheduled predictor exists, retain the chronologically first valid live sample and
    identify its source.

  - Compute no-vig moneyline probabilities by normalizing both implied probabilities. Generate FPI, moneyline, and aggregate picks only when all required inputs are finite.
  - Rank valid model picks from smallest to largest probability separation using unique confidence values; break equal separations by kickoff and then game ID. Missing model inputs receive no pick or rank.
  - Define aggregate probability as the equal-weight average of pregame predictor probability and no-vig moneyline probability. Define model disagreement as the absolute difference between their home-team
    probabilities.

  - Keep scoring/read-model calculations in pure server-side JavaScript. Enforce kickoff locks, revision matching, uniqueness, and atomic replacement again inside a service-role-only PostgreSQL transaction.

  Public interfaces:

  - GET /api/season-data?pool=<pool-key> returns pool metadata, sanitized games, revealed picks, official/provisional standings, analytics, freshness, asOf, and dataRevision.
  - GET /api/picks?pool=<pool-key> returns one row per pool game with nullable selection/confidence plus the authenticated user’s draftRevision.
  - PUT /api/picks?pool=<pool-key> atomically replaces that user’s draft using { expectedDraftRevision, picks }.
  - Return structured errors: 409 STALE_DRAFT; 422 INVALID_CONFIDENCE_SET, LOCKED_GAME_CHANGED, UNKNOWN_GAME, or POOL_CLOSED.
  - Store per-user/per-pool draft revisions separately from global pool-data revisions.
  - Keep preseason leaderboards isolated. Aggregate season charts and standings must filter on countsTowardSeason=true.

  ## Local Preseason Workflow and Delivery

  - Use local Supabase with the production migrations and RLS policies. Provide a reset/seed command that creates an admin, two players, invites, pool metadata, games, and representative picks using test-
    only credentials.

  - Add cross-platform commands:
      - npm run local:setup: start/reset local Supabase and seed rehearsal accounts.
      - npm run dev:preseason: run Netlify/Vite against recorded preseason fixtures without calling ESPN.
      - npm run dev:preseason:live: ingest the configured 2026 ESPN preseason week into local Supabase and report adapter/access failures clearly.
      - npm run test:integration and npm run test:e2e: exercise the local database and browser flows.

  - Commit sanitized preseason scheduled, live, final, missing-predictor, missing-odds, malformed, and stale-response fixtures.
  - Allow fixture scenarios to supply a server-side development clock. Production must ignore all clock overrides, and clients must never submit an effective time.
  - Deploy preseason pools behind PRESEASON_REHEARSAL_ENABLED. Label every preseason screen and leaderboard “Rehearsal — does not count.” Disable the flag at regular-season launch without deleting rehearsal
    data.

  - Deliver vertical slices:
      1. Preseason fixture/live ingestion, pool navigation, cached schedule, stale handling, and responsive game display.
      2. Local Supabase auth, full-draft autosave, confidence swaps, individual locks, pick revelation, and admin controls.
      3. Official/provisional scoring, isolated preseason and aggregate season leaderboards, model calculations, and Rules documentation.
      4. Charts, display modes, PNG sharing, accessibility, operational hardening, and regular-season activation.

  ## Test and Acceptance Plan

  - Contract tests cover every ESPN season type, all pool mappings, status normalization, malformed/empty responses, missing predictor/odds, immutable pregame snapshots, and last-good fallback.
  - Domain tests cover variable game counts, partial and complete confidence sets, locked-value reservation, GotW, final ties, missing picks, official/provisional scoring, potential points, model ranking
    ties, vig removal, aggregate probabilities, and disagreement.

  - Database tests cover atomic swaps, concurrent users, per-user revision conflicts, kickoff races, locked-row preservation, direct-RPC denial, RLS visibility, admin authorization, and preseason exclusion
    from season aggregates.

  - React tests cover preseason labeling, pool navigation, autosave conflicts, occupied-confidence swaps, locked confidence values, hidden picks, stale timestamps, and official/provisional switching.
  - Playwright tests use seeded local Supabase to verify registration/sign-in, two-player picks, kickoff locking, revelation, provisional live changes, final scoring, admin override, and preseason isolation.
  - Capture desktop and mobile screenshots for scheduled, live, final, playoff, missing-data, stale-data, validation-error, and preseason-rehearsal states.
  - The deterministic fixture suite is required in CI. The live ESPN preseason smoke is diagnostic and must report failure separately without failing unrelated tests.
  - Acceptance requires proving locally that preseason games can progress through scheduled → live → final, including picks, locks, revelation, polling, scoring, and leaderboards, while aggregate regular-
    season standings remain unchanged.

  ## Assumptions

  - The 2026 ESPN season identifier also covers the January–February 2027 postseason.
  - Preseason uses real accounts and production-equivalent behavior, but never contributes to the regular-season total.
  - React, Vite, Netlify Functions, Supabase, CSS Modules, native SVG charts, and Intl remain.
  - Playwright is the sole added browser-testing dependency; no state library, UI framework, chart library, CSV workflow, service worker, season selector, or historical-season UI is introduced.
