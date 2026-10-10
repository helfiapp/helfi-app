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
# Check app/build inputs only. Generated output and unrelated release evidence
# must not prevent an archive from an otherwise committed native app.
NATIVE_RUNTIME_PATHS=(
  native/App.tsx native/index.ts native/app.json
  native/package.json native/package-lock.json native/tsconfig.json
  native/babel.config.js native/metro.config.js native/eas.json
  native/src native/assets native/plugins native/ios
  ':(exclude)native/ios/Pods/**'
  ':(exclude)native/ios/build/**'
  ':(exclude)native/ios/.xcode.env.local'
  scripts/build-talk-to-helfi-testflight-ipa.sh
)

assert_native_source_clean() {
  local native_changes
  native_changes="$(git status --porcelain=v1 --untracked-files=all -- "${NATIVE_RUNTIME_PATHS[@]}")"
  if [[ -n "$native_changes" ]]; then
    echo "Commit native app/build-input changes before creating a release IPA." >&2
    echo "$native_changes" >&2
    return 1
  fi
  if [[ "$(git rev-parse HEAD)" != "$COMMIT_SHA" ]]; then
    echo "The source commit changed during this build. Rebuild the release IPA." >&2
    return 1
  fi
}

assert_native_source_clean
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
  -allowProvisioningUpdates \
  archive

assert_native_source_clean
cp native/ios/ExportOptions.plist "$EXPORT_OPTIONS"
plutil -replace destination -string export "$EXPORT_OPTIONS"

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

assert_native_source_clean
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
const { createHash } = require('crypto')

const exportPath = process.env.TESTFLIGHT_EXPORT_PATH
async function writeManifest() {
  const ipaHash = createHash('sha256')
  for await (const chunk of fs.createReadStream(path.join(exportPath, 'Helfi.ipa'))) {
    ipaHash.update(chunk)
  }
  const manifest = {
    mode: process.env.TESTFLIGHT_MODE,
    liveVoiceEnabled: process.env.TESTFLIGHT_LIVE_FLAG === 'true',
    apiBaseUrl: 'https://helfi.ai',
    appVersion: process.env.TESTFLIGHT_APP_VERSION,
    buildNumber: process.env.TESTFLIGHT_BUILD_NUMBER,
    bundleIdentifier: process.env.TESTFLIGHT_BUNDLE_IDENTIFIER,
    commitSha: process.env.TESTFLIGHT_COMMIT_SHA,
    ipa: 'Helfi.ipa',
    ipaSha256: ipaHash.digest('hex'),
    createdAt: new Date().toISOString(),
  }

  fs.writeFileSync(path.join(exportPath, 'Helfi-testflight-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
writeManifest().catch((error) => {
  console.error('Could not fingerprint the exported IPA:', error.message)
  process.exitCode = 1
})
NODE

echo "Local IPA created:"
echo "${EXPORT_PATH}/Helfi.ipa"
echo "${EXPORT_PATH}/Helfi-testflight-manifest.json"
