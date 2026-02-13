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

echo "🔎 Running Food Rename Guard Canary..."
node scripts/canary-food-rename-sync.js

echo "✅ Food Rename Guard Canary passed."
