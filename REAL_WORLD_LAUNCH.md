# Real-world launch: GitHub Pages + Supabase Free

The production architecture is a static GitHub Pages frontend backed by the existing Supabase project. Authenticated clients use Supabase Auth and protected RPCs directly. The browser reads the selected week, live scores, game status, and live win probabilities directly from ESPN; Supabase stores authentication, schedules, picks, and permissions rather than a live-score cache.

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

5. The existing `sync-season` Edge Function remains available for explicit schedule/admin operations. Migration `202608290001_disable_live_score_cron.sql` removes the old five-minute score synchronization job; live refreshes do not write to Supabase.

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
6. In browser developer tools, confirm the initial load uses Supabase Auth/RPC endpoints for account/picks data and ESPN CDN scoreboard/game endpoints for the selected week and live updates.
7. Confirm pressing Refresh increases ESPN requests without another Supabase season-data request, and that live score/probability changes appear in the rendered page.
8. Delete all temporary test users and picks.

## Rollback and operations

- Keep the last Netlify deployment available until the Pages smoke test is complete; publish it again only as an emergency rollback.
- Do not rerun the launch-reset migration after real picks exist.
- If ESPN fails, leave Supabase data untouched and keep the last client-side ESPN slate visible.
- Free projects can be paused after seven days of low activity outside the season. Resume the project from Supabase Studio when needed.
