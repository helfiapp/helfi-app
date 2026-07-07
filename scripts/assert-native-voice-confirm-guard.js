#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const routePath = path.join(root, 'app/api/native/voice-assistant/route.ts')
const confirmRoutePath = path.join(root, 'app/api/native/voice-assistant/confirm/route.ts')
const ttsRoutePath = path.join(root, 'app/api/native/voice-assistant/tts/route.ts')
const nativePath = path.join(root, 'native/src/voice/VoiceAssistant.tsx')
const healthImagePath = path.join(root, 'native/src/screens/HealthImageNotesScreen.tsx')
const healthJournalPath = path.join(root, 'native/src/screens/HealthJournalScreen.tsx')
const moodTrackerPath = path.join(root, 'native/src/screens/MoodTrackerScreen.tsx')
const symptomNotesPath = path.join(root, 'native/src/screens/SymptomNotesScreen.tsx')
const trackCaloriesPath = path.join(root, 'native/src/screens/TrackCaloriesScreen.tsx')
const smartHealthCoachPath = path.join(root, 'native/src/screens/SmartHealthCoachScreen.tsx')
const mainNavigatorPath = path.join(root, 'native/src/navigation/MainNavigator.tsx')
const mainTabsPath = path.join(root, 'native/src/navigation/MainTabs.tsx')
const rootNavigatorPath = path.join(root, 'native/src/navigation/RootNavigator.tsx')
const billingScreenPath = path.join(root, 'native/src/screens/BillingScreen.tsx')
const creditCostsPath = path.join(root, 'data/creditCosts.ts')
const reviewTokenPath = path.join(root, 'lib/native-voice-review-token.ts')
const promptHandoffPath = path.join(root, 'lib/native-voice-prompt-handoff.ts')
const promptHandoffRoutePath = path.join(root, 'app/api/native/voice-prompt-handoff/route.ts')
const chatPagePath = path.join(root, 'app/chat/page.tsx')
const commandBehaviorPath = path.join(root, 'scripts/assert-native-voice-command-behavior.js')
const analyzeSupplementImagePath = path.join(root, 'app/api/analyze-supplement-image/route.ts')
const healthIntakeReviewMatchPath = path.join(root, 'lib/health-intake-review-match.ts')
const medicationSearchPath = path.join(root, 'app/api/medication-search/route.ts')
const supplementSearchPath = path.join(root, 'app/api/supplement-search/route.ts')
const userDataPath = path.join(root, 'app/api/user-data/route.ts')

if (!fs.existsSync(nativePath)) {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    console.log('Native voice confirm guard skipped on Vercel because native files are not uploaded.')
    process.exit(0)
  }
  console.error(`Native voice confirm guard could not find ${nativePath}`)
  process.exit(1)
}

const route = fs.readFileSync(routePath, 'utf8')
const confirmRoute = fs.readFileSync(confirmRoutePath, 'utf8')
const ttsRoute = fs.readFileSync(ttsRoutePath, 'utf8')
const native = fs.readFileSync(nativePath, 'utf8')
const healthImage = fs.readFileSync(healthImagePath, 'utf8')
const healthJournal = fs.readFileSync(healthJournalPath, 'utf8')
const moodTracker = fs.readFileSync(moodTrackerPath, 'utf8')
const symptomNotes = fs.readFileSync(symptomNotesPath, 'utf8')
const trackCalories = fs.readFileSync(trackCaloriesPath, 'utf8')
const smartHealthCoach = fs.readFileSync(smartHealthCoachPath, 'utf8')
const mainNavigator = fs.readFileSync(mainNavigatorPath, 'utf8')
const mainTabs = fs.readFileSync(mainTabsPath, 'utf8')
const rootNavigator = fs.readFileSync(rootNavigatorPath, 'utf8')
const billingScreen = fs.readFileSync(billingScreenPath, 'utf8')
const creditCosts = fs.readFileSync(creditCostsPath, 'utf8')
const reviewToken = fs.readFileSync(reviewTokenPath, 'utf8')
const promptHandoff = fs.readFileSync(promptHandoffPath, 'utf8')
const promptHandoffRoute = fs.readFileSync(promptHandoffRoutePath, 'utf8')
const chatPage = fs.readFileSync(chatPagePath, 'utf8')
const commandBehavior = fs.readFileSync(commandBehaviorPath, 'utf8')
const analyzeSupplementImage = fs.readFileSync(analyzeSupplementImagePath, 'utf8')
const healthIntakeReviewMatch = fs.readFileSync(healthIntakeReviewMatchPath, 'utf8')
const medicationSearch = fs.readFileSync(medicationSearchPath, 'utf8')
const supplementSearch = fs.readFileSync(supplementSearchPath, 'utf8')
const userData = fs.readFileSync(userDataPath, 'utf8')

const failures = []

if (/\bautoSave:\s*true\b/.test(route)) {
  failures.push('Native voice assistant drafts must not return autoSave: true.')
}

if (/nextDraft\?\.autoSave|saveDraft\(nextDraft,\s*\{\s*automatic:\s*true\s*\}\s*\)/.test(native)) {
  failures.push('Native voice assistant must not auto-save a draft before the user confirms.')
}

if (!/aiConsentGranted/.test(native) || !/hasAiConsentFlag/.test(route) || !/hasAiConsentFlag/.test(ttsRoute)) {
  failures.push('Native voice AI routes must keep the AI sharing consent guard.')
}

if (
  !/VOICE_PAID_ACCESS_MESSAGE\s*=\s*'Talk to Helfi needs an active subscription or purchased credits\.'/.test(native) ||
  !/hasPaidVoiceAccess/.test(native) ||
  !/totalAvailableCents\s*\?\?\s*data\?\.credits\?\.total/.test(native) ||
  !/VOICE_ACCESS_FALLBACK_API_BASE_URL\s*=\s*'https:\/\/helfi\.ai'/.test(native) ||
  !/shouldRetryVoiceAccessOnLive/.test(native) ||
  !/fetchVoiceAccessStatus\(session\.token\)/.test(native) ||
  !/first\.res\.ok && hasPaidVoiceAccess\(first\.data\)/.test(native) ||
  !/api\/credit\/status\?feature=talk-to-helfi/.test(native) ||
  !/View plans/.test(native) ||
  !/VOICE_PAID_ACCESS_MESSAGE\s*=\s*'Talk to Helfi needs an active subscription or purchased credits\.'/.test(route) ||
  !/hasPaidVoiceWalletAccess/.test(route) ||
  !/voice_subscription_required/.test(route) ||
  !/VOICE_PAID_ACCESS_MESSAGE\s*=\s*'Talk to Helfi needs an active subscription or purchased credits\.'/.test(ttsRoute) ||
  !/hasPaidVoiceWalletAccess/.test(ttsRoute)
) {
  failures.push('Talk to Helfi must require an active subscription or purchased credits before voice requests run.')
}

try {
  const accessHelperStart = native.indexOf('function cleanFavoriteText')
  const accessHelperEnd = native.indexOf('async function playableAudioUri')
  if (accessHelperStart < 0 || accessHelperEnd < accessHelperStart) {
    failures.push('Talk to Helfi paid access helper checks could not locate native access helpers.')
  } else {
    const helperSource = native.slice(accessHelperStart, accessHelperEnd)
    const helperCheck = `
${helperSource}
if (!hasPaidVoiceAccess({ totalAvailableCents: 1 })) throw new Error('Talk to Helfi paid access must accept totalAvailableCents.')
if (!hasPaidVoiceAccess({ credits: { total: 1 } })) throw new Error('Talk to Helfi paid access must accept credits.total.')
if (hasPaidVoiceAccess({ totalAvailableCents: 0, credits: { total: 0 }, topUps: [] })) throw new Error('Talk to Helfi paid access must still block when no paid credits exist.')
`
    const compiled = ts.transpileModule(helperCheck, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    vm.runInNewContext(compiled, {}, { timeout: 5000 })
  }
} catch (error) {
  failures.push(error?.message || 'Talk to Helfi paid access behavior check failed.')
}

if (!/const aiAllowed = await requestAiDataSharingPermission\(\)[\s\S]*?if \(!aiAllowed\)[\s\S]*?return[\s\S]*?fetchNativeVoiceAssistant/.test(native) || !/hasAiDataSharingPermission\(\)[\s\S]*?fetchNativeVoiceTts/.test(native)) {
  failures.push('Talk to Helfi must ask AI sharing consent before sending assistant requests, and must not request spoken-reply TTS without stored consent.')
}

if (!/const \[voiceReply,\s*setVoiceReply\]\s*=\s*useState\(true\)/.test(native) || !/setVoiceReply\(value !== '0'\)/.test(native)) {
  failures.push('Talk to Helfi must default to spoken replies unless the user explicitly turns speech off.')
}

if (!/const shouldSpeakReply = !options\?\.suppressSpokenReply && Boolean\(options\?\.audioUri \|\| voiceReply\)/.test(native) || !/form\.append\('voiceReply',\s*shouldSpeakReply \? 'true' : 'false'\)/.test(native) || !/voiceReply:\s*shouldSpeakReply/.test(native)) {
  failures.push('Microphone requests in Talk to Helfi must speak back even if an old text-only preference exists.')
}
if (!/suppressSpokenReply:\s*true/.test(native)) {
  failures.push('Realtime live voice app actions must not also play the fallback spoken-reply voice.')
}

if (
  !/voiceSessionActive/.test(native) ||
  !/voiceSessionActiveRef/.test(native) ||
  !/resumeVoiceSessionListening/.test(native) ||
  !/setOnRecordingStatusUpdate/.test(native) ||
  !/VOICE_TURN_SILENCE_MS/.test(native) ||
  !/didJustFinish[\s\S]*?resumeVoiceSessionListening/.test(native) ||
  !/setContinuousVoiceSession\(false\)[\s\S]*?setOpen\(false\)/.test(native) ||
  !/End voice chat/.test(native)
) {
  failures.push('Talk to Helfi must support continuous voice chat: listen, answer out loud, then listen again until the user ends voice chat.')
}

if (
  !/fetchNativeVoiceTts/.test(native) ||
  !/native-voice-assistant-tts/.test(native) ||
  !/VOICE_ACCESS_FALLBACK_API_BASE_URL/.test(native) ||
  !/voice reply is not configured/.test(native) ||
  !/Number\(status\) >= 500/.test(native)
) {
  failures.push('Spoken replies must use the safe live fallback during local simulator testing.')
}

if (!/assertAiUsageAllowed/.test(route) || !/feature:\s*'voice-assistant:transcribe'/.test(route) || !/feature:\s*'voice-assistant:tts'/.test(route) || !/assertAiUsageAllowed/.test(ttsRoute) || !/isAiSafetyError/.test(ttsRoute)) {
  failures.push('Native voice transcription and spoken replies must keep the AI spend safety brake.')
}

if (!/spokenReplyStatus/.test(native) || !/Preparing spoken reply/.test(native) || !/Playing spoken reply/.test(native) || !/Could not play spoken reply/.test(native) || !/Spoken reply unavailable/.test(native)) {
  failures.push('Native spoken replies must show preparing, playing, playback-failed, and unavailable feedback in the Talk to Helfi panel.')
}

if (
  /Stop recording|Starting recording|Recording failed|Recording unavailable|Voice recording|recordingButton/.test(native) ||
  !/Listening\.\.\./.test(native) ||
  !/Voice chat is live/.test(native) ||
  !/Hands-free conversation/.test(native) ||
  !/Show Helfi/.test(native) ||
  !/accessibilityLabel="Show Helfi with camera"/.test(native) ||
  !/Message Helfi/.test(native) ||
  /What you said/.test(native) ||
  !/voiceBars/.test(native)
) {
  failures.push('Talk to Helfi voice input must feel like an ongoing assistant conversation, with an obvious camera/video affordance, not a recorder form.')
}

if (
  !/import \* as LegacyFileSystem from 'expo-file-system\/legacy'/.test(native) ||
  !/LegacyFileSystem\.writeAsStringAsync\(fileUri,\s*match\[2\],\s*\{\s*encoding:\s*LegacyFileSystem\.EncodingType\.Base64\s*\}\)/.test(native) ||
  !/Audio\.setAudioModeAsync\(\{\s*allowsRecordingIOS:\s*false,\s*playsInSilentModeIOS:\s*true/.test(native) ||
  /file\.write\(match\[2\],\s*\{\s*encoding:\s*'base64'\s*\}\s*\)/.test(native)
) {
  failures.push('Native spoken replies must write returned base64 audio through the legacy base64 writer and set playback audio mode.')
}

const saveDraftBody = native.slice(native.indexOf('const saveDraft = useCallback'), native.indexOf('const sendDraftRequest = useCallback'))
if (/requestVoiceReply\(String\(message\)\)/.test(saveDraftBody) || /closePanel\(\{\s*keepPlayback:\s*voiceReply\s*\}\)/.test(saveDraftBody) || !/closePanel\(\)/.test(saveDraftBody)) {
  failures.push('Confirmed saves must close quietly and stop playback, so Talk to Helfi cannot keep talking after the user leaves the panel.')
}

if (!/const closeCameraMode = useCallback/.test(native) || !/if \(voiceSessionActiveRef\.current\)[\s\S]*?endVoiceSession\(\)/.test(native) || !/onRequestClose=\{closeCameraMode\}/.test(native)) {
  failures.push('Closing live camera mode must also end live voice, so voice cannot continue hidden behind the camera overlay.')
}

if (!/AppState\.addEventListener\('change'/.test(native) || !/state === 'active'/.test(native) || !/setContinuousVoiceSession\(false\)[\s\S]*?stopRealtimeVoiceSession\(\)[\s\S]*?setBottleCameraOpen\(false\)[\s\S]*?stopPlayback\(\)\.catch/.test(native)) {
  failures.push('Talk to Helfi must stop live voice, camera mode, and playback when the app goes inactive or into the background.')
}

if (
  !/spokenReplyRunRef/.test(native) ||
  !/const shouldKeepPlaying = \(\) => \(/.test(native) ||
  !/openRef\.current[\s\S]*?AppState\.currentState === 'active'/.test(native) ||
  !/playAudio\(String\(data\.audio\), shouldKeepPlaying\)/.test(native) ||
  !/spokenReplyRunRef\.current \+= 1[\s\S]*?setOpen\(false\)/.test(native)
) {
  failures.push('Delayed spoken replies must be ignored after Talk to Helfi closes or the app goes into the background.')
}

if (
  !/type RealtimeToolResult/.test(native) ||
  !/safeToClaimSaved/.test(native) ||
  !/spokenReply/.test(native) ||
  !/instruction/.test(native) ||
  !/function realtimeToolResult/.test(native) ||
  !/sendDraftRequestRef\.current\([\s\S]*?\)\.then\(realtimeToolResult\)/.test(native) ||
  !/safeToClaimSaved is not true/.test(fs.readFileSync(path.join(root, 'app/api/native/voice-assistant/realtime/route.ts'), 'utf8'))
) {
  failures.push('Realtime voice tool results must carry an explicit safe spoken reply and saved/not-saved instruction.')
}

if (!/NOT_SAVED_MESSAGE\s*=\s*'No problem\. I have not saved anything\.'/.test(native) || (native.match(/requestVoiceReply\(NOT_SAVED_MESSAGE\)/g) || []).length < 3) {
  failures.push('Rejected or cancelled drafts with Spoken reply enabled must speak back that nothing was saved.')
}

if (!/const draftIsReviewOrHandoff\s*=\s*Boolean\(draft\?\.canConfirm\s*\|\|\s*draft\?\.appTarget\?\.path\)/.test(native) || !/draftIsReviewOrHandoff\s*&&\s*draft\s*&&\s*isRejectingDraftText\(rawTypedTranscript\)/.test(native)) {
  failures.push('Typed rejection shortcuts must only cancel real review or handoff drafts, so normal conversation replies can continue through Talk to Helfi.')
}

if (!/discardFooterLabel\s*=\s*primaryFooterIsHandoff\s*\?\s*'Cancel'\s*:\s*"Don't save"/.test(native) || /style=\{styles\.handoffButton\}/.test(native)) {
  failures.push('Talk to Helfi handoff drafts must use one clear footer action, with Cancel wording instead of a duplicate in-panel handoff button.')
}

const foodContext = native.match(/case 'food':([\s\S]*?)case 'water':/)?.[1] || ''
const symptomsContext = native.match(/case 'symptoms':([\s\S]*?)case 'health-image':/)?.[1] || ''
const healthImageContext = native.match(/case 'health-image':([\s\S]*?)case 'mood':/)?.[1] || ''

if (!/Show me what you are eating/.test(foodContext) || !/Show food \/ add by photo/.test(foodContext)) {
  failures.push('Food context must keep food-specific camera wording.')
}

if (/Show me what you are eating|Food Diary|Show food \/ add by photo/i.test(symptomsContext)) {
  failures.push('Symptom context must not use food-camera wording.')
}

if (!/not diagnosis/i.test(symptomsContext)) {
  failures.push('Symptom context must keep the no-diagnosis wording.')
}

if (!/Add health image note/.test(symptomsContext) || !/launchContext\.section === 'health-image' \|\| launchContext\.section === 'symptoms'/.test(native)) {
  failures.push('Symptom context must keep a safe Health Image Notes vision handoff.')
}

if (/Show me what you are eating|Food Diary|Show food \/ add by photo/i.test(healthImageContext)) {
  failures.push('Health-image context must not use food-camera wording.')
}

if (!/cannot diagnose from photos/i.test(healthImageContext)) {
  failures.push('Health-image context must keep the no-diagnosis photo wording.')
}

if (!/inWaterContext/.test(route) || !/tryParseWaterRequest\(transcript,\s*localDate,\s*launchContext\)/.test(route)) {
  failures.push('Water context must keep short natural water command support.')
}

if (!/inExerciseContext/.test(route) || !/tryParseExerciseRequest\(transcript,\s*launchContext\)/.test(route)) {
  failures.push('Exercise context must keep short natural exercise command support.')
}

if (!/inJournalContext/.test(route) || !/tryParseJournalRequest\(transcript,\s*launchContext\)/.test(route)) {
  failures.push('Journal context must keep note-like text command support.')
}

if (!/naturalFoodListFromSpeech/.test(route) || !/tryParseDirectFoodRequest\(transcript,\s*launchContext\)/.test(route)) {
  failures.push('Food context must keep natural eating-speech command support.')
}

if (!/pendingFollowUpDraft/.test(native) || !/followUpTranscript\(pendingFollowUpDraft/.test(native)) {
  failures.push('Native voice assistant must remember follow-up questions such as missing food or water amounts.')
}

if (!/conversationTurns/.test(native) || !/appendConversationTurns/.test(native) || !/Conversation/.test(native) || !/Helfi/.test(native) || !/slice\(-8\)/.test(native)) {
  failures.push('Native Talk to Helfi must keep a short in-panel conversation trail for follow-up exchanges.')
}

if (!/VOICE_CONVERSATION_MEMORY_KEY/.test(native) || !/VOICE_CONVERSATION_MEMORY_TTL_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/.test(native) || !/loadConversationMemory/.test(native) || !/saveConversationMemory/.test(native) || !/voiceMemoryUserId/.test(native) || !/parsed\?\.userId/.test(native)) {
  failures.push('Native Talk to Helfi must keep only short time-limited same-device conversation memory for the current signed-in user across panel reopen.')
}

if (!/clearConversationMemory/.test(native) || !/AsyncStorage\.removeItem\(VOICE_CONVERSATION_MEMORY_KEY\)/.test(native) || !/New chat/.test(native) || !/setDraft\(null\)/.test(native) || !/stopPlayback\(\)\.catch/.test(native)) {
  failures.push('Native Talk to Helfi must offer a safe New chat reset that clears short conversation memory and stops spoken playback without saving.')
}

if (
  !/requestConversationHistory/.test(native) ||
  !/conversationHistory:\s*requestConversationHistory/.test(native) ||
  !/form\.append\('conversationHistory', JSON\.stringify\(requestConversationHistory\)\)/.test(native) ||
  !/parseConversationHistory/.test(route) ||
  !/conversationHistoryLine/.test(route) ||
  !/Recent Talk to Helfi conversation/.test(route) ||
  !/runJsonCommandModel\(aiIntentClient,\s*transcript,\s*localDate,\s*user\.id,\s*launchContext,\s*conversationHistory/.test(route)
) {
  failures.push('Native Talk to Helfi must send recent in-panel conversation to the AI intent router for natural follow-ups.')
}

if (
  !/reviewedDraftContextLine/.test(route) ||
  !/Draft currently being reviewed/.test(route) ||
  !/correcting the draft currently being reviewed/.test(route) ||
  !/preserve any details the user did not change/.test(route) ||
  !/runJsonCommandModel\(aiIntentClient,\s*transcript,\s*localDate,\s*user\.id,\s*launchContext,\s*conversationHistory,\s*confirmationDraft(?:,\s*realtimeActionHint)?\)/.test(route) ||
  !/runJsonCommandModel\(openai,\s*transcript,\s*localDate,\s*user\.id,\s*launchContext,\s*conversationHistory,\s*confirmationDraft(?:,\s*realtimeActionHint)?\)/.test(route)
) {
  failures.push('Native Talk to Helfi must show the reviewed draft to AI so correction requests can revise it safely.')
}

if (!/parseFollowUpDraft/.test(route) || !/followUpTranscript\(followUpDraft,\s*transcript\)/.test(route)) {
  failures.push('Native voice route must combine spoken follow-up answers with the pending draft.')
}

if (!/isConfirmingDraftText/.test(native) || !/saveDraft\(draft\)/.test(native) || !/confirmationDraft/.test(native)) {
  failures.push('Native voice assistant must let the user confirm a reviewed draft by saying or typing yes/save it.')
}

if (!/parseConfirmationDraft/.test(route) || !/confirmNow/.test(route) || !/voice-assistant:confirm-command/.test(route)) {
  failures.push('Native voice route must recognize spoken confirmation after transcription.')
}

if (
  !/followUpWaterTranscript/.test(native) ||
  !/How much liquid should I log/.test(native) ||
  !/sugar-free, or with sugar or honey/.test(native) ||
  !/How much\\s\+\(sugar\|honey\)/.test(native) ||
  !/followUpWaterTranscript/.test(route) ||
  !/sugar-free, or with sugar or honey/.test(route)
) {
  failures.push('Water follow-up answers must stay connected to the pending water request.')
}

if (
  !/followUpExerciseTranscript/.test(native) ||
  !/followUpMoodTranscript/.test(native) ||
  !/followUpJournalTranscript/.test(native) ||
  !/What exercise should I log/.test(native) ||
  !/How are you feeling/.test(native) ||
  !/What would you like me to write in the journal/.test(native)
) {
  failures.push('Exercise, mood, and journal follow-up answers must stay connected to their pending requests.')
}

if (!/isRejectingDraftText/.test(route) || !/rejectNow/.test(route) || !/voice-assistant:reject-command/.test(route) || !/data\?\.rejectNow/.test(native)) {
  failures.push('Native voice route must recognize spoken rejection after transcription.')
}

const postStoredFavoritesIndex = route.indexOf('const storedFavorites = await loadStoredFavorites')
const aiFirstIndex = route.indexOf('runJsonCommandModel(aiIntentClient', postStoredFavoritesIndex)
const localFavoriteFallbackIndex = route.indexOf('const favoriteDraft', postStoredFavoritesIndex)
if (!/AI-first intent router/.test(route) || aiFirstIndex < 0 || localFavoriteFallbackIndex < 0 || aiFirstIndex > localFavoriteFallbackIndex) {
  failures.push('Talk to Helfi must use AI-first intent understanding before local phrase fallbacks when AI sharing is allowed.')
}

if (!/any language, mixed languages, messy dictation/.test(route) || !/isConfirmingDraftText\('sí'\)/.test(commandBehavior)) {
  failures.push('Talk to Helfi must keep any-language intent wording and multilingual confirmation checks.')
}

if (!/symptom_note/.test(route) || !/buildSymptomNotesHandoffDraft/.test(route) || !/registrar dolor de cabeza hoy/.test(commandBehavior)) {
  failures.push('Talk to Helfi must keep safe any-language symptom-note support.')
}

if (!/Ask Helfi/.test(native) || !/Don't save/.test(native) || !/Save this/.test(native)) {
  failures.push('Native Talk to Helfi review controls must stay conversational and clear.')
}

if (
  !/parseVoiceAssistantUrl/.test(rootNavigator) ||
  !/host === 'voice'/.test(rootNavigator) ||
  !/path === '\/native\/voice'/.test(rootNavigator) ||
  !/url\.searchParams\.get\('text'\)/.test(rootNavigator) ||
  !/url\.searchParams\.get\('request'\)/.test(rootNavigator) ||
  !/url\.searchParams\.get\('q'\)/.test(rootNavigator) ||
  !/autoSubmit:\s*transcript\.trim\(\)\.length > 0/.test(rootNavigator) ||
  !/section:\s*\(url\.searchParams\.get\('section'\) \|\| 'generic'\)/.test(rootNavigator) ||
  !/openVoiceAssistant\(voiceLink\)/.test(rootNavigator)
) {
  failures.push('Native app links must keep opening Talk to Helfi with an auto-submitted request and current app context.')
}

if (
  !/isFoodRecommendationRequest/.test(route) ||
  !/what should I eat/i.test(route) ||
  !route.includes('што\\s+да\\s+јадам') ||
  !/преостанати/.test(route) ||
  !/qué\\s\+debo\\s\+comer/.test(route) ||
  !/que\\s\+devrais-je\\s\+manger/.test(route)
) {
  failures.push('Food recommendation requests must stay recognized as Talk to Helfi meal advice.')
}

if (!/buildFoodDiarySnapshot\(\{\s*userId,\s*localDate,\s*tzOffsetMin\s*\}\)/.test(route)) {
  failures.push('Voice meal recommendations must keep using the current Food Diary snapshot.')
}

if (
  !/date\?:\s*string/.test(native) ||
  !/const requestLocalDate = requestContext\.date \|\| todayLocalDate\(\)/.test(native) ||
  !/localDate:\s*requestLocalDate/.test(native) ||
  !/form\.append\('localDate', requestLocalDate\)/.test(native) ||
  !/openVoiceAssistant\(\{\s*source:\s*'button',\s*autoSubmit:\s*true,\s*transcript:\s*'What should I eat based on calories and nutrients left today\?'/.test(trackCalories) ||
  !/meal:\s*recommendedTargetMeal/.test(trackCalories)
) {
  failures.push('Food Diary Ask AI must open Talk to Helfi directly and preserve the selected diary date and meal for context.')
}

if (
  !/useVoiceAssistant/.test(smartHealthCoach) ||
  !/buildAskHelfiTipPrompt/.test(smartHealthCoach) ||
  !/openVoiceAssistant\(\{\s*source:\s*'button',\s*autoSubmit:\s*true/.test(smartHealthCoach) ||
  !/section:\s*'health-coach'/.test(smartHealthCoach) ||
  !/I have a question about this Helfi health coach tip/.test(smartHealthCoach) ||
  !/Ask Helfi/.test(smartHealthCoach) ||
  /NATIVE_WEB_PAGES\.talkToHelfi|path:\s*chatRoute\.path|Ask AI/.test(smartHealthCoach)
) {
  failures.push('Health Coach tip questions must open native Talk to Helfi with the tip context, not the old web Ask AI chat.')
}

if (!/buildQuickRecipeDraft\(transcript,\s*localDate,\s*launchContext\)/.test(route)) {
  failures.push('Quick recipe shortcuts must receive launch context so Food Diary recommendations can use diary-aware AI.')
}

if (
  !/recipeDraft:\s*importDraft/.test(route) ||
  !/voiceRecipeDraft/.test(mainNavigator) ||
  !/voiceRecipeDraft/.test(trackCalories) ||
  !/recipeDraft:\s*target\.recipeDraft/.test(mainTabs) ||
  !/recipeDraft:\s*nativeTarget\.recipeDraft/.test(native) ||
  !/openNativeMealBuilder\(meal,\s*\{[\s\S]*?ingredients:[\s\S]*?steps:/m.test(trackCalories)
) {
  failures.push('Talk to Helfi recipe recommendations must open the native Build a meal tool with the recipe prefilled.')
}

if (!/recipeIngredientNutritionFallback/.test(trackCalories) || !/chickpeas\|chick peas/.test(trackCalories) || !/brown rice/.test(trackCalories) || !/olive oil/.test(trackCalories) || !/const nutrition = recipeIngredientNutritionFallback\(line\)/.test(trackCalories)) {
  failures.push('Talk to Helfi Build a meal handoffs must not import common recipe ingredients as zero-calorie items.')
}

if (!/I used today's diary context where available/.test(route)) {
  failures.push("Diary-aware meal recommendation handoff must clearly say it used today's diary context where available.")
}

const routeWithoutWakePhraseLine = route.replace(/Ignore wake phrases[^\n]+Talk to Healthy\.',?\n?/, '')
if (/Open Talk to Healthy|summary:\s*'Talk to Healthy'|title:\s*'Talk to Healthy'/.test(routeWithoutWakePhraseLine)) {
  failures.push('Native voice handoffs must show Talk to Helfi while still accepting old wake phrases.')
}

if (!/Open Talk to Helfi/.test(route) || !/Talk to Helfi/.test(native)) {
  failures.push('Native voice handoffs and panel titles must show the Talk to Helfi name.')
}

if (!/helfi:health-image-voice-action/.test(native) || !/helfi:health-image-voice-action/.test(healthImage) || !/pickImage/.test(healthImage)) {
  failures.push('Health-image vision button must open the native health-image picker, not only the screen.')
}

if (!/Use camera\/photo/.test(native) || !/Food photo/.test(native) || !/Journal photo/.test(native) || !/Health image note/.test(native) || !/visionChoiceBox/.test(native)) {
  failures.push('Main Talk to Helfi panel must offer an in-panel camera/photo chooser for food, journal, and health image notes.')
}

if (
  !/case 'health-intake'/.test(native) ||
  !/Add bottle label/.test(native) ||
  !/Supplement camera/.test(native) ||
  !/Medication camera/.test(native) ||
  !/openHealthIntakeLiveCamera/.test(native) ||
  !/voiceReview',\s*'true'/.test(native) ||
  !/api\/analyze-supplement-image/.test(native)
) {
  failures.push('Health Intake Talk to Helfi must offer supplement and medication live camera mode with the existing review-first image route available behind the safe path.')
}

if (
  /Read this label|label scanner|takePictureAsync|launchImageLibraryAsync|photo library/i.test(native) ||
  /captureHealthIntakeBottleFrame|scanHealthIntakeBottle/.test(native)
) {
  failures.push('Talk to Helfi Health Intake camera mode must not present scanner-style capture/photo-library controls as the primary experience.')
}

if (
  !/if \(routeName === 'HealthSetup'\) return \{ section: 'health-intake', title: 'Health Intake' \}/.test(mainNavigator) ||
  !/if \(routeName === 'NativeWebTool'\)/.test(mainNavigator) ||
  !/path\.startsWith\('\/onboarding'\)\) return \{ section: 'health-intake', title: 'Health Intake' \}/.test(mainNavigator) ||
  !/headerRight:\s*\(\)\s*=>\s*\([\s\S]*?<VoiceAssistantIconButton[\s\S]*?context=\{voiceContextForStackRoute\(route\.name,\s*route\.params\)\}/.test(mainNavigator)
) {
  failures.push('Native onboarding and Health Intake web screens must open Talk to Helfi with Health Intake context so bottle-label choices are available.')
}

if (
  !/findHealthIntakeReviewMatch/.test(route) ||
  !/enrichHealthIntakeDraftWithCatalogMatches/.test(route) ||
  !/ensureSupplementCatalogSchema/.test(healthIntakeReviewMatch) ||
  !/ensureMedicationCatalogSchema/.test(healthIntakeReviewMatch) ||
  !/searchMedicationReferenceNames/.test(healthIntakeReviewMatch) ||
  !/searchSupplementReferenceNames/.test(healthIntakeReviewMatch) ||
  !/rxnorm/.test(healthIntakeReviewMatch) ||
  !/openfda/.test(healthIntakeReviewMatch) ||
  !/dsld/.test(healthIntakeReviewMatch) ||
  !/searchMedicationReferenceNames/.test(medicationSearch) ||
  !/searchSupplementReferenceNames/.test(supplementSearch) ||
  !/catalogMatch/.test(route) ||
  !/Possible match:/.test(native)
) {
  failures.push('Health Intake voice drafts must show possible local and external medication/supplement search matches during review without auto-saving.')
}

if (
  !/requestAiDataSharingPermission/.test(native) ||
  !/No camera or voice data was sent/.test(native) ||
  !/form\.append\('scanType', itemType\)/.test(native) ||
  !/setDraft\(nextDraft\)/.test(native) ||
  !/setVisionChoicesOpen\(false\)/.test(native)
) {
  failures.push('Health Intake camera mode must ask AI sharing consent and keep review drafts instead of saving automatically.')
}

if (!/openHealthIntakeLiveCamera[\s\S]*?ensureVoicePaidAccess\(\)[\s\S]*?requestAiDataSharingPermission\(\)/.test(native)) {
  failures.push('Health Intake live camera mode must recheck paid access before asking AI consent or opening camera.')
}

if (
  !/detectHealthIntakeBottleTarget/.test(route) ||
  !/buildHealthIntakeBottleHandoffDraft/.test(route) ||
  !/openHealthIntakeLiveCamera/.test(route) ||
  !/openHealthIntakeBottleChoices/.test(route) ||
  !/nativeTarget\?\.type === 'voiceAction'[\s\S]*?openHealthIntakeCameraMode/.test(native) ||
  !/setLaunchContext\(\{ section: 'health-intake', title: 'Health Intake' \}\)/.test(native)
) {
  failures.push('Spoken Health Intake bottle-label requests must open the same safe live camera mode, including ambiguous bottle-type choices.')
}

if (
  !/accessibilityLabel="Talk to Helfi message"/.test(native) ||
  !/testID="talk-to-helfi-message-input"/.test(native) ||
  !/testID="talk-to-helfi-inline-submit"/.test(native) ||
  !/testID="talk-to-helfi-footer-submit"/.test(native)
) {
  failures.push('Talk to Helfi text input and submit buttons must have stable test targets so the message box is not confused with Ask Helfi buttons.')
}

if (!/scroll:\s*\{\s*flex:\s*1\s*\}/.test(native) || !/contentWithFooterSpace/.test(native) || !/paddingBottom:\s*132/.test(native) || !/style=\{styles\.scroll\}\s*contentContainerStyle=\{\[styles\.content,\s*styles\.contentWithFooterSpace\]\}/.test(native)) {
  failures.push('Talk to Helfi scroll content must keep enough bottom space so the follow-up Ask Helfi button is not hidden behind the footer.')
}

if (!/!\s*draftIsActionable\s*\?\s*\(/.test(native) || !/accessibilityLabel="Ask Helfi"[\s\S]{0,400}onPress=\{\(\)\s*=>\s*sendDraftRequest\(\)\}/.test(native)) {
  failures.push('Talk to Helfi conversation replies must keep a footer Ask Helfi action for follow-up messages without showing save/build controls.')
}

if (
  !/const showDraftCard\s*=\s*Boolean\(draft\s*&&\s*draftIsActionable\)/.test(native) ||
  !/!\s*voiceSessionActive\s*&&\s*!\s*showingConversationReview\s*&&\s*showDraftCard\s*&&\s*draft\s*&&/.test(native) ||
  !/voiceCallScreen/.test(native) ||
  !/transcriptReview/.test(native) ||
  /summary:\s*'Ready to build meal'/.test(route)
) {
  failures.push('Talk to Helfi must not show a draft-style meal card before the user clearly asks to build the meal.')
}

if (!/draft\?\.action === 'recipe' && !draft\?\.canConfirm/.test(native) || !/form\.append\('followUpDraft'/.test(native) || !/followUpDraft:\s*followUpDraftPayload/.test(native)) {
  failures.push('Talk to Helfi must send visible meal recommendation drafts as follow-up context for natural replies like that sounds good.')
}

if (/Alert\.alert\('Use camera\/photo'/.test(native)) {
  failures.push('Main Talk to Helfi camera/photo choices must stay inside the assistant panel instead of a separate alert.')
}

if (!/action:\s*'openPhoto'/.test(route) || !/Food photo/.test(route) || !/take\\s\+\(\?:a\\s\+\)\?photo/.test(route)) {
  failures.push('Spoken food photo requests must hand off to the native food photo picker.')
}

if (!/route:\s*'HealthJournal'/.test(route) || !/action:\s*'pickPhoto'/.test(route) || !/helfi:journal-voice-action/.test(native)) {
  failures.push('Spoken journal photo requests must hand off to the native journal photo picker.')
}

if (!/route:\s*'HealthImageNotes'/.test(route) || !/action:\s*'pickImage'/.test(route) || !/helfi:health-image-voice-action/.test(native)) {
  failures.push('Spoken health image note requests must hand off to the native health image picker.')
}

if (
  !/normalizeSpokenFollowUpAnswer/.test(native) ||
  !/грама/.test(native) ||
  !/мл/.test(native) ||
  !/мед/.test(native) ||
  !/gramos/.test(native) ||
  !/millilitres/.test(native) ||
  !/miel/.test(native) ||
  !native.includes('sans\\s+sucre') ||
  !/gramm/.test(native) ||
  !/milliliter/.test(native) ||
  !/honig/.test(native) ||
  !native.includes('ohne\\s+zucker') ||
  !/grammi/.test(native) ||
  !/millilitri/.test(native) ||
  !/miele/.test(native) ||
  !native.includes('senza\\s+zucchero') ||
  !/gramas/.test(native) ||
  !/mililitros/.test(native) ||
  !/mel/.test(native) ||
  !native.includes('sem\\s+açúcar')
) {
  failures.push('Native Talk to Helfi must understand common Macedonian, Spanish, French, German, Italian, and Portuguese follow-up amounts and drink details.')
}

if (!/отвори/.test(route) || !route.includes('дневник\\s+за\\s+храна') || !/вода/.test(route) || !/симптоми/.test(route) || !/кредити/.test(route)) {
  failures.push('Talk to Helfi must understand common Macedonian app-opening handoffs.')
}

if (!/agua/.test(route) || !/eau/.test(route) || !/diario/.test(route) || !/santé/.test(route) || !/camine|caminé/.test(route) || !/Je me sens|je me sens/.test(route)) {
  failures.push('Talk to Helfi must keep common Spanish and French no-AI fallbacks for water, journal, exercise, and mood.')
}

if (!/ROMANCE_HEALTH_PATTERN/.test(route) || !/dolor\\s\+de\\s\+cabeza/.test(route) || !/mal\\s\+de\\s\+tête/.test(route) || !/ROMANCE_MEDICAL_ADVICE_PATTERN/.test(route)) {
  failures.push('Talk to Helfi must keep safe Spanish and French symptom-note tracking and medical-advice handling.')
}

if (!/wasser/.test(route) || !/tagebuch/.test(route) || !/gegangen/.test(route) || !/Ich fühle mich|ich fühle mich/.test(route) || !/GERMAN_HEALTH_PATTERN/.test(route) || !/kopfschmerzen/.test(route)) {
  failures.push('Talk to Helfi must keep common German no-AI fallbacks for water, journal, exercise, mood, and symptom safety.')
}

if (!/translateLocalizedFoodRequest/.test(route) || !/cacahuetes/.test(route) || !/cacahuètes/.test(route) || !/erdnüsse/.test(route)) {
  failures.push('Talk to Helfi must keep common Spanish, French, and German no-AI food logging fallbacks.')
}

if (!/acqua/.test(route) || !/salute/.test(route) || !/camminato/.test(route) || !/mi sento/i.test(route) || !/mal/.test(route) || !/testa/.test(route) || !/arachidi/.test(route)) {
  failures.push('Talk to Helfi must keep common Italian no-AI fallbacks for food, water, journal, exercise, mood, and symptom safety.')
}

if (!/água|agua/.test(route) || !/saúde|saude/.test(route) || !/caminhei/.test(route) || !/me sinto/i.test(route) || !/dor/.test(route) || !/cabeça|cabeca/.test(route) || !/amendoins/.test(route)) {
  failures.push('Talk to Helfi must keep common Portuguese no-AI fallbacks for food, water, journal, exercise, mood, and symptom safety.')
}

if (!/launchCameraAsync/.test(healthImage) || !/launchImageLibraryAsync/.test(healthImage)) {
  failures.push('Health-image notes must keep camera and photo-library choices for vision input.')
}

if (!/form\.append\('saveToHistory',\s*'false'\)/.test(healthImage) || !/saveResultToHistory/.test(healthImage) || !/Review these notes before saving them to your history/.test(healthImage) || /useState\(false\)[\s\S]{0,80}saveToHistory/.test(healthImage)) {
  failures.push('Health-image notes must create notes first and only save to history after review.')
}

if (!/openFoodPhotoPicker\(meal,\s*'voiceReview'\)/.test(trackCalories) || !/usageMode === 'voiceReview'/.test(trackCalories) || !/Review before saving/.test(trackCalories) || !/openNativeMealBuilder\(meal/.test(trackCalories)) {
  failures.push('Talk to Helfi food photo handoffs must open Build a meal for review instead of saving photo analysis automatically.')
}

if (
  !/getUserIdFromNativeAuth/.test(analyzeSupplementImage) ||
  !/voiceReview/.test(analyzeSupplementImage) ||
  !/hasAiConsentFlag/.test(analyzeSupplementImage) ||
  !/hasPaidVoiceWalletAccess/.test(analyzeSupplementImage) ||
  !/voice_subscription_required/.test(analyzeSupplementImage) ||
  !/AI sharing consent is required before a bottle label can be reviewed by Talk to Helfi/.test(analyzeSupplementImage) ||
  !/buildVoiceReviewDraft/.test(analyzeSupplementImage) ||
  !/parseVoiceReviewLabelResult/.test(analyzeSupplementImage) ||
  !/cleanLabelName/.test(analyzeSupplementImage) ||
  !/cleanLabelDosage/.test(analyzeSupplementImage) ||
  !/hasPrivateLabelSignal/.test(analyzeSupplementImage) ||
  !/patient\|pharmacy\|pharmacist\|prescriber/.test(analyzeSupplementImage) ||
  !/doctor\\s\*/.test(analyzeSupplementImage) ||
  !/doseMatch/.test(analyzeSupplementImage) ||
  !/withoutDose/.test(analyzeSupplementImage) ||
  !/clearly visible dose\/strength/.test(analyzeSupplementImage) ||
  !/pharmacy details, prescriber names, patient names, or prescription numbers/.test(analyzeSupplementImage) ||
  !/\{"name":"Brand - Product","dosage":"clearly visible dose or empty string"\}/.test(analyzeSupplementImage) ||
  !/dosage:\s*dose/.test(analyzeSupplementImage) ||
  !/countPriorImageNameScans/.test(analyzeSupplementImage) ||
  !/distinct:\s*\['scanId'\]/.test(analyzeSupplementImage) ||
  !/findHealthIntakeReviewMatch/.test(analyzeSupplementImage) ||
  !/searchMedicationReferenceNames/.test(healthIntakeReviewMatch) ||
  !/searchSupplementReferenceNames/.test(healthIntakeReviewMatch) ||
  !/catalogMatch/.test(analyzeSupplementImage) ||
  !/Math\.max\(savedImageCount,\s*usedScanCount\)/.test(analyzeSupplementImage) ||
  !/signNativeVoiceDraft/.test(analyzeSupplementImage) ||
  !/health_intake_items/.test(analyzeSupplementImage) ||
  !/reviewNonce:\s*crypto\.randomUUID\(\)/.test(analyzeSupplementImage) ||
  !/isPlaceholderName\(cleanedName\)/.test(analyzeSupplementImage) ||
  !/could not read the label clearly enough/i.test(analyzeSupplementImage) ||
  !/form\.append\('aiConsentGranted',\s*'true'\)/.test(native)
) {
  failures.push('Supplement/medication bottle image analysis must support native signed review drafts, require paid access and AI consent, include catalog review hints, and reject unclear labels for Talk to Helfi.')
}

try {
  const helperStart = analyzeSupplementImage.indexOf('function cleanText')
  const helperEnd = analyzeSupplementImage.indexOf('function parseLegacyLabelName')
  if (helperStart < 0 || helperEnd < helperStart) {
    failures.push('Supplement/medication bottle image analysis helper checks could not locate label parsing helpers.')
  } else {
    const helperSource = analyzeSupplementImage.slice(helperStart, helperEnd)
    const helperCheck = `
${helperSource}
const parsedMetformin = parseVoiceReviewLabelResult('{"name":"Metformin 500 mg 120 tablets","dosage":"500 mg"}', 'medication')
if (parsedMetformin.name !== 'Metformin') throw new Error('Label review must strip dose and package count from medication names.')
if (parsedMetformin.dosage !== '500 mg') throw new Error('Label review must keep clear medication dose in the dosage field.')
const parsedVitamin = parseVoiceReviewLabelResult('{"name":"Vitamin D3 1000 IU 120 capsules","dosage":"1000 IU"}', 'supplement')
if (parsedVitamin.name !== 'Vitamin D3') throw new Error('Label review must strip dose and package count from supplement names.')
if (parsedVitamin.dosage !== '1000 IU') throw new Error('Label review must keep clear supplement dose in the dosage field.')
const parsedNameOnlyDose = parseVoiceReviewLabelResult('{"name":"Metformin 500 mg 120 tablets"}', 'medication')
if (parsedNameOnlyDose.name !== 'Metformin') throw new Error('Label review must strip misplaced dose text from medication names.')
if (parsedNameOnlyDose.dosage !== '500 mg') throw new Error('Label review must preserve clear dose text even when AI puts it only in the name.')
const parsedPlainTextDose = parseVoiceReviewLabelResult('Vitamin D3 1000 IU 120 capsules', 'supplement')
if (parsedPlainTextDose.name !== 'Vitamin D3') throw new Error('Label review must strip dose and count from plain-text supplement labels.')
if (parsedPlainTextDose.dosage !== '1000 IU') throw new Error('Label review must preserve clear dose from plain-text supplement labels.')
const doctorsBest = parseVoiceReviewLabelResult('{"name":"Doctor’s Best - Magnesium Glycinate 100 mg 120 tablets"}', 'supplement')
if (doctorsBest.name !== 'Doctor’s Best - Magnesium Glycinate') throw new Error('Label review must allow real supplement brands such as Doctor’s Best.')
if (doctorsBest.dosage !== '100 mg') throw new Error('Label review must keep dose for Doctor’s Best-style supplement labels.')
const rxVitamins = parseVoiceReviewLabelResult('{"name":"Rx Vitamins - D3 Liquid 1000 IU"}', 'supplement')
if (rxVitamins.name !== 'Rx Vitamins - D3 Liquid') throw new Error('Label review must allow real supplement brands such as Rx Vitamins.')
if (rxVitamins.dosage !== '1000 IU') throw new Error('Label review must keep dose for Rx Vitamins-style labels.')
const drMercola = parseVoiceReviewLabelResult('{"name":"Dr. Mercola - Vitamin D3 1000 IU"}', 'supplement')
if (drMercola.name !== 'Dr. Mercola - Vitamin D3') throw new Error('Label review must allow real supplement brands such as Dr. Mercola.')
if (drMercola.dosage !== '1000 IU') throw new Error('Label review must keep dose for Dr.-brand supplement labels.')
const probiotic = parseVoiceReviewLabelResult('{"name":"Garden of Life - Probiotic 10 billion CFU 30 capsules"}', 'supplement')
if (probiotic.name !== 'Garden of Life - Probiotic') throw new Error('Label review must strip CFU strength and package count from probiotic names.')
if (probiotic.dosage !== '10 billion CFU') throw new Error('Label review must keep probiotic CFU strength in the dosage field.')
const privateLabel = parseVoiceReviewLabelResult('{"name":"Patient Jane Doe Rx 123 Metformin","dosage":"500 mg"}', 'medication')
if (privateLabel.name !== 'Unknown Medication') throw new Error('Label review must reject names containing private prescription wording.')
const prescriberLabel = parseVoiceReviewLabelResult('{"name":"Dr John Smith Metformin 500 mg","dosage":"500 mg"}', 'medication')
if (prescriberLabel.name !== 'Unknown Medication') throw new Error('Label review must reject prescriber-looking names on medication labels.')
const doctorNameLabel = parseVoiceReviewLabelResult('{"name":"Doctor name: John Smith Metformin 500 mg","dosage":"500 mg"}', 'medication')
if (doctorNameLabel.name !== 'Unknown Medication') throw new Error('Label review must reject explicit doctor-name private wording.')
const unsafeDose = parseVoiceReviewLabelResult('{"name":"Metformin","dosage":"RX 123 take as directed"}', 'medication')
if (unsafeDose.dosage !== '') throw new Error('Label review must drop private or instruction-like dosage text.')
`
    const compiled = ts.transpileModule(helperCheck, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    vm.runInNewContext(compiled, {}, { timeout: 5000 })
  }
} catch (error) {
  failures.push(error?.message || 'Supplement/medication bottle label parser behavior check failed.')
}

if (!/helfi:journal-voice-action/.test(native) || !/helfi:journal-voice-action/.test(healthJournal) || !/pickPhoto/.test(healthJournal)) {
  failures.push('Journal vision button must open the native journal photo picker, not only the screen.')
}

if (!/launchCameraAsync/.test(healthJournal) || !/launchImageLibraryAsync/.test(healthJournal)) {
  failures.push('Health Journal photo notes must keep camera and photo-library choices for vision input.')
}

if (!/requestAiDataSharingPermission/.test(healthJournal) || !/No media was sent/.test(healthJournal)) {
  failures.push('Health Journal media summaries must ask AI sharing permission before sending photo or voice data.')
}

if (!/isSymptomTrackingRequest/.test(route) || !/buildSymptomNotesHandoffDraft/.test(route)) {
  failures.push('Safe symptom tracking requests must create Symptom Notes drafts instead of becoming diagnosis requests.')
}

if (!/isSymptomTrackingRequest\(raw\)[\s\S]*?isMedicalSafetyRequest\(raw\)/.test(route)) {
  failures.push('Symptom tracking handoff must run before the medical safety block.')
}

if (!/voiceAction:\s*'prefill'/.test(route) || !/voiceSymptoms/.test(symptomNotes) || !/setSelectedSymptoms/.test(symptomNotes)) {
  failures.push('Symptom Notes must accept voice-prefill fields from Talk to Helfi.')
}

const requiredSaveHandlers = [
  ['exercise', 'saveExercise'],
  ['mood', 'saveMood'],
  ['journal', 'saveJournal'],
  ['water', 'saveWater'],
  ['symptom_note', 'saveSymptomNote'],
  ['health_intake_items', 'saveHealthIntakeItems'],
  ['food_copy_previous', 'copyPreviousFood'],
  ['food_favorite', 'saveFavoriteFood'],
  ['food_build_meal', 'saveBuiltMeal'],
]

if (!/prisma\.symptomAnalysis\.create/.test(confirmRoute) || !/This is not medical advice/.test(confirmRoute) || !/resultKind === 'symptom_note'/.test(native)) {
  failures.push('Talk to Helfi must save reviewed symptom notes safely and navigate to Symptom Notes history.')
}

if (
  !/saveHealthIntakeItems/.test(confirmRoute) ||
  !/prisma\.supplement\.createMany/.test(confirmRoute) ||
  !/prisma\.medication\.createMany/.test(confirmRoute) ||
  !/findExistingHealthIntakeItem/.test(confirmRoute) ||
  !/buildHealthIntakeExistingUpdate/.test(confirmRoute) ||
  !/ensureSupplementCatalogSchema/.test(confirmRoute) ||
  !/ensureMedicationCatalogSchema/.test(confirmRoute) ||
  !/resultKind === 'health_intake'/.test(native) ||
  !/\/onboarding\?step=6/.test(native)
) {
  failures.push('Talk to Helfi must save reviewed Health Intake medications/supplements to normal onboarding records and reopen Health Intake.')
}

if (/prisma\.supplement\.deleteMany/.test(confirmRoute) || /prisma\.medication\.deleteMany/.test(confirmRoute)) {
  failures.push('Talk to Helfi Health Intake saves must add or update reviewed items without deleting the whole existing list.')
}

if (
  !/supplements:\s*dedupeItems\(user\.supplements\.map/.test(userData) ||
  !/medications:\s*dedupeItems\(user\.medications\.map/.test(userData) ||
  !/name:\s*supp\.name/.test(userData) ||
  !/dosage:\s*supp\.dosage/.test(userData) ||
  !/timing:\s*supp\.timing/.test(userData) ||
  !/name:\s*med\.name/.test(userData) ||
  !/dosage:\s*med\.dosage/.test(userData) ||
  !/timing:\s*med\.timing/.test(userData) ||
  !/scheduleInfo:\s*supp\.scheduleInfo\s*\|\|\s*'Daily'/.test(userData) ||
  !/scheduleInfo:\s*med\.scheduleInfo\s*\|\|\s*'Daily'/.test(userData)
) {
  failures.push('Saved Talk to Helfi Health Intake items must continue loading through the normal onboarding/profile user-data shape.')
}

for (const [action, handler] of requiredSaveHandlers) {
  if (!new RegExp(`draft\\.action === '${action}'[\\s\\S]*?${handler}\\(user\\.id, draft\\)`).test(confirmRoute)) {
    failures.push(`Confirm route must keep ${action} save support.`)
  }
}

if (!/hasSelfHarmRisk\(draft\?\.transcript\)/.test(confirmRoute)) {
  failures.push('Confirm route must keep self-harm save blocking.')
}

if (!/amountMl > 10000/.test(confirmRoute) || !/Water amount is outside the safe logging range/.test(confirmRoute)) {
  failures.push('Confirm route must cap water saves by converted millilitres, not only the raw spoken number.')
}

if (!/verifyNativeVoiceDraft\(user\.id,\s*draft\)/.test(confirmRoute) || !/sealReviewDraft\(user\.id,\s*draft\)/.test(route) || !/signNativeVoiceDraft/.test(reviewToken) || !/timingSafeEqual/.test(reviewToken) || !/NODE_ENV === 'production'/.test(reviewToken)) {
  failures.push('Confirm route must only save Talk to Helfi drafts with a valid signed review token.')
}

if (
  !/reviewNonce:\s*crypto\.randomUUID\(\)/.test(route) ||
  !/reviewIssuedAt:\s*Date\.now\(\)/.test(route) ||
  !/markReviewTokenUsed\(user\.id,\s*draft\)/.test(confirmRoute) ||
  !/prisma\.verificationToken\.create/.test(confirmRoute) ||
  !/P2002/.test(confirmRoute) ||
  !/already saved/i.test(confirmRoute)
) {
  failures.push('Confirm route must keep one-use Talk to Helfi review tokens to prevent duplicate saves.')
}

if (
  !/createNativeVoicePromptHandoff/.test(route) ||
  !/voicePromptToken/.test(route) ||
  !/HANDOFF_NAME_PREFIX\s*=\s*'__NATIVE_VOICE_PROMPT_HANDOFF__:/.test(promptHandoff) ||
  !/HANDOFF_TTL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/.test(promptHandoff) ||
  !/consumeNativeVoicePromptHandoff/.test(promptHandoffRoute) ||
  !/voice-prompt-handoff\?token=/.test(chatPage) ||
  !/credentials:\s*'include'/.test(chatPage)
) {
  failures.push('Talk to Helfi health-question handoffs must keep private short-lived prompt tokens instead of putting private speech in the page URL.')
}

if (!/triggerBackgroundRegeneration/.test(confirmRoute) || !/deleteSmartCoachNotificationsByCategories/.test(confirmRoute)) {
  failures.push('Confirm route must keep food save refresh/regeneration hooks.')
}

if (!/estimatedVoiceCost/.test(route) || !/estimateTranscriptionCostCents\(durationSeconds\)[\s\S]*?preflightWallet/.test(route)) {
  failures.push('Voice audio transcription must check credits before sending audio to AI.')
}

if (!/minimumRequestCredits\s*=\s*SIMPLE_MIN_CREDITS\s*\+\s*\(wantsVoiceReply\s*\?\s*VOICE_REPLY_MIN_CREDITS\s*:\s*0\)/.test(route)) {
  failures.push('Voice requests with spoken replies must check the minimum voice-reply credits before AI work.')
}

if (!/voice-assistant:clarification-command/.test(route) || !/chargedCredits:\s*chargeCents/.test(route)) {
  failures.push('Unclear audio commands must still charge for transcription work.')
}

if (!/helfi:voice-action-saved/.test(native) || !/helfi:health-journal-changed/.test(native) || !/helfi:mood-log-changed/.test(native) || !/helfi:mood-journal-changed/.test(native)) {
  failures.push('Native voice assistant must emit refresh events after saving non-food app actions.')
}

if (!/title:\s*'Food Diary'[\s\S]*?nativeTarget:\s*\{\s*type:\s*'tab',\s*tab:\s*'Food'\s*\}/.test(native) || !/route:\s*'HealthJournal'/.test(native) || !/route:\s*'MoodTracker',\s*params:\s*\{\s*tab:\s*'journal'\s*\}/.test(native) || !/route:\s*'MoodTracker',\s*params:\s*\{\s*tab:\s*'history'\s*\}/.test(native)) {
  failures.push('Native voice assistant must open the right app area after saving food, journal, and mood actions.')
}

if (!/helfi:health-journal-changed/.test(healthJournal) || !/setActiveTab\('history'\)/.test(healthJournal) || !/loadHistory\(\)/.test(healthJournal)) {
  failures.push('Health Journal must refresh and show history after Talk to Helfi saves a health journal note.')
}

if (!/initialTab\?:\s*'entry'\s*\|\s*'history'/.test(mainNavigator) || !/route\.params\?\.initialTab/.test(healthJournal) || !/selectedDate:\s*changedDate/.test(native)) {
  failures.push('Health Journal voice saves must open the History tab for the saved date.')
}

if (!/changedDate && changedDate !== selectedDate[\s\S]*?setSelectedDate\(changedDate\)/.test(trackCalories)) {
  failures.push('Food Diary must switch to the saved date after Talk to Helfi logs food, water, or exercise for another day.')
}

if (!/helfi:mood-log-changed/.test(moodTracker) || !/helfi:mood-journal-changed/.test(moodTracker) || !/setActiveTab\('history'\)/.test(moodTracker) || !/setActiveTab\('journal'\)/.test(moodTracker)) {
  failures.push('Mood Tracker must refresh mood and journal tabs after Talk to Helfi saves those items.')
}

const todayLocalDateBlock = moodTracker.match(/function todayLocalDate\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
if (!/now\.getFullYear\(\)/.test(todayLocalDateBlock) || /toISOString\(\)\.slice\(0,\s*10\)/.test(todayLocalDateBlock)) {
  failures.push('Mood Tracker must use the local calendar date, not UTC, for voice-saved mood logs.')
}

if (!/setJournalSearch\(''\)/.test(moodTracker) || !/loadJournalEntries\(''\)/.test(moodTracker)) {
  failures.push('Mood Journal must clear search before refreshing after Talk to Helfi saves a journal note.')
}

if (!/SAFE_SYMPTOM_NOTE_FALLBACK/.test(symptomNotes) || !/safeText\(result\.summary/.test(symptomNotes) || !/safeText\(item\.summary/.test(symptomNotes) || !/safeText\(flag/.test(symptomNotes) || !/safeText\(step/.test(symptomNotes)) {
  failures.push('Symptom Notes must safety-filter live and saved AI wording before display.')
}

if (!/safeText\(data\.disclaimer/.test(healthImage) || !/treat\|treatment\|cure/.test(healthImage) || !/The image is still sent for AI note creation after you approve AI sharing/.test(healthImage)) {
  failures.push('Health Image Notes must safety-filter result text and clearly explain history privacy vs AI sending.')
}

if (!/isPlainHealthToolOpenRequest/.test(route) || !/isSymptomTrackingRequest\(raw\)[\s\S]*?isMedicalSafetyRequest\(raw\)[\s\S]*?directTarget/.test(route)) {
  failures.push('Talk to Helfi navigation requests with medical advice wording must hit safety handling before app handoff.')
}

if (!/Talk to Helfi voice action/.test(creditCosts) || !/Talk to Helfi spoken reply/.test(creditCosts) || !/Talk to Helfi voice action/.test(billingScreen) || !/Talk to Helfi spoken reply/.test(billingScreen)) {
  failures.push('Billing displays must list Talk to Helfi voice and spoken reply credit costs.')
}

if (failures.length) {
  console.error('Native voice confirm guard FAILED:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Native voice confirm guard passed.')
