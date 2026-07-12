#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
if [[ "$MODE" != "live-candidate" ]]; then
  echo "Usage: $0 live-candidate" >&2
  exit 2
fi

if [[ "${HELFI_ALLOW_APPLE_UPLOAD:-}" == "true" ]]; then
  echo "This script is local-only. It does not upload to TestFlight." >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BUILD_NUMBER="$(node -e "const app=require('./native/app.json'); process.stdout.write(String(app.expo.ios.buildNumber || ''))")"
APP_VERSION="$(node -e "const app=require('./native/app.json'); process.stdout.write(String(app.expo.version || ''))")"
BUNDLE_IDENTIFIER="$(node -e "const app=require('./native/app.json'); process.stdout.write(String(app.expo.ios.bundleIdentifier || ''))")"
COMMIT_SHA="$(git rev-parse HEAD)"
if [[ -z "$BUILD_NUMBER" || -z "$APP_VERSION" ]]; then
  echo "Could not read native app version/build number." >&2
  exit 1
fi

LIVE_FLAG="true"

ARCHIVE_PATH="native/ios/build/Helfi-${APP_VERSION}-${BUILD_NUMBER}-${MODE}.xcarchive"
EXPORT_PATH="native/ios/build/TestFlightExport-${BUILD_NUMBER}-${MODE}"
EXPORT_OPTIONS="/tmp/HelfiExportOptions-${BUILD_NUMBER}-${MODE}.plist"

echo "Building Helfi ${APP_VERSION} (${BUILD_NUMBER}) mode: ${MODE}"
echo "Live voice build flag: ${LIVE_FLAG}"

npm --prefix native run check:voice-assistant
npm --prefix native run typecheck
npm run check:talk-to-helfi-testflight
npm --prefix native run check:talk-to-helfi-testflight
node scripts/check-ios-distribution-signing.js
npm run check:page-locks
npm --prefix native run check:page-locks
git diff --check

rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH" "$EXPORT_OPTIONS"

EXPO_PUBLIC_API_BASE_URL="https://helfi.ai" \
EXPO_PUBLIC_HELFI_LIVE_VOICE_ENABLED="$LIVE_FLAG" \
xcodebuild \
  -workspace native/ios/Helfi.xcworkspace \
  -scheme Helfi \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  archive

cp native/ios/ExportOptions.plist "$EXPORT_OPTIONS"
plutil -replace destination -string export "$EXPORT_OPTIONS"

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

TESTFLIGHT_MODE="$MODE" \
TESTFLIGHT_LIVE_FLAG="$LIVE_FLAG" \
TESTFLIGHT_APP_VERSION="$APP_VERSION" \
TESTFLIGHT_BUILD_NUMBER="$BUILD_NUMBER" \
TESTFLIGHT_BUNDLE_IDENTIFIER="$BUNDLE_IDENTIFIER" \
TESTFLIGHT_COMMIT_SHA="$COMMIT_SHA" \
TESTFLIGHT_EXPORT_PATH="$EXPORT_PATH" \
node <<'NODE'
const fs = require('fs')
const path = require('path')

const exportPath = process.env.TESTFLIGHT_EXPORT_PATH
const manifest = {
  mode: process.env.TESTFLIGHT_MODE,
  liveVoiceEnabled: process.env.TESTFLIGHT_LIVE_FLAG === 'true',
  apiBaseUrl: 'https://helfi.ai',
  appVersion: process.env.TESTFLIGHT_APP_VERSION,
  buildNumber: process.env.TESTFLIGHT_BUILD_NUMBER,
  bundleIdentifier: process.env.TESTFLIGHT_BUNDLE_IDENTIFIER,
  commitSha: process.env.TESTFLIGHT_COMMIT_SHA,
  ipa: 'Helfi.ipa',
  createdAt: new Date().toISOString(),
}

fs.writeFileSync(path.join(exportPath, 'Helfi-testflight-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
NODE

echo "Local IPA created:"
echo "${EXPORT_PATH}/Helfi.ipa"
echo "${EXPORT_PATH}/Helfi-testflight-manifest.json"
