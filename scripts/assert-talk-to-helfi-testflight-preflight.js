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

const buildNumber = Number(nativeAppJson?.expo?.ios?.buildNumber)
const projectBuildNumbers = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((match) => Number(match[1]))

assert(Number.isInteger(buildNumber) && buildNumber >= 25, 'Native iOS buildNumber must be bumped past uploaded build 24 before the next TestFlight attempt.')
assert(projectBuildNumbers.length >= 2 && projectBuildNumbers.every((value) => value === buildNumber), 'Xcode CURRENT_PROJECT_VERSION values must match native/app.json buildNumber.')
assert(exportOptions.includes('<string>app-store-connect</string>') && exportOptions.includes('<string>upload</string>'), 'ExportOptions.plist must still target App Store Connect upload for the approved TestFlight path.')
assert(exportOptions.includes('<key>manageAppVersionAndBuildNumber</key>') && exportOptions.includes('<false/>'), 'Apple must not silently rewrite the app version/build number during export.')

assert(realtimeRoute.includes("const DEFAULT_VOICE = 'marin'"), 'Realtime voice must default to Marin, the closest available natural OpenAI API voice.')
assert(voiceRoute.includes("const DEFAULT_VOICE = 'marin'"), 'Normal Talk to Helfi spoken replies must default to Marin.')
assert(ttsRoute.includes("const DEFAULT_VOICE = 'marin'"), 'TTS route must default to Marin.')
assert(realtimeRoute.includes('exactChatGptVoiceAvailable: false'), 'Realtime status must honestly report that exact ChatGPT voice names are not exposed by the API.')

assert(realtimeRoute.includes('HELFI_VOICE_REALTIME_ENABLED') && realtimeRoute.includes('live_voice_paused'), 'Backend live voice must stay behind the server-side enable flag.')
assert(voiceAssistant.includes('EXPO_PUBLIC_HELFI_LIVE_VOICE_ENABLED') && voiceAssistant.includes('LIVE_VOICE_DISABLED_MESSAGE'), 'Native live voice must stay behind the build-time enable flag.')
assert(realtimeRoute.includes('request.signal?.aborted') && realtimeRoute.includes('live_voice_cancelled'), 'Backend realtime startup must cancel cleanly before charging when the user closes voice.')
assert(realtimeClient.includes('signal?: AbortSignal') && realtimeClient.includes('closeRealtimeConnection()'), 'Native realtime startup must be abortable and close the peer connection.')
assert(realtimeClient.includes('stopTracks()') && realtimeClient.includes('pc.getTransceivers?.()'), 'Native realtime shutdown must stop WebRTC tracks and transceivers.')
assert(realtimeClient.includes('enableRemoteAudioTrack') && realtimeClient.includes('track._setVolume?.(1)'), 'Native realtime must explicitly enable returned assistant audio tracks.')
assert(realtimeClient.includes('handledToolCallIds') && voiceAssistant.includes('realtimeActionGuardRef'), 'Realtime app actions must be deduped in the client and UI layer.')
assert(voiceAssistant.includes('suppressSpokenReply: true'), 'Realtime app actions must not trigger duplicate fallback TTS playback.')
assert(voiceAssistant.includes('realtimeVoiceConnectTimeoutRef') && voiceAssistant.includes('Live voice could not connect quickly enough'), 'Realtime startup must fail fast instead of hanging.')
assert(voiceRoute.includes('Realtime app-action hint') && voiceRoute.includes('realtimeActionHint'), 'Realtime tool hints must feed the shared app-action brain.')
assert(realtimeRoute.includes('Do not answer app-action requests from general knowledge'), 'Realtime voice must route app actions through Helfi tools, not generic chat.')

if (failures.length) {
  console.error('Talk to Helfi TestFlight preflight failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Talk to Helfi TestFlight preflight passed.')
