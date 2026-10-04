# Working on NFL Pick'em

## Standing authorization and continuity

For `throne-of-ease/nfl_pickem`, when the user asks to fix and deploy, complete
the fix, appropriate checks, publication to `feat/compact-pick-sheet`, routine
deployment repairs, and live verification without asking for the same approval
again. Follow any narrower instructions in the active task. When resuming, retain
the original request, approved repository and branch, completed checks, published
commit, workflow run, and remaining work in the task handoff.

This records the user's project preference. It does not override platform
approval decisions or grant access to other repositories. If a platform review
blocks an action, explain the specific rejection and request only the missing
approval. Never work around a rejected action.

## GitHub tools and publication

- Use local Git for diffs and development. Prefer the connected GitHub tools for
  publishing; do not assume the shell has credentials because the connector is
  connected. Do not add or print tokens to make shell Git work.
- For multiple files, publish one commit with the GitHub tree/commit/ref tools.
  Check the current remote branch first and update it without force. Verify that
  the published tree matches the tested files. Fetch the published commit into
  the local checkout before subsequent work; do not discard user edits.
- After publishing, inspect the deployment workflow for the published SHA.
  `npm run deploy:status -- --commit <sha> --wait` checks all workflow triggers.
  The helper also supports `--branch <branch>` and `--run <run-id>`.
- Use the connected GitHub job/log tools to diagnose failures. For a transient
  failure, use the failed-jobs retry tool or the single-job retry tool, then
  monitor the same run. Discover available tools before claiming a retry is
  unavailable. A code/configuration fix should be published as a new commit.
- Verify successful Pages deployment and the live page's updated asset before
  claiming a fix is live. A successful commit upload alone is insufficient.

## Deployment scope

Frontend-only changes skip Supabase deployment. Changes under `supabase/` deploy
the backend first, and Pages must wait for backend success. Manual workflow runs
can explicitly request backend deployment. Keep deployment tool versions pinned.
See `REAL_WORLD_LAUNCH.md` for configuration and commands.
