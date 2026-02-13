#!/bin/bash
set -euo pipefail

# Usage:
#   CANARY_AUTH_COOKIE="next-auth.session-token=..." ./scripts/check-rename-guard.sh
# or
#   CANARY_STORAGE_STATE="playwright/.auth/your-user.json" ./scripts/check-rename-guard.sh

if [[ -z "${CANARY_AUTH_COOKIE:-}" && -z "${CANARY_STORAGE_STATE:-}" ]]; then
  echo "❌ Rename guard requires CANARY_AUTH_COOKIE or CANARY_STORAGE_STATE"
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

resolve_node_path() {
  local candidates=()
  candidates+=("$ROOT_DIR/node_modules")

  # Worktree helper: /path/repo-worktrees/<branch> -> /path/repo
  local parent_dir
  parent_dir="$(dirname "$ROOT_DIR")"
  local parent_name
  parent_name="$(basename "$parent_dir")"
  if [[ "$parent_name" == *"-worktrees" ]]; then
    local primary_repo
    primary_repo="${parent_dir%-worktrees}"
    candidates+=("$primary_repo/node_modules")
  fi

  local dir
  for dir in "${candidates[@]}"; do
    if [[ -d "$dir/playwright" || -d "$dir/@playwright" ]]; then
      echo "$dir"
      return 0
    fi
  done

  return 1
}

if [[ -z "${NODE_PATH:-}" ]]; then
  if resolved_node_path="$(resolve_node_path)"; then
    export NODE_PATH="$resolved_node_path"
  fi
fi

if ! node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  echo "❌ Could not find Playwright. Install dependencies or set NODE_PATH to your node_modules folder."
  exit 2
fi

echo "🔎 Running Food Rename Guard Canary..."
node scripts/canary-food-rename-sync.js

echo "✅ Food Rename Guard Canary passed."
