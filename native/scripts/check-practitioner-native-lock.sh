#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

search() {
  local pattern="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -n --fixed-strings "$pattern" "$@" >/dev/null
  else
    grep -nF "$pattern" "$@" >/dev/null
  fi
}

search_regex() {
  local pattern="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -n "$pattern" "$@" >/dev/null
  else
    grep -nE "$pattern" "$@" >/dev/null
  fi
}

fail() {
  echo "Practitioner native lock FAILED:"
  echo "- $1"
  exit 1
}

required_files=(
  "native/src/navigation/MainNavigator.tsx"
  "native/src/screens/DashboardScreen.tsx"
  "native/src/screens/MoreScreen.tsx"
  "native/src/screens/PractitionerDirectoryScreen.tsx"
  "native/src/screens/PractitionerAZScreen.tsx"
  "native/src/screens/PractitionerProfileScreen.tsx"
  "native/src/screens/ListYourPracticeScreen.tsx"
  "native/src/screens/ListYourPracticeStartScreen.tsx"
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "Missing file: $file"
done

if search_regex "SleepCoach|Sleep Coach" \
  native/src/navigation/MainNavigator.tsx \
  native/src/screens/DashboardScreen.tsx \
  native/src/screens/MoreScreen.tsx; then
  fail "Sleep Coach references were found in native navigation/dashboard/more."
fi

search "name=\"Practitioners\"" native/src/navigation/MainNavigator.tsx || fail "Main navigator must include Practitioners route."
search "name=\"ListYourPractice\"" native/src/navigation/MainNavigator.tsx || fail "Main navigator must include ListYourPractice route."
search "name=\"ListYourPracticeStart\"" native/src/navigation/MainNavigator.tsx || fail "Main navigator must include ListYourPracticeStart route."

search "onPress={goToPractitioners}" native/src/screens/DashboardScreen.tsx || fail "Dashboard Find a Practitioner card is not wired."
search "onPress={openPractitioners}" native/src/screens/MoreScreen.tsx || fail "More menu Find a Practitioner row is not wired."

if search "onPress={() => onPressPlaceholder('Find a Practitioner')}" native/src/screens/DashboardScreen.tsx; then
  fail "Dashboard still contains placeholder Find a Practitioner action."
fi

if search "label=\"Find a Practitioner\" onPress={() => {}}" native/src/screens/MoreScreen.tsx; then
  fail "More menu still contains dead Find a Practitioner action."
fi

search "accountType: 'practitioner'" native/src/screens/ListYourPracticeStartScreen.tsx || fail "ListYourPracticeStart must keep practitioner accountType routing."
search "navigation.navigate('Login'" native/src/screens/ListYourPracticeStartScreen.tsx || fail "ListYourPracticeStart must support practitioner sign in."
search "navigation.navigate('Signup'" native/src/screens/ListYourPracticeStartScreen.tsx || fail "ListYourPracticeStart must support practitioner sign up."

echo "Practitioner native lock passed."
