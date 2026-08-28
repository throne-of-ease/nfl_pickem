# Real-world launch: GitHub Pages + Supabase Free

The production architecture is a static GitHub Pages frontend backed by the existing Supabase project. Authenticated clients use Supabase Auth and protected RPCs directly. One Supabase Edge Function (`sync-season`) is the only server-side code: it synchronizes the trusted ESPN schedule and scores, preserves pregame snapshots, and leaves the last synchronized slate in place when ESPN is unavailable.

## Supabase project

1. Link the checkout and apply migrations:

   ```powershell
   npx.cmd supabase login
   npx.cmd supabase link --project-ref YOUR_PROJECT_REF
   $env:SUPABASE_PROJECT_URL = "https://YOUR_PROJECT.supabase.co"
   $env:SUPABASE_PUBLISHABLE_KEY = "YOUR_PUBLIC_PUBLISHABLE_KEY"
   $env:APP_CRON_SECRET = "RANDOM_LONG_CRON_SECRET"
   npx.cmd supabase config push --project-ref YOUR_PROJECT_REF
   npx.cmd supabase db push
   ```

2. In Authentication > Providers > Email, keep Email enabled and Confirm email disabled. This preserves immediate registration without a confirmation step.
3. In Authentication > URL Configuration, set the Site URL to `https://throne-of-ease.github.io/nfl_pickem/` and allow the local development URLs listed in `supabase/config.toml`.
4. Create these Edge Function secrets in the Supabase dashboard or CLI. Do not put them in Vite variables:

   - `APP_SUPABASE_PUBLISHABLE_KEY`
   - `APP_SUPABASE_SECRET_KEY`
   - `APP_CRON_SECRET`
   - `APP_ALLOWED_ORIGIN=https://throne-of-ease.github.io`

5. The `db.vault` entries in `supabase/config.toml` populate the three Vault secrets used by the cron migration (`project_url`, `publishable_key`, `cron_secret`) when `supabase db push` runs. The migration schedules `sync-nfl-season-every-five-minutes` through `pg_cron` and `pg_net`.

## GitHub repository

1. Enable Settings > Pages > Source: GitHub Actions.
2. Add repository variables:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_PROJECT_REF`

3. Add the personal Supabase access token as the repository secret `SUPABASE_ACCESS_TOKEN`.
4. Push to the repository default branch (`feat/compact-pick-sheet`) or `main`. `.github/workflows/deploy.yml` runs the tests, builds with the `/nfl_pickem/` base path, deploys Edge Functions, then publishes `dist` to Pages.

## Verification

Run locally:

```powershell
npm.cmd test -- --pool=forks --maxWorkers=1
npm.cmd run build
npm.cmd run test:e2e
```

Then verify the deployed URL with four temporary accounts:

1. Register and sign in without email confirmation.
2. Switch through all pools and confirm the first empty pool performs one initialization sync.
3. Give each user different teams and confidence values; refresh and confirm drafts remain isolated.
4. Confirm locked games cannot change, late preseason weeks remain editable, and future picks stay hidden until kickoff.
5. Verify live/final scores, standings, models, charts, drag/drop confidence, and mobile layout.
6. In browser developer tools, confirm normal loading uses Supabase Auth/RPC endpoints and does not call ESPN directly.
7. Check Supabase Usage and Edge Function logs. A five-minute global cron is at most 8,640 invocations per month; Free includes 500,000.
8. Delete all temporary test users and picks.

## Rollback and operations

- Keep the last Netlify deployment available until the Pages smoke test is complete; publish it again only as an emergency rollback.
- Do not rerun the launch-reset migration after real picks exist.
- If ESPN fails, leave Supabase data untouched; the sync function returns the last good slate.
- Free projects can be paused after seven days of low activity outside the season. Resume the project from Supabase Studio when needed.
