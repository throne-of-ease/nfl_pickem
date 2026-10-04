#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/deployment-scope.sh"
directory="$(mktemp -d)"
trap 'rm -rf "$directory"' EXIT
cd "$directory"
git init --quiet
git config user.name 'Deployment scope test'
git config user.email 'scope@example.invalid'
mkdir supabase
echo original > frontend.js
echo original > supabase/config.toml
git add .
git commit --quiet -m base
before="$(git rev-parse HEAD)"
echo updated > frontend.js
git commit --quiet -am frontend
frontend="$(git rev-parse HEAD)"
echo updated > supabase/config.toml
git commit --quiet -am backend
backend="$(git rev-parse HEAD)"

check() {
  local expected="$1"
  shift
  : > output
  env GITHUB_EVENT_NAME=push BEFORE_SHA="$before" GITHUB_SHA="$frontend" GITHUB_OUTPUT="$directory/output" "$@" bash "$script"
  if [ "$(cat output)" != "backend=$expected" ]; then
    echo "Deployment scope failed: expected backend=$expected for $*" >&2
    exit 1
  fi
}

check false
check true GITHUB_SHA="$backend"
check false GITHUB_EVENT_NAME=workflow_dispatch BEFORE_SHA= FORCE_BACKEND=false
check true GITHUB_EVENT_NAME=workflow_dispatch FORCE_BACKEND=true
check true BEFORE_SHA=0000000000000000000000000000000000000000
check true BEFORE_SHA=ffffffffffffffffffffffffffffffffffffffff
echo 'All 6 deployment scope checks passed.'
