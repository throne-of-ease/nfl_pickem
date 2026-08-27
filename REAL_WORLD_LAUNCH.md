# Real-world preseason launch checklist

Status date: 2026-08-27 (Europe/Berlin)

The app is prepared for the 2026 NFL preseason Week 3 slate. The live ESPN diagnostic currently returns all 16 games, and the recorded fallback matches the official NFL schedule. The first game is Pittsburgh at Buffalo at 23:00 UTC on August 27 (01:00 CEST on August 28).

Production site: <https://nfl-pickem-2026.netlify.app>.

Completed on 2026-08-27:

- Linked Supabase project `nfl_pickem` in West Europe and applied both migrations.
- Pushed the production Site URL and disabled email confirmation while preserving MFA/OTP defaults.
- Configured Netlify's production environment and deployed the site plus all three Functions.
- Switched the deployment to modern Supabase API keys and disabled the unused legacy JWT keys.
- Proved hosted registration, all 16 Week 3 games, draft save/reload, and completed Week 1/2 late picks.
- Removed every temporary smoke account and pick; production ended with zero profiles, drafts, and picks.

## What is already implemented

- Production starts with no example players or picks.
- The launch migration deletes existing rehearsal drafts and picks.
- Registration creates an immediately confirmed Supabase user; players do not click an email-confirmation link.
- Picks are stored per authenticated player in Supabase and autosaved through Netlify Functions.
- Preseason Weeks 1 and 2 remain editable after kickoff by explicit temporary rule. Week 3 follows normal kickoff locks.
- Preseason scoring, standings, and model computations run but remain excluded from season totals.
- Loading a pool synchronizes its real ESPN schedule into Supabase; cached database games remain available if ESPN is temporarily unavailable.

## 1. Supabase project

1. Sign in or create a hosted project at <https://supabase.com/dashboard>.
2. Copy the project reference, project URL, publishable key, and secret key from Project Settings > API. Never expose the secret key in Vite/client variables or commit it.
3. Authenticate and link this checkout:

   ```powershell
   npx.cmd supabase login
   npx.cmd supabase link --project-ref YOUR_PROJECT_REF
   npx.cmd supabase db push
   ```

4. In Authentication > Providers > Email, enable Email and turn off Confirm email. The server already creates registrations with `email_confirm: true`; this dashboard setting keeps any future direct sign-up flow consistent.
5. In Authentication > URL Configuration, set the Site URL to the final Netlify production URL after the first deploy.
6. Confirm the migration results in SQL Editor:

   ```sql
   select key, espn_week, accepts_late_picks from public.pools
   where key like 'preseason-%' order by espn_week;

   select count(*) as picks_after_launch_reset from public.picks;
   ```

   Expected: only `preseason-01` and `preseason-02` have `accepts_late_picks = true`, and the pick count is zero before real registrations begin.

## 2. Netlify site

1. Authenticate the CLI:

   ```powershell
   npx.cmd netlify-cli login
   ```

2. The linked site is `nfl-pickem-2026`. Connect GitHub repository `throne-of-ease/nfl_pickem` and select its default branch for continuous deployment. This repository's `netlify.toml` already sets `npm run build`, `dist`, Functions, API redirects, and SPA fallback.
3. Add these environment variables in Netlify Site configuration > Environment variables (all scopes):

   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`

   On this Free-plan team, granular function-only secret scopes are unavailable. The deployed values therefore use the production context and default scopes. They are not bundled into the browser because they have no `VITE_` prefix, but Netlify account members can read them. Upgrade the site and convert `SUPABASE_SECRET_KEY` to a function-only secret if stricter account-level concealment is required.

4. Link this checkout and deploy:

   ```powershell
   npx.cmd netlify-cli link
   npx.cmd netlify-cli deploy --build --prod
   ```

5. Copy the production URL back to Supabase Authentication > URL Configuration as the Site URL.

## 3. Pre-launch verification

Run locally before deployment:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run dev:preseason:live
```

Then verify the deployed URL in a private browser window:

1. Register a new player and confirm the app opens immediately without an email-confirmation step.
2. Select Preseason 1 and Preseason 2; confirm the late-pick notice appears and team choices are enabled.
3. Select Preseason 3; confirm 16 games appear with Pittsburgh at Buffalo first and Chicago at Tennessee last.
4. Make a Week 3 team pick, change its confidence, refresh, and confirm both persist.
5. Register a second player in another private browser; confirm the first player's future picks are hidden until kickoff and the two drafts remain independent.
6. After kickoff, confirm the game locks, picks become visible, live scoring updates, and preseason totals do not enter season charts.
7. In Netlify Function logs, confirm `auth`, `season-data`, and `picks` return successful responses without secret keys appearing in logs.

## 4. Operational checks during games

- Open the app shortly before every kickoff; `season-data` refreshes ESPN and persists the latest schedule/scores.
- If ESPN is unavailable, do not reset Supabase: the function serves the last synchronized slate.
- Watch Netlify Function errors and Supabase database/auth logs.
- Keep `preseason-01` and `preseason-02` late picks open only for this test. Before regular-season launch, run:

  ```sql
  update public.pools set accepts_late_picks = false;
  ```

## 5. Rollback

- Roll back the site from Netlify Deploys by publishing the previous successful deploy.
- Do not rerun the launch-reset migration after real picks exist; it intentionally clears all drafts and picks.
- Database migrations should be corrected with a new forward migration, never by editing production history.
