#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
if [[ "$MODE" != "paused-safe" && "$MODE" != "live-candidate" ]]; then
  echo "Usage: $0 paused-safe|live-candidate" >&2
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
if [[ -z "$BUILD_NUMBER" || -z "$APP_VERSION" ]]; then
  echo "Could not read native app version/build number." >&2
  exit 1
fi

LIVE_FLAG="false"
if [[ "$MODE" == "live-candidate" ]]; then
  LIVE_FLAG="true"
fi

ARCHIVE_PATH="native/ios/build/Helfi-${APP_VERSION}-${BUILD_NUMBER}-${MODE}.xcarchive"
EXPORT_PATH="native/ios/build/TestFlightExport-${BUILD_NUMBER}-${MODE}"
EXPORT_OPTIONS="/tmp/HelfiExportOptions-${BUILD_NUMBER}-${MODE}.plist"

echo "Building Helfi ${APP_VERSION} (${BUILD_NUMBER}) mode: ${MODE}"
echo "Live voice build flag: ${LIVE_FLAG}"

npm --prefix native run check:voice-assistant
npm --prefix native run typecheck
npm run check:talk-to-helfi-testflight
npm --prefix native run check:talk-to-helfi-testflight
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
  -exportOptionsPlist "$EXPORT_OPTIONS"

echo "Local IPA created:"
echo "${EXPORT_PATH}/Helfi.ipa"
