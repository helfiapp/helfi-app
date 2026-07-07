#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const failures = []
const assert = (condition, message) => {
  if (!condition) failures.push(message)
}

const nativeAppJson = JSON.parse(read('native/app.json'))
const pbxproj = read('native/ios/Helfi.xcodeproj/project.pbxproj')
const exportOptions = read('native/ios/ExportOptions.plist')
const realtimeRoute = read('app/api/native/voice-assistant/realtime/route.ts')
const voiceRoute = read('app/api/native/voice-assistant/route.ts')
const ttsRoute = read('app/api/native/voice-assistant/tts/route.ts')
const voiceAssistant = read('native/src/voice/VoiceAssistant.tsx')
const realtimeClient = read('native/src/voice/realtimeVoice.ts')
const voiceConfig = read('lib/openai-voice-config.ts')
const packageJson = JSON.parse(read('package.json'))
const testflightBuilder = read('scripts/build-talk-to-helfi-testflight-ipa.sh')
const testflightUploadReady = read('scripts/assert-talk-to-helfi-testflight-upload-ready.js')
const testflightSigningCheck = read('scripts/check-ios-distribution-signing.js')
const vercelProductionEnvCheck = read('scripts/check-vercel-production-env.js')
const vercelAiEnvCheck = read('scripts/check-vercel-ai-env.js')

const buildNumber = Number(nativeAppJson?.expo?.ios?.buildNumber)
const projectBuildNumbers = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((match) => Number(match[1]))

assert(Number.isInteger(buildNumber) && buildNumber >= 25, 'Native iOS buildNumber must be bumped past uploaded build 24 before the next TestFlight attempt.')
assert(projectBuildNumbers.length >= 2 && projectBuildNumbers.every((value) => value === buildNumber), 'Xcode CURRENT_PROJECT_VERSION values must match native/app.json buildNumber.')
assert(exportOptions.includes('<string>app-store-connect</string>') && exportOptions.includes('<string>upload</string>'), 'ExportOptions.plist must still target App Store Connect upload for the approved TestFlight path.')
assert(exportOptions.includes('<key>manageAppVersionAndBuildNumber</key>') && exportOptions.includes('<false/>'), 'Apple must not silently rewrite the app version/build number during export.')
assert(packageJson.scripts?.['check:talk-to-helfi-testflight-upload-ready'] === 'node scripts/assert-talk-to-helfi-testflight-upload-ready.js', 'Package scripts must keep the Talk to Helfi TestFlight upload readiness check.')
assert(packageJson.scripts?.['build:talk-to-helfi-testflight:paused']?.includes('paused-safe'), 'Package scripts must keep an explicit paused-safe local IPA builder.')
assert(packageJson.scripts?.['build:talk-to-helfi-testflight:live']?.includes('live-candidate'), 'Package scripts must keep an explicit live-candidate local IPA builder.')
assert(testflightBuilder.includes('paused-safe|live-candidate') && testflightBuilder.includes('This script is local-only. It does not upload to TestFlight.'), 'Talk to Helfi IPA builder must separate paused and live candidates without Apple upload.')
assert(testflightBuilder.includes('EXPO_PUBLIC_HELFI_LIVE_VOICE_ENABLED="$LIVE_FLAG"'), 'Talk to Helfi live-candidate IPA must compile live voice with the explicit live flag.')
assert(testflightBuilder.includes('Helfi-testflight-manifest.json') && testflightBuilder.includes('TESTFLIGHT_COMMIT_SHA'), 'Talk to Helfi IPA builder must write a manifest tying the IPA to the current commit.')
assert(testflightBuilder.includes('node scripts/check-ios-distribution-signing.js'), 'Talk to Helfi IPA builder must check Apple distribution signing before archiving.')
assert(testflightUploadReady.includes('githubCommitSha=') && testflightUploadReady.includes('helfi.ai') && testflightUploadReady.includes('not deployed to Vercel Production'), 'Talk to Helfi upload readiness must verify the live backend has the current commit before TestFlight upload.')
assert(testflightUploadReady.includes('Helfi-testflight-manifest.json') && testflightUploadReady.includes('manifest.commitSha !== commitSha') && testflightUploadReady.includes("manifest.liveVoiceEnabled !== true"), 'Talk to Helfi upload readiness must verify the live IPA manifest before TestFlight upload.')
assert(testflightUploadReady.includes('scripts/check-ios-distribution-signing.js'), 'Talk to Helfi upload readiness must check Apple distribution signing before upload.')
assert(testflightSigningCheck.includes('security') && testflightSigningCheck.includes('find-identity') && testflightSigningCheck.includes('Apple/iOS Distribution signing certificate'), 'Talk to Helfi signing check must verify local Apple/iOS Distribution signing without printing secrets.')

assert(voiceConfig.includes("const DEFAULT_HELFI_VOICE = 'marin'"), 'Talk to Helfi voices must default to Marin, the closest available natural OpenAI API voice.')
assert(voiceConfig.includes("BEST_NATURAL_OPENAI_VOICES") && voiceConfig.includes("'marin'") && voiceConfig.includes("'cedar'"), 'Talk to Helfi voice selection must only prefer the best natural OpenAI API voices.')
assert(realtimeRoute.includes('resolveHelfiRealtimeVoice()') && !realtimeRoute.includes('process.env.HELFI_VOICE_TTS_VOICE || DEFAULT_VOICE'), 'Realtime voice must not inherit an older TTS voice override such as Coral.')
assert(realtimeRoute.includes("|| 'gpt-realtime-2.1'"), 'Realtime voice must default to the current documented OpenAI realtime model.')
assert(realtimeRoute.includes("type: 'semantic_vad'") && realtimeRoute.includes("eagerness: 'low'") && realtimeRoute.includes('interrupt_response: true'), 'Realtime voice must use low-eagerness semantic VAD with interruption enabled.')
assert(voiceRoute.includes('resolveHelfiTtsVoice()') && ttsRoute.includes('resolveHelfiTtsVoice()'), 'Normal spoken replies must use the shared natural voice resolver.')
assert(realtimeRoute.includes('exactChatGptVoiceAvailable()'), 'Realtime status must honestly report that exact ChatGPT voice names are not exposed by the API.')

assert(realtimeRoute.includes('HELFI_VOICE_REALTIME_ENABLED') && realtimeRoute.includes('live_voice_paused'), 'Backend live voice must stay behind the server-side enable flag.')
assert(vercelProductionEnvCheck.includes("'HELFI_VOICE_REALTIME_ENABLED'") && vercelAiEnvCheck.includes('HELFI_VOICE_REALTIME_ENABLED'), 'Production readiness checks must require the live voice backend flag by name.')
assert(voiceAssistant.includes('EXPO_PUBLIC_HELFI_LIVE_VOICE_ENABLED') && voiceAssistant.includes('LIVE_VOICE_DISABLED_MESSAGE'), 'Native live voice must stay behind the build-time enable flag.')
assert(realtimeRoute.includes('request.signal?.aborted') && realtimeRoute.includes('live_voice_cancelled'), 'Backend realtime startup must cancel cleanly before charging when the user closes voice.')
assert(realtimeClient.includes('signal?: AbortSignal') && realtimeClient.includes('closeRealtimeConnection()'), 'Native realtime startup must be abortable and close the peer connection.')
assert(realtimeClient.includes('function stopMediaStreamTracks') && realtimeClient.includes('if (params.signal?.aborted)') && realtimeClient.includes('stopMediaStreamTracks(localStream)'), 'Native realtime startup must stop microphone tracks if the user cancels while audio is still opening.')
assert(realtimeClient.includes('stopTracks()') && realtimeClient.includes('pc.getTransceivers?.()'), 'Native realtime shutdown must stop WebRTC tracks and transceivers.')
assert(realtimeClient.includes('enableRemoteAudioTrack') && realtimeClient.includes('track._setVolume?.(1)'), 'Native realtime must explicitly enable returned assistant audio tracks.')
assert(realtimeClient.includes('handledToolCallIds') && voiceAssistant.includes('realtimeActionGuardRef'), 'Realtime app actions must be deduped in the client and UI layer.')
assert(!realtimeRoute.includes("language: 'en'"), 'Realtime voice transcript config must not force English-only speech.')
assert(voiceAssistant.includes('suppressSpokenReply: true'), 'Realtime app actions must not trigger duplicate fallback TTS playback.')
assert(voiceAssistant.includes('safeToClaimSaved') && voiceAssistant.includes('function realtimeToolResult') && realtimeRoute.includes('safeToClaimSaved is not true'), 'Realtime app actions must return a safe spoken reply contract so the model cannot claim a review was saved.')
assert(voiceAssistant.includes('realtimeVoiceConnectTimeoutRef') && voiceAssistant.includes('REALTIME_VOICE_CONNECT_TIMEOUT_MS = 30000') && voiceAssistant.includes('Live voice could not connect quickly enough'), 'Realtime startup must fail instead of hanging, but must allow slow WebRTC setup to finish.')
assert(voiceAssistant.includes('realtimeVoiceConnectedRef') && voiceAssistant.includes("setRealtimeVoiceStatus((current) => (current === 'speaking' ? 'speaking' : 'live'))"), 'Realtime setup must move the UI to Listening once WebRTC is ready and not fall back to Connecting after audio/data connects.')
assert(voiceRoute.includes('Realtime app-action hint') && voiceRoute.includes('realtimeActionHint'), 'Realtime tool hints must feed the shared app-action brain.')
assert(realtimeRoute.includes('Do not answer app-action requests from general knowledge'), 'Realtime voice must route app actions through Helfi tools, not generic chat.')

if (failures.length) {
  console.error('Talk to Helfi TestFlight preflight failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Talk to Helfi TestFlight preflight passed.')
