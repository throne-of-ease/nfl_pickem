#!/usr/bin/env bash
set -euo pipefail

backend=false
if [ "$GITHUB_EVENT_NAME" = workflow_dispatch ]; then
  [ "${FORCE_BACKEND:-false}" != true ] || backend=true
elif [ -z "${BEFORE_SHA:-}" ] || [ "$BEFORE_SHA" = 0000000000000000000000000000000000000000 ]; then
  backend=true
elif ! git cat-file -e "$BEFORE_SHA^{commit}" 2>/dev/null; then
  # When a rewritten branch loses its previous commit, deploy conservatively.
  backend=true
elif ! git diff --quiet "$BEFORE_SHA" "$GITHUB_SHA" -- supabase/; then
  backend=true
fi
echo "backend=$backend" >> "$GITHUB_OUTPUT"
