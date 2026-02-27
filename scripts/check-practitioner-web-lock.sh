#!/usr/bin/env bash
set -euo pipefail

FILE="app/practitioner/page.tsx"
LAYOUT_FILE="components/LayoutWrapper.tsx"

if [ ! -f "$FILE" ]; then
  echo "[practitioner-lock] Missing $FILE"
  exit 1
fi

check_contains() {
  local pattern="$1"
  local message="$2"
  if ! rg -q "$pattern" "$FILE"; then
    echo "[practitioner-lock] $message"
    exit 1
  fi
}

# Required header actions and fallback behavior.
check_contains "← Back" "Back button label is missing."
check_contains "Go to dashboard" "Dashboard button label is missing."
check_contains "window.history.back" "Back button no longer uses browser history behavior."
check_contains "/list-your-practice/start" "Back fallback route is missing."

# Delete account must only show for existing listings.
check_contains "dashboard\\?\\.listing\\?\\.id" "Delete-account visibility guard is missing."

# Practitioner accounts must not be globally forced back to /practitioner.
if [ -f "$LAYOUT_FILE" ]; then
  if rg -q "router.replace\\('/practitioner'\\)" "$LAYOUT_FILE"; then
    echo "[practitioner-lock] Global redirect to /practitioner found in LayoutWrapper and will break normal app navigation."
    exit 1
  fi
fi

echo "[practitioner-lock] PASS"
