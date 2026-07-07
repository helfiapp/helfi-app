#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const routePath = path.join(root, 'app/api/native/voice-assistant/route.ts')
const realtimeRoutePath = path.join(root, 'app/api/native/voice-assistant/realtime/route.ts')
const voiceAssistantPath = path.join(root, 'native/src/voice/VoiceAssistant.tsx')
const realtimeClientPath = path.join(root, 'native/src/voice/realtimeVoice.ts')

let source = fs.readFileSync(routePath, 'utf8')
const realtimeSource = fs.existsSync(realtimeRoutePath) ? fs.readFileSync(realtimeRoutePath, 'utf8') : ''
const voiceAssistantSource = fs.existsSync(voiceAssistantPath) ? fs.readFileSync(voiceAssistantPath, 'utf8') : ''
const realtimeClientSource = fs.existsSync(realtimeClientPath) ? fs.readFileSync(realtimeClientPath, 'utf8') : ''
source = source
  .split('\n')
  .filter((line) => !line.trim().startsWith('import '))
  .join('\n')
  .replace(/^export\s+/gm, '')

const appended = `
async function __runNativeVoiceCommandBehaviorAssertions() {
  const failures = []
  const assert = (condition, message) => {
    if (!condition) failures.push(message)
  }

  const localDate = '2026-07-02'
  const dashboardContext = { section: 'dashboard', title: 'Dashboard' }
  const foodContext = { section: 'food', title: 'Food Diary', meal: 'snacks' }
  const waterContext = { section: 'water', title: 'Water Intake' }
  const journalContext = { section: 'journal', title: 'Health Journal' }
  const exerciseContext = { section: 'exercise', title: 'Exercise' }
  const moodContext = { section: 'mood', title: 'Mood Tracker' }
  const healthIntakeContext = { section: 'health-intake', title: 'Health Intake' }

  assert(isConfirmingDraftText('sí'), 'Spanish yes must confirm a reviewed draft.')
  assert(isConfirmingDraftText('oui'), 'French yes must confirm a reviewed draft.')
  assert(isConfirmingDraftText('ja'), 'German yes must confirm a reviewed draft.')
  assert(isConfirmingDraftText('はい'), 'Japanese yes must confirm a reviewed draft.')
  assert(isConfirmingDraftText('зачувај'), 'Macedonian save must confirm a reviewed draft.')
  assert(isConfirmingDraftText('потврди'), 'Macedonian confirm must confirm a reviewed draft.')
  assert(isRejectingDraftText('no gracias'), 'Spanish no thanks must reject a reviewed draft.')
  assert(isRejectingDraftText('non'), 'French no must reject a reviewed draft.')
  assert(isRejectingDraftText('nein'), 'German no must reject a reviewed draft.')
  assert(isRejectingDraftText('いいえ'), 'Japanese no must reject a reviewed draft.')
  assert(isRejectingDraftText('не'), 'Macedonian no must reject a reviewed draft.')
  assert(isRejectingDraftText('откажи'), 'Macedonian cancel must reject a reviewed draft.')
  assert(isRejectingDraftText('не зачувувај'), 'Macedonian do-not-save must reject a reviewed draft.')
  assert(/any language, mixed languages, messy dictation/.test(__routeSource), 'AI command understanding must explicitly support any-language messy speech.')
  assert(__realtimeRouteSource.includes('transcription: {') && __realtimeRouteSource.includes('model: REALTIME_TRANSCRIPTION_MODEL'), 'Realtime voice must request input transcripts for the chat review after voice mode.')
  assert(__realtimeRouteSource.includes("output_modalities: ['audio']"), 'Realtime voice must explicitly request spoken assistant replies.')
  if (__nativeSourcesAvailable) {
    assert(/conversation\.item\.input_audio_transcription\.completed/.test(__realtimeClientSource), 'Native realtime client must listen for spoken user transcripts.')
    assert(/response\.done/.test(__realtimeClientSource) && /response\.audio_transcript\.done/.test(__realtimeClientSource) && /response\.output_audio_transcript\.done/.test(__realtimeClientSource), 'Native realtime client must listen for completed assistant replies.')
    assert(/response\.audio_transcript\.delta/.test(__realtimeClientSource) && /response\.output_audio_transcript\.delta/.test(__realtimeClientSource) && /response\.output_text\.delta/.test(__realtimeClientSource), 'Native realtime client must track streaming assistant reply text.')
    assert(__realtimeClientSource.includes('payload?.delta') && __realtimeClientSource.includes('part?.transcript'), 'Native realtime client must read assistant text from delta and content part events.')
    assert(__realtimeClientSource.includes('const remoteStreams') && __realtimeClientSource.includes('remoteStreams.push(stream)'), 'Native realtime client must keep the assistant audio stream alive until the session ends.')
    assert(__realtimeClientSource.includes("callbacks.onStatus?.('speaking')"), 'Native realtime client must expose when Helfi is speaking.')
    assert(__voiceAssistantSource.includes("'speaking'") && __voiceAssistantSource.includes('Helfi is speaking'), 'Native live voice UI must show when Helfi is speaking.')
    assert(__realtimeClientSource.includes("LIVE_REALTIME_API_BASE_URL = 'https://helfi.ai'") && __realtimeClientSource.includes('realtimeApiBaseUrl'), 'Native realtime voice must fall back to live when local dev has no AI service.')
    assert(__voiceAssistantSource.includes('onTranscript: (text) => {') && __voiceAssistantSource.includes("appendConversationTurns([makeConversationTurn('user', text)])"), 'Native live voice transcripts must appear in the chat review after voice mode.')
  }
  assert(/Do not limit language understanding to the examples below/.test(__routeSource), 'AI command understanding must say examples are not language limits.')
  assert(/Arabic, Hindi, Japanese, Chinese, Greek, Turkish, and any other language/.test(__routeSource), 'AI command understanding must explicitly allow broad world languages beyond the local fallback examples.')
  const postRequestFlow = __routeSource.slice(__routeSource.indexOf('const storedFavorites'))
  assert(postRequestFlow.indexOf('if (aiIntentClient && aiConsentGranted)') > -1 && postRequestFlow.indexOf('if (aiIntentClient && aiConsentGranted)') < postRequestFlow.indexOf('const favoriteDraft'), 'Live AI understanding must run before local fallback routers when AI consent is granted.')
  assert(/return action confirm_draft/.test(__routeSource), 'AI command understanding must support any-language reviewed draft confirmation.')
  assert(/return action reject_draft/.test(__routeSource), 'AI command understanding must support any-language reviewed draft rejection.')
  assert(aiDraftDecision({ action: 'confirm_draft' }) === 'confirm', 'AI draft decision must recognize confirm_draft.')
  assert(aiDraftDecision({ action: 'reject_draft' }) === 'reject', 'AI draft decision must recognize reject_draft.')
  assert(/Recent Talk to Helfi conversation/.test(__routeSource), 'AI command understanding must receive recent in-panel conversation context.')
  assert(/pronouns, and corrections/.test(__routeSource), 'AI command understanding must use conversation history for natural follow-ups and corrections.')
  assert(/Draft currently being reviewed/.test(__routeSource), 'AI command understanding must receive the current reviewed draft for correction requests.')
  assert(/preserve any details the user did not change/.test(__routeSource), 'AI command understanding must preserve unchanged draft details during corrections.')
  assert(/Додај две јаболка/.test(__routeSource), 'AI command understanding must keep a Macedonian food logging example.')
  assert(/Ajoute 500 ml d’eau/.test(__routeSource), 'AI command understanding must keep a French water logging example.')
  assert(/Escribe en mi diario/.test(__routeSource), 'AI command understanding must keep a Spanish journal example.')
  assert(/symptom\.symptoms/.test(__routeSource), 'AI command understanding must keep structured symptom-note fields.')
  assert(__routeSource.includes('current section is health-coach') && __routeSource.includes('context for a health_question'), 'AI command understanding must use Health Coach context for tip questions.')
  assert(/createNativeVoicePromptHandoff/.test(__routeSource), 'Health question handoffs must keep private prompt token support.')
  assert(/voice-assistant:food-recommendation-command/.test(__routeSource), 'Diary-aware food recommendations must have a dedicated route before general health questions.')
  assert(__routeSource.includes("draft.action === 'health_question'") && __routeSource.includes('isFoodRecommendationRequest(transcript, launchContext)'), 'AI health-question classifications must be overridden for Food Diary meal recommendation requests.')
  assert(isFoodDiaryLaunchContext({ section: 'generic', title: 'Food Diary' }), 'Food Diary context must survive even if the section field is missing or stale.')
  assert(__routeSource.includes('buildFoodRecommendationConversationDraft(requestText, localDate, launchContext'), 'AI recipe classifications for Food Diary recommendations must stay conversational before Build a meal.')
  assert(/Honor allergies, dislikes, and dietary restrictions/.test(__routeSource) && /Never include restricted foods/.test(__routeSource), 'Live meal recommendation prompts must explicitly obey allergies, dislikes, and dietary restrictions.')
  assert(/health_intake_items/.test(__routeSource), 'AI command understanding must support Health Intake medication/supplement review drafts.')
	  assert(/recording current medications, vitamins, or supplements they already take/.test(__routeSource), 'Health Intake voice instructions must record only what the user already takes.')
	  assert(/include only items the user says they currently take/.test(__routeSource) && /do not include that excluded item/.test(__routeSource), 'Health Intake voice instructions must not include medications or supplements the user says they do not take.')
	  assert(/do not invent prescription strength, dose, timing, brand, or item type/.test(__routeSource), 'Health Intake voice instructions must not invent medication or supplement details.')
	  assert(/should I take, start, stop, change, increase, safe to take, side effects, interactions/.test(__routeSource), 'Health Intake voice instructions must route medication/supplement advice away from save drafts.')
	  assert(/findHealthIntakeReviewMatch/.test(__routeSource), 'Health Intake voice drafts must look for safe medication/supplement review matches.')
	  assert(/enrichHealthIntakeDraftWithCatalogMatches/.test(__routeSource), 'Health Intake voice drafts must attach catalog matches before review signing.')
	  assert(/HealthIntakeReviewMatch/.test(__routeSource), 'Health Intake catalog hints must use the shared review-match helper.')
	  assert(__routeSource.indexOf('const quickHealthIntakeDraft = tryParseHealthIntakeItemsRequest') > -1, 'Health Intake quick router must run before favourite matching.')
	  assert(__routeSource.indexOf('const quickHealthIntakeDraft = tryParseHealthIntakeItemsRequest') < __routeSource.indexOf('const earlyFavoriteDraft'), 'Health Intake wording must be checked before early favourite matching.')

		  const intakeTranscript = 'I take vitamin D, magnesium glycinate, fish oil, and metformin.'
  const intakeDraft = tryParseHealthIntakeItemsRequest(intakeTranscript, localDate, healthIntakeContext)
  assert(intakeDraft?.action === 'health_intake_items', 'Health Intake voice fallback must create a medication/supplement review draft.')
  assert(intakeDraft?.canConfirm === true, 'Health Intake voice fallback must be reviewable before saving.')
  assert(intakeDraft?.autoSave === false, 'Health Intake voice fallback must not auto-save.')
  assert((intakeDraft?.healthIntake?.items || []).some((item) => item.type === 'supplement' && /vitamin d/i.test(item.name)), 'Health Intake voice fallback must keep vitamin D as a supplement.')
  assert((intakeDraft?.healthIntake?.items || []).some((item) => item.type === 'supplement' && /magnesium glycinate/i.test(item.name)), 'Health Intake voice fallback must keep magnesium glycinate as a supplement.')
  assert((intakeDraft?.healthIntake?.items || []).some((item) => item.type === 'supplement' && /fish oil/i.test(item.name)), 'Health Intake voice fallback must keep fish oil as a supplement.')
  assert((intakeDraft?.healthIntake?.items || []).some((item) => item.type === 'medication' && /metformin/i.test(item.name)), 'Health Intake voice fallback must keep metformin as a medication.')
	  assert(/only recording what you already take/i.test(intakeDraft?.confirmationMessage || ''), 'Health Intake review message must say it only records what the user already takes.')
	  assert(/not recommending that you start, stop, or change/i.test(intakeDraft?.confirmationMessage || ''), 'Health Intake review message must keep medication safety wording.')

	  const typedIntakeDraft = tryParseHealthIntakeItemsRequest('I take medication Tadalafil and supplement magnesium glycinate.', localDate, healthIntakeContext)
	  assert((typedIntakeDraft?.healthIntake?.items || []).some((item) => item.type === 'medication' && /^Tadalafil$/i.test(item.name)), 'Health Intake voice fallback must keep stated medication type while cleaning the item name.')
	  assert((typedIntakeDraft?.healthIntake?.items || []).some((item) => item.type === 'supplement' && /^magnesium glycinate$/i.test(item.name)), 'Health Intake voice fallback must keep stated supplement type while cleaning the item name.')

  const addToHealthIntakeDraft = tryParseHealthIntakeItemsRequest('Add metformin 500 mg and vitamin D to my health intake.', localDate, healthIntakeContext)
  const addToHealthIntakeMetformin = (addToHealthIntakeDraft?.healthIntake?.items || []).find((item) => /^metformin$/i.test(item.name))
  const addToHealthIntakeVitaminD = (addToHealthIntakeDraft?.healthIntake?.items || []).find((item) => /^vitamin d$/i.test(item.name))
  assert(addToHealthIntakeDraft?.action === 'health_intake_items', 'Add-to-Health-Intake wording must create a medication/supplement review draft.')
  assert(addToHealthIntakeDraft?.canConfirm === true, 'Add-to-Health-Intake wording must be reviewable before saving.')
  assert(addToHealthIntakeDraft?.autoSave === false, 'Add-to-Health-Intake wording must not auto-save.')
  assert(addToHealthIntakeMetformin?.type === 'medication', 'Add-to-Health-Intake wording must classify metformin as medication.')
  assert(addToHealthIntakeMetformin?.dosage === '500 mg', 'Add-to-Health-Intake wording must keep metformin dose.')
  assert(addToHealthIntakeVitaminD?.type === 'supplement', 'Add-to-Health-Intake wording must classify vitamin D as supplement.')

	  const timedMedicationDraft = tryParseHealthIntakeItemsRequest('I take one tablet of atorvastatin at night and vitamin D in the morning', localDate, healthIntakeContext)
  const atorvastatin = (timedMedicationDraft?.healthIntake?.items || []).find((item) => /atorvastatin/i.test(item.name))
  const timedVitaminD = (timedMedicationDraft?.healthIntake?.items || []).find((item) => /vitamin d/i.test(item.name))
  assert(atorvastatin?.type === 'medication', 'Health Intake voice fallback must classify atorvastatin as a medication.')
  assert(atorvastatin?.dosage === 'one tablet', 'Health Intake voice fallback must keep stated tablet dose.')
  assert((atorvastatin?.timing || []).includes('Before Bed'), 'Health Intake voice fallback must keep stated night timing.')
  assert(timedVitaminD?.type === 'supplement', 'Health Intake voice fallback must classify vitamin D as a supplement.')
  assert((timedVitaminD?.timing || []).includes('Morning'), 'Health Intake voice fallback must keep stated morning timing.')

  const commonMedicationWordingDraft = tryParseHealthIntakeItemsRequest("I'm on metformin 500 mg twice daily, atorvastatin 20 mg at night, and vitamin D 1000 IU with breakfast.", localDate, healthIntakeContext)
  const commonMetformin = (commonMedicationWordingDraft?.healthIntake?.items || []).find((item) => /^metformin$/i.test(item.name))
  const commonAtorvastatin = (commonMedicationWordingDraft?.healthIntake?.items || []).find((item) => /^atorvastatin$/i.test(item.name))
  const commonVitaminD = (commonMedicationWordingDraft?.healthIntake?.items || []).find((item) => /^vitamin d$/i.test(item.name))
  assert(commonMedicationWordingDraft?.action === 'health_intake_items', 'Health Intake voice fallback must understand common "I am on..." medication wording.')
  assert(commonMetformin?.type === 'medication', 'Health Intake voice fallback must classify common metformin wording as medication.')
  assert(commonMetformin?.dosage === '500 mg', 'Health Intake voice fallback must keep metformin dose from common medication wording.')
  assert((commonMetformin?.timing || []).includes('Twice Daily'), 'Health Intake voice fallback must keep twice-daily medication timing.')
  assert(commonAtorvastatin?.dosage === '20 mg', 'Health Intake voice fallback must keep atorvastatin dose from common medication wording.')
  assert((commonAtorvastatin?.timing || []).includes('Before Bed'), 'Health Intake voice fallback must keep atorvastatin night timing.')
  assert(commonVitaminD?.type === 'supplement', 'Health Intake voice fallback must keep vitamin D as a supplement in common wording.')
  assert(commonVitaminD?.dosage === '1000 IU', 'Health Intake voice fallback must keep vitamin D dose from common supplement wording.')
  assert((commonVitaminD?.timing || []).includes('Morning'), 'Health Intake voice fallback must keep with-breakfast supplement timing.')
  assert(commonMedicationWordingDraft?.autoSave === false, 'Health Intake common medication wording must stay review-first.')

  const currentMedicationListDraft = tryParseHealthIntakeItemsRequest('My current medications are amlodipine 5 mg daily and simvastatin 20 mg at night.', localDate, healthIntakeContext)
  const currentAmlodipine = (currentMedicationListDraft?.healthIntake?.items || []).find((item) => /^amlodipine$/i.test(item.name))
  const currentSimvastatin = (currentMedicationListDraft?.healthIntake?.items || []).find((item) => /^simvastatin$/i.test(item.name))
  assert(currentMedicationListDraft?.action === 'health_intake_items', 'Health Intake voice fallback must understand current medication list wording.')
  assert(currentAmlodipine?.type === 'medication', 'Current medication list wording must classify amlodipine as medication.')
  assert(currentAmlodipine?.dosage === '5 mg', 'Current medication list wording must keep amlodipine dose.')
  assert((currentAmlodipine?.timing || []).includes('Daily'), 'Current medication list wording must keep daily timing.')
  assert(currentSimvastatin?.type === 'medication', 'Current medication list wording must classify simvastatin as medication.')
  assert(currentSimvastatin?.dosage === '20 mg', 'Current medication list wording must keep simvastatin dose.')
  assert((currentSimvastatin?.timing || []).includes('Before Bed'), 'Current medication list wording must keep night timing.')
  assert(currentMedicationListDraft?.autoSave === false, 'Current medication list wording must stay review-first.')

  const prescribedMedicationDraft = tryParseHealthIntakeItemsRequest("I'm prescribed amlodipine 5 mg once daily.", localDate, healthIntakeContext)
  const prescribedAmlodipine = (prescribedMedicationDraft?.healthIntake?.items || []).find((item) => /^amlodipine$/i.test(item.name))
  assert(prescribedMedicationDraft?.action === 'health_intake_items', 'Health Intake voice fallback must understand prescribed medication wording.')
  assert(prescribedAmlodipine?.type === 'medication', 'Prescribed medication wording must classify the item as medication.')
  assert(prescribedAmlodipine?.dosage === '5 mg', 'Prescribed medication wording must keep the stated dose.')
  assert((prescribedAmlodipine?.timing || []).includes('Daily'), 'Prescribed medication wording must keep once-daily timing.')
  assert(prescribedMedicationDraft?.autoSave === false, 'Prescribed medication wording must stay review-first.')

  const noMedicationSupplementDraft = tryParseHealthIntakeItemsRequest("I don't take any medications, but I take vitamin D 1000 IU and magnesium glycinate.", localDate, healthIntakeContext)
  const noMedicationItems = noMedicationSupplementDraft?.healthIntake?.items || []
  const noMedicationVitaminD = noMedicationItems.find((item) => /^vitamin d$/i.test(item.name))
  const noMedicationMagnesium = noMedicationItems.find((item) => /^magnesium glycinate$/i.test(item.name))
  assert(noMedicationSupplementDraft?.action === 'health_intake_items', 'Health Intake voice fallback must understand no-medications-but-supplements wording.')
  assert(noMedicationItems.length === 2, 'No-medications wording must not create a fake medication item.')
  assert(noMedicationVitaminD?.type === 'supplement', 'No-medications wording must keep vitamin D as a supplement.')
  assert(noMedicationVitaminD?.dosage === '1000 IU', 'No-medications wording must keep vitamin D dose.')
	  assert(noMedicationMagnesium?.type === 'supplement', 'No-medications wording must keep magnesium glycinate as a supplement.')
	  assert(noMedicationSupplementDraft?.autoSave === false, 'No-medications wording must stay review-first.')

	  const onlySupplementAfterNoMedicationDraft = tryParseHealthIntakeItemsRequest('No medications, only vitamin D 1000 IU.', localDate, healthIntakeContext)
	  const onlySupplementItems = onlySupplementAfterNoMedicationDraft?.healthIntake?.items || []
	  const onlyVitaminD = onlySupplementItems.find((item) => /^vitamin d$/i.test(item.name))
	  assert(onlySupplementAfterNoMedicationDraft?.action === 'health_intake_items', 'No-medications-only-supplement wording must create a review draft.')
	  assert(onlySupplementItems.length === 1, 'No-medications-only-supplement wording must not create a fake medication item.')
	  assert(onlyVitaminD?.type === 'supplement', 'No-medications-only-supplement wording must keep vitamin D as a supplement.')
	  assert(onlyVitaminD?.dosage === '1000 IU', 'No-medications-only-supplement wording must keep vitamin D dose.')
	  assert(onlySupplementAfterNoMedicationDraft?.autoSave === false, 'No-medications-only-supplement wording must stay review-first.')

	  const justSupplementAfterNoMedicationDraft = tryParseHealthIntakeItemsRequest('I take no medications just magnesium glycinate.', localDate, healthIntakeContext)
	  const justSupplementItems = justSupplementAfterNoMedicationDraft?.healthIntake?.items || []
	  assert(justSupplementAfterNoMedicationDraft?.action === 'health_intake_items', 'No-medications-just-supplement wording must create a review draft.')
	  assert(justSupplementItems.length === 1, 'No-medications-just-supplement wording must not create a fake medication item.')
	  assert(justSupplementItems.some((item) => item.type === 'supplement' && /^magnesium glycinate$/i.test(item.name)), 'No-medications-just-supplement wording must keep magnesium glycinate as a supplement.')
	  assert(justSupplementAfterNoMedicationDraft?.autoSave === false, 'No-medications-just-supplement wording must stay review-first.')

	  const emptyIntakeDraft = tryParseHealthIntakeItemsRequest("I don't take any medications or supplements.", localDate, healthIntakeContext)
	  assert(emptyIntakeDraft?.action === 'health_intake_items', 'Health Intake voice fallback must understand no-medications-or-supplements wording.')
	  assert(emptyIntakeDraft?.canConfirm === false, 'No-medications-or-supplements wording must not create a saveable draft.')
  assert(emptyIntakeDraft?.autoSave === false, 'No-medications-or-supplements wording must not auto-save.')
  assert((emptyIntakeDraft?.healthIntake?.items || []).length === 0, 'No-medications-or-supplements wording must not create fake Health Intake items.')
  assert(/will not add any medications/i.test(emptyIntakeDraft?.confirmationMessage || ''), 'No-medications-or-supplements wording must clearly say nothing will be added.')

  const emptyIntakeTakeNoDraft = tryParseHealthIntakeItemsRequest('I take no medications or supplements.', localDate, healthIntakeContext)
  assert(emptyIntakeTakeNoDraft?.canConfirm === false, 'Take-no-medications wording must not create a saveable draft.')
  assert((emptyIntakeTakeNoDraft?.healthIntake?.items || []).length === 0, 'Take-no-medications wording must not create fake Health Intake items.')

  const currentVitaminListDraft = tryParseHealthIntakeItemsRequest('My current vitamins are vitamin D and B12.', localDate, healthIntakeContext)
  const currentVitaminItems = currentVitaminListDraft?.healthIntake?.items || []
  assert(currentVitaminListDraft?.action === 'health_intake_items', 'Health Intake voice fallback must understand current vitamin list wording.')
  assert(currentVitaminItems.some((item) => item.type === 'supplement' && /^vitamin d$/i.test(item.name)), 'Current vitamin list wording must keep vitamin D name clean.')
  assert(currentVitaminItems.some((item) => item.type === 'supplement' && /^vitamin b12$/i.test(item.name)), 'Current vitamin list wording must expand B12 to vitamin B12.')
  assert(!currentVitaminItems.some((item) => /\bvitamins\s+vitamin\b/i.test(item.name)), 'Current vitamin list wording must not duplicate the vitamins header in item names.')
  assert(currentVitaminListDraft?.autoSave === false, 'Current vitamin list wording must stay review-first.')

  const negativeSupplementDraft = tryParseHealthIntakeItemsRequest('I take vitamin D but not magnesium.', localDate, healthIntakeContext)
  const negativeSupplementItems = negativeSupplementDraft?.healthIntake?.items || []
  assert(negativeSupplementDraft?.action === 'health_intake_items', 'Health Intake voice fallback must keep positive items when the user excludes another item.')
  assert(negativeSupplementItems.some((item) => item.type === 'supplement' && /^vitamin d$/i.test(item.name)), 'Health Intake negative wording must keep the item the user actually takes.')
  assert(!negativeSupplementItems.some((item) => /magnesium/i.test(item.name)), 'Health Intake negative wording must not add an item the user says they do not take.')
  assert(negativeSupplementDraft?.autoSave === false, 'Health Intake negative wording must stay review-first.')

  const structuredIntake = await normalizeDraft(
    {
      action: 'health_intake_items',
      healthIntake: {
        items: [
          { type: 'supplement', name: 'Vitamin D', dosage: '1000 IU', timing: ['Morning'] },
          { type: 'medication', name: 'Metformin', dosage: '', timing: [] },
        ],
      },
    },
    'Add vitamin D and metformin to Health Intake',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(structuredIntake?.draft?.action === 'health_intake_items', 'Structured AI Health Intake items must normalize to a review draft.')
  assert(structuredIntake?.draft?.canConfirm === true, 'Structured AI Health Intake items must be reviewable before saving.')
  assert(structuredIntake?.draft?.autoSave === false, 'Structured AI Health Intake items must not auto-save.')

  const correctedIntake = intakeDraft ? await buildReviewedDraftCorrection(intakeDraft, 'set metformin dose to 500 mg', localDate) : null
  const correctedMetformin = (correctedIntake?.healthIntake?.items || []).find((item) => /metformin/i.test(item.name))
  assert(correctedIntake?.action === 'health_intake_items', 'Reviewed Health Intake drafts must support correction without saving.')
  assert(correctedMetformin?.dosage === '500 mg', 'Reviewed Health Intake correction must update the stated dose.')
  assert(correctedIntake?.canConfirm === true, 'Reviewed Health Intake correction must return a new reviewable draft.')
  assert(correctedIntake?.autoSave === false, 'Reviewed Health Intake correction must not auto-save.')

  const renamedIntake = intakeDraft ? await buildReviewedDraftCorrection(intakeDraft, 'change magnesium glycinate to magnesium citrate', localDate) : null
  assert((renamedIntake?.healthIntake?.items || []).some((item) => item.type === 'supplement' && /^magnesium citrate$/i.test(item.name)), 'Reviewed Health Intake correction must support item name changes before saving.')
  assert(renamedIntake?.autoSave === false, 'Reviewed Health Intake name correction must not auto-save.')

  const retimedIntake = intakeDraft ? await buildReviewedDraftCorrection(intakeDraft, 'change vitamin D timing to night', localDate) : null
  const retimedVitaminD = (retimedIntake?.healthIntake?.items || []).find((item) => /vitamin d/i.test(item.name))
  assert((retimedVitaminD?.timing || []).includes('Before Bed'), 'Reviewed Health Intake correction must support timing changes before saving.')
  assert(retimedIntake?.autoSave === false, 'Reviewed Health Intake timing correction must not auto-save.')

  const typeCorrectedIntake = intakeDraft ? await buildReviewedDraftCorrection(intakeDraft, 'make fish oil a medication', localDate) : null
  const typeCorrectedFishOil = (typeCorrectedIntake?.healthIntake?.items || []).find((item) => /fish oil/i.test(item.name))
  assert(typeCorrectedFishOil?.type === 'medication', 'Reviewed Health Intake correction must support medication/supplement type changes before saving.')
  assert(typeCorrectedIntake?.autoSave === false, 'Reviewed Health Intake type correction must not auto-save.')

  const clearedIntake = correctedIntake ? await buildReviewedDraftCorrection(correctedIntake, 'remove the metformin dose and timing', localDate) : null
  const clearedMetformin = (clearedIntake?.healthIntake?.items || []).find((item) => /metformin/i.test(item.name))
  assert(clearedMetformin?.dosage === '', 'Reviewed Health Intake correction must support clearing a dose before saving.')
  assert((clearedMetformin?.timing || []).length === 0, 'Reviewed Health Intake correction must support clearing timing before saving.')
  assert(clearedIntake?.autoSave === false, 'Reviewed Health Intake clear-detail correction must not auto-save.')

  const supplementAdvice = await normalizeDraft(
    { action: 'health_intake_items', healthIntake: { items: [{ type: 'supplement', name: 'magnesium' }] } },
    'Should I take magnesium before bed?',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(supplementAdvice?.draft?.action === 'health_question', 'Medication/supplement advice must not become a Health Intake save draft.')

  const privateHealthQuestion = await sealReviewDraft('test-user', {
    action: 'health_question',
    transcript: 'Should I take magnesium before bed?',
    localDate,
    summary: 'Talk to Helfi',
    confirmationMessage: 'This is a health question. I can open Talk to Helfi with your question ready.',
    canConfirm: false,
    appTarget: {
      title: 'Talk to Helfi',
      path: '/chat?voicePrompt=Should%20I%20take%20magnesium%20before%20bed%3F',
      buttonLabel: 'Open Talk to Helfi',
    },
  })
  assert(privateHealthQuestion?.appTarget?.path === '/chat?voicePromptToken=test-private-token', 'Health questions must use a private handoff token instead of the spoken text in the URL.')

  const eatingTranscript = "I'm walking and eating two nashi apples and some peanuts"
  const parsedDashboardFood = tryParseDirectFoodRequest(eatingTranscript, dashboardContext)
  assert(parsedDashboardFood, 'Natural eating speech with clear food names must parse outside Food Diary.')
  assert(/nashi/i.test(parsedDashboardFood?.draftText || ''), 'Natural eating speech must keep nashi apples in the draft text.')
  assert(/peanuts/i.test(parsedDashboardFood?.draftText || ''), 'Natural eating speech must keep peanuts in the draft text.')

  const foodDraft = parsedDashboardFood ? await buildVoiceMealDraft(parsedDashboardFood, eatingTranscript, localDate) : null
  assert(foodDraft?.action === 'food_draft', 'Vague food amounts must create a follow-up food draft.')
  assert(foodDraft?.canConfirm === false, 'Vague food amounts must not be confirmable before the amount is answered.')
  assert(/How much peanuts should I use/i.test(foodDraft?.confirmationMessage || ''), 'Vague peanuts must trigger a clear follow-up question.')
  assert(/some peanuts/i.test(foodDraft?.food?.draftText || ''), 'The pending food draft must keep the original vague peanuts text.')

  const macedonianDirectFood = tryParseDirectFoodRequest('За појадок јадев едно јаболко и 30 грама кикирики. Додај го во дневникот за храна.', foodContext)
  assert(macedonianDirectFood, 'Macedonian food speech must parse through the local food fallback.')
  assert(macedonianDirectFood?.meal === 'breakfast', 'Macedonian food speech must keep breakfast as the target meal.')
  assert(/one apple/i.test(macedonianDirectFood?.draftText || ''), 'Macedonian food speech must keep the apple item.')
  assert(/30 g peanuts/i.test(macedonianDirectFood?.draftText || ''), 'Macedonian food speech must keep the peanut amount.')

  const macedonianNaturalSnack = tryParseDirectFoodRequest('За ужина јадев една јаболка и 30 грама кикирики', foodContext)
  assert(macedonianNaturalSnack, 'Natural Macedonian snack speech must parse without saying add it to the food diary.')
  assert(macedonianNaturalSnack?.meal === 'snacks', 'Natural Macedonian snack speech must keep snacks as the target meal.')
  assert(/one apple/i.test(macedonianNaturalSnack?.draftText || ''), 'Natural Macedonian snack speech must understand "една јаболка".')
  assert(/30 g peanuts/i.test(macedonianNaturalSnack?.draftText || ''), 'Natural Macedonian snack speech must keep the peanut amount.')

  const macedonianVagueFood = tryParseDirectFoodRequest('За појадок јадев едно јаболко и малку кикирики. Додај го во дневникот за храна.', foodContext)
  const macedonianVagueDraft = macedonianVagueFood ? await buildVoiceMealDraft(macedonianVagueFood, 'За појадок јадев едно јаболко и малку кикирики. Додај го во дневникот за храна.', localDate) : null
  assert(macedonianVagueDraft?.action === 'food_draft', 'Vague Macedonian food amounts must create a follow-up food draft.')
  assert(/How much peanuts should I use/i.test(macedonianVagueDraft?.confirmationMessage || ''), 'Vague Macedonian peanuts must trigger a clear follow-up question.')

  const spanishDirectFood = tryParseDirectFoodRequest('Para el desayuno comí una manzana y 30 gramos de cacahuetes. Añádelo al diario de comida.', foodContext)
  assert(spanishDirectFood, 'Spanish food speech must parse through the local food fallback.')
  assert(spanishDirectFood?.meal === 'breakfast', 'Spanish food speech must keep breakfast as the target meal.')
  assert(/one apple/i.test(spanishDirectFood?.draftText || ''), 'Spanish food speech must keep the apple item.')
  assert(/30 g peanuts/i.test(spanishDirectFood?.draftText || ''), 'Spanish food speech must keep the peanut amount.')

  const frenchDirectFood = tryParseDirectFoodRequest("Au petit-déjeuner j'ai mangé une pomme et 30 grammes de cacahuètes. Ajoute-le au journal alimentaire.", foodContext)
  assert(frenchDirectFood, 'French food speech must parse through the local food fallback.')
  assert(frenchDirectFood?.meal === 'breakfast', 'French food speech must keep breakfast as the target meal.')
  assert(/one apple/i.test(frenchDirectFood?.draftText || ''), 'French food speech must keep the apple item.')
  assert(/30 g peanuts/i.test(frenchDirectFood?.draftText || ''), 'French food speech must keep the peanut amount.')

  const germanDirectFood = tryParseDirectFoodRequest('Zum Frühstück habe ich einen Apfel und 30 Gramm Erdnüsse gegessen. Füge es dem Essenstagebuch hinzu.', foodContext)
  assert(germanDirectFood, 'German food speech must parse through the local food fallback.')
  assert(germanDirectFood?.meal === 'breakfast', 'German food speech must keep breakfast as the target meal.')
  assert(/one apple/i.test(germanDirectFood?.draftText || ''), 'German food speech must keep the apple item.')
  assert(/30 g peanuts/i.test(germanDirectFood?.draftText || ''), 'German food speech must keep the peanut amount.')

  const italianDirectFood = tryParseDirectFoodRequest('A colazione ho mangiato una mela e 30 grammi di arachidi. Aggiungilo al diario alimentare.', foodContext)
  assert(italianDirectFood, 'Italian food speech must parse through the local food fallback.')
  assert(italianDirectFood?.meal === 'breakfast', 'Italian food speech must keep breakfast as the target meal.')
  assert(/one apple/i.test(italianDirectFood?.draftText || ''), 'Italian food speech must keep the apple item.')
  assert(/30 g peanuts/i.test(italianDirectFood?.draftText || ''), 'Italian food speech must keep the peanut amount.')

  const portugueseDirectFood = tryParseDirectFoodRequest('No café da manhã comi uma maçã e 30 gramas de amendoins. Adiciona ao diário alimentar.', foodContext)
  assert(portugueseDirectFood, 'Portuguese food speech must parse through the local food fallback.')
  assert(portugueseDirectFood?.meal === 'breakfast', 'Portuguese food speech must keep breakfast as the target meal.')
  assert(/one apple/i.test(portugueseDirectFood?.draftText || ''), 'Portuguese food speech must keep the apple item.')
  assert(/30 g peanuts/i.test(portugueseDirectFood?.draftText || ''), 'Portuguese food speech must keep the peanut amount.')

  const clarifiedFood = followUpTranscript(foodDraft, '30 g peanuts')
  assert(/two nashi apples/i.test(clarifiedFood || ''), 'Food follow-up must keep the already-clear nashi apples.')
  assert(/30 g peanuts/i.test(clarifiedFood || ''), 'Food follow-up must combine the peanut amount with the pending draft.')

  const macedonianClarifiedFood = followUpTranscript(macedonianVagueDraft, '30 грама')
  assert(/one apple/i.test(macedonianClarifiedFood || ''), 'Macedonian food follow-up must keep the already-clear apple.')
  assert(/30 g peanuts/i.test(macedonianClarifiedFood || ''), 'Macedonian food follow-up must combine the spoken gram amount with the pending draft.')

  const reviewedSnackDraft = macedonianNaturalSnack ? await buildVoiceMealDraft(macedonianNaturalSnack, 'За ужина јадев една јаболка и 30 грама кикирики', localDate) : null
  const correctedSnackDraft = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'make the peanuts 20 grams instead', localDate) : null
  assert(correctedSnackDraft?.action === 'food_build_meal', 'Reviewed food drafts must support natural amount corrections without saving.')
  assert(/20 g peanuts/i.test(correctedSnackDraft?.food?.draftText || ''), 'Reviewed food correction must update the target ingredient amount.')
  assert(/one apple/i.test(correctedSnackDraft?.food?.draftText || ''), 'Reviewed food correction must preserve unchanged ingredients.')
  assert(correctedSnackDraft?.canConfirm === true, 'Reviewed food correction must return a new reviewable draft.')
  assert(correctedSnackDraft?.autoSave === false, 'Reviewed food correction must not auto-save the changed draft.')

  const correctedSnackMacedonian = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'смени кикирики на 20 грама', localDate) : null
  assert(/20 g peanuts/i.test(correctedSnackMacedonian?.food?.draftText || ''), 'Reviewed food correction must understand Macedonian amount changes.')

  const countedAppleDraft = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'make the apple two apples', localDate) : null
  assert(countedAppleDraft?.action === 'food_build_meal', 'Reviewed food drafts must support count corrections without saving.')
  assert(/two apples/i.test(countedAppleDraft?.food?.draftText || ''), 'Reviewed food count correction must update the target food count.')
  assert(/30 g peanuts/i.test(countedAppleDraft?.food?.draftText || ''), 'Reviewed food count correction must keep unchanged ingredients.')
  assert(countedAppleDraft?.canConfirm === true, 'Reviewed food count correction must return a new reviewable draft.')
  assert(countedAppleDraft?.autoSave === false, 'Reviewed food count correction must not auto-save the changed draft.')

  const countedAppleMacedonian = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'смени јаболко на две јаболка', localDate) : null
  assert(/two apples/i.test(countedAppleMacedonian?.food?.draftText || ''), 'Reviewed food count correction must understand Macedonian count changes.')
  assert(/30 g peanuts/i.test(countedAppleMacedonian?.food?.draftText || ''), 'Macedonian count correction must keep unchanged ingredients.')

  const movedSnackToLunch = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'make it lunch instead', localDate) : null
  assert(movedSnackToLunch?.action === 'food_build_meal', 'Reviewed food drafts must support meal corrections without saving.')
  assert(movedSnackToLunch?.food?.meal === 'lunch', 'Reviewed food meal correction must move the draft to lunch.')
  assert(/one apple/i.test(movedSnackToLunch?.food?.draftText || ''), 'Reviewed food meal correction must keep the apple item.')
  assert(/30 g peanuts/i.test(movedSnackToLunch?.food?.draftText || ''), 'Reviewed food meal correction must keep the peanut amount.')
  assert(movedSnackToLunch?.canConfirm === true, 'Reviewed food meal correction must return a new reviewable draft.')
  assert(movedSnackToLunch?.autoSave === false, 'Reviewed food meal correction must not auto-save the moved draft.')

  const movedSnackToLunchMacedonian = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'смени на ручек', localDate) : null
  assert(movedSnackToLunchMacedonian?.food?.meal === 'lunch', 'Reviewed food meal correction must understand Macedonian meal changes.')
  assert(/30 g peanuts/i.test(movedSnackToLunchMacedonian?.food?.draftText || ''), 'Macedonian meal correction must keep the reviewed food items.')

  const addedBananaDraft = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'add one banana', localDate) : null
  assert(addedBananaDraft?.action === 'food_build_meal', 'Reviewed food drafts must support adding a food item without saving.')
  assert(/one apple/i.test(addedBananaDraft?.food?.draftText || ''), 'Reviewed food add-item correction must keep the apple item.')
  assert(/30 g peanuts/i.test(addedBananaDraft?.food?.draftText || ''), 'Reviewed food add-item correction must keep the peanut amount.')
  assert(/one banana/i.test(addedBananaDraft?.food?.draftText || ''), 'Reviewed food add-item correction must add the new banana item.')
  assert(addedBananaDraft?.canConfirm === true, 'Reviewed food add-item correction must return a new reviewable draft.')
  assert(addedBananaDraft?.autoSave === false, 'Reviewed food add-item correction must not auto-save the changed draft.')

  const addedBananaMacedonian = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'додај една банана', localDate) : null
  assert(/one banana/i.test(addedBananaMacedonian?.food?.draftText || ''), 'Reviewed food add-item correction must understand Macedonian add-item wording.')
  assert(/30 g peanuts/i.test(addedBananaMacedonian?.food?.draftText || ''), 'Macedonian add-item correction must keep the reviewed food items.')

  const removedPeanutsDraft = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'remove the peanuts', localDate) : null
  assert(removedPeanutsDraft?.action === 'food_build_meal', 'Reviewed food drafts must support removing a food item without saving.')
  assert(/one apple/i.test(removedPeanutsDraft?.food?.draftText || ''), 'Reviewed food remove-item correction must keep the remaining food item.')
  assert(!/peanuts/i.test(removedPeanutsDraft?.food?.draftText || ''), 'Reviewed food remove-item correction must remove the target food item.')
  assert(removedPeanutsDraft?.canConfirm === true, 'Reviewed food remove-item correction must return a new reviewable draft.')
  assert(removedPeanutsDraft?.autoSave === false, 'Reviewed food remove-item correction must not auto-save the changed draft.')

  const removedPeanutsMacedonian = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'тргни кикирики', localDate) : null
  assert(/one apple/i.test(removedPeanutsMacedonian?.food?.draftText || ''), 'Reviewed food remove-item correction must understand Macedonian remove wording.')
  assert(!/peanuts/i.test(removedPeanutsMacedonian?.food?.draftText || ''), 'Macedonian remove-item correction must remove the target food item.')

  const replacedPeanutsDraft = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'replace the peanuts with one banana', localDate) : null
  assert(replacedPeanutsDraft?.action === 'food_build_meal', 'Reviewed food drafts must support replacing a food item without saving.')
  assert(/one apple/i.test(replacedPeanutsDraft?.food?.draftText || ''), 'Reviewed food replace-item correction must keep unchanged food items.')
  assert(/one banana/i.test(replacedPeanutsDraft?.food?.draftText || ''), 'Reviewed food replace-item correction must add the replacement food item.')
  assert(!/peanuts/i.test(replacedPeanutsDraft?.food?.draftText || ''), 'Reviewed food replace-item correction must remove the replaced food item.')
  assert(replacedPeanutsDraft?.canConfirm === true, 'Reviewed food replace-item correction must return a new reviewable draft.')
  assert(replacedPeanutsDraft?.autoSave === false, 'Reviewed food replace-item correction must not auto-save the changed draft.')

  const replacedPeanutsMacedonian = reviewedSnackDraft ? await buildReviewedDraftCorrection(reviewedSnackDraft, 'замени кикирики со една банана', localDate) : null
  assert(/one banana/i.test(replacedPeanutsMacedonian?.food?.draftText || ''), 'Reviewed food replace-item correction must understand Macedonian replacement wording.')
  assert(!/peanuts/i.test(replacedPeanutsMacedonian?.food?.draftText || ''), 'Macedonian replace-item correction must remove the replaced food item.')

  const spanishClarifiedFood = followUpTranscript(macedonianVagueDraft, '30 gramos')
  assert(/30 g peanuts/i.test(spanishClarifiedFood || ''), 'Spanish food follow-up must understand gram amounts.')

  const frenchClarifiedFood = followUpTranscript(macedonianVagueDraft, '30 grammes')
  assert(/30 g peanuts/i.test(frenchClarifiedFood || ''), 'French food follow-up must understand gram amounts.')

  const germanClarifiedFood = followUpTranscript(macedonianVagueDraft, '30 Gramm')
  assert(/30 g peanuts/i.test(germanClarifiedFood || ''), 'German food follow-up must understand gram amounts.')

  const italianClarifiedFood = followUpTranscript(macedonianVagueDraft, '30 grammi')
  assert(/30 g peanuts/i.test(italianClarifiedFood || ''), 'Italian food follow-up must understand gram amounts.')

  const portugueseClarifiedFood = followUpTranscript(macedonianVagueDraft, '30 gramas')
  assert(/30 g peanuts/i.test(portugueseClarifiedFood || ''), 'Portuguese food follow-up must understand gram amounts.')

  const parsedFoodContext = tryParseDirectFoodRequest(eatingTranscript, foodContext)
  assert(parsedFoodContext, 'Natural eating speech must still parse from Food Diary.')

  const coffeeDraft = tryParseWaterRequest('500 ml coffee', localDate, waterContext)
  assert(coffeeDraft?.action === 'water', 'Water context must understand short drink commands.')
  assert(coffeeDraft?.canConfirm === false, 'Sweetened drinks without detail must ask a follow-up before saving.')
  assert(/sugar-free, or with sugar or honey/i.test(coffeeDraft?.confirmationMessage || ''), 'Coffee follow-up must ask about sugar-free, sugar, or honey.')

  const honeyFollowUp = followUpTranscript(coffeeDraft, 'honey')
  assert(/log 500 ml coffee with honey/i.test(honeyFollowUp || ''), 'Water follow-up must turn "honey" into "with honey".')

  const macedonianHoneyFollowUp = followUpTranscript(coffeeDraft, 'мед')
  assert(/log 500 ml coffee with honey/i.test(macedonianHoneyFollowUp || ''), 'Water follow-up must understand Macedonian honey.')

  const spanishHoneyFollowUp = followUpTranscript(coffeeDraft, 'miel')
  assert(/log 500 ml coffee with honey/i.test(spanishHoneyFollowUp || ''), 'Water follow-up must understand Spanish honey.')

  const frenchNoSugarFollowUp = followUpTranscript(coffeeDraft, 'sans sucre')
  assert(/log 500 ml coffee no sugar/i.test(frenchNoSugarFollowUp || ''), 'Water follow-up must understand French no-sugar wording.')

  const germanHoneyFollowUp = followUpTranscript(coffeeDraft, 'Honig')
  assert(/log 500 ml coffee with honey/i.test(germanHoneyFollowUp || ''), 'Water follow-up must understand German honey.')

  const germanNoSugarFollowUp = followUpTranscript(coffeeDraft, 'ohne Zucker')
  assert(/log 500 ml coffee no sugar/i.test(germanNoSugarFollowUp || ''), 'Water follow-up must understand German no-sugar wording.')

  const italianHoneyFollowUp = followUpTranscript(coffeeDraft, 'miele')
  assert(/log 500 ml coffee with honey/i.test(italianHoneyFollowUp || ''), 'Water follow-up must understand Italian honey.')

  const italianNoSugarFollowUp = followUpTranscript(coffeeDraft, 'senza zucchero')
  assert(/log 500 ml coffee no sugar/i.test(italianNoSugarFollowUp || ''), 'Water follow-up must understand Italian no-sugar wording.')

  const portugueseHoneyFollowUp = followUpTranscript(coffeeDraft, 'mel')
  assert(/log 500 ml coffee with honey/i.test(portugueseHoneyFollowUp || ''), 'Water follow-up must understand Portuguese honey.')

  const portugueseNoSugarFollowUp = followUpTranscript(coffeeDraft, 'sem açúcar')
  assert(/log 500 ml coffee no sugar/i.test(portugueseNoSugarFollowUp || ''), 'Water follow-up must understand Portuguese no-sugar wording.')

  const honeyAmountDraft = tryParseWaterRequest('500 ml coffee with one teaspoon honey', localDate, waterContext)
  assert(honeyAmountDraft?.canConfirm === true, 'One teaspoon honey should create a reviewable drink draft.')
  assert(honeyAmountDraft?.water?.sweetener?.amount === 1, 'One teaspoon honey must store amount 1.')
  assert(honeyAmountDraft?.water?.sweetener?.unit === 'tsp', 'One teaspoon honey must store tsp unit.')
  assert(honeyAmountDraft?.water?.sweetener?.type === 'honey', 'One teaspoon honey must store honey type.')

  const macedonianWater = tryParseWaterRequest('Додај 500 мл вода', localDate, dashboardContext)
  assert(macedonianWater?.action === 'water', 'Macedonian water logging must create a water draft.')
  assert(macedonianWater?.canConfirm === true, 'Macedonian water logging must be reviewable before saving.')
  assert(macedonianWater?.water?.amountMl === 500, 'Macedonian water logging must keep the ml amount.')
  assert(macedonianWater?.water?.drinkType === 'Water', 'Macedonian water logging must understand water.')

  const correctedWater = macedonianWater ? await buildReviewedDraftCorrection(macedonianWater, 'make it 750 ml instead', localDate) : null
  assert(correctedWater?.action === 'water', 'Reviewed water drafts must support natural amount corrections without saving.')
  assert(correctedWater?.water?.amountMl === 750, 'Reviewed water correction must update the amount.')
  assert(correctedWater?.water?.drinkType === 'Water', 'Reviewed water correction must preserve the drink type.')
  assert(correctedWater?.canConfirm === true, 'Reviewed water correction must return a new reviewable draft.')
  assert(correctedWater?.autoSave === false, 'Reviewed water correction must not auto-save the changed draft.')

  const correctedWaterMacedonian = macedonianWater ? await buildReviewedDraftCorrection(macedonianWater, 'смени на 750 мл', localDate) : null
  assert(correctedWaterMacedonian?.water?.amountMl === 750, 'Reviewed water correction must understand Macedonian ml changes.')

  const frenchWaterLocal = tryParseWaterRequest("Ajoute 500 ml d'eau", localDate, dashboardContext)
  assert(frenchWaterLocal?.action === 'water', 'French water wording must create a water draft without AI.')
  assert(frenchWaterLocal?.water?.amountMl === 500, 'French water wording must keep the ml amount.')

  const spanishWaterLocal = tryParseWaterRequest('Agrega 250 ml de agua', localDate, dashboardContext)
  assert(spanishWaterLocal?.action === 'water', 'Spanish water wording must create a water draft without AI.')
  assert(spanishWaterLocal?.water?.amountMl === 250, 'Spanish water wording must keep the ml amount.')

  const germanWaterLocal = tryParseWaterRequest('Füge 400 ml Wasser hinzu', localDate, dashboardContext)
  assert(germanWaterLocal?.action === 'water', 'German water wording must create a water draft without AI.')
  assert(germanWaterLocal?.water?.amountMl === 400, 'German water wording must keep the ml amount.')

  const italianWaterLocal = tryParseWaterRequest('Aggiungi 300 ml di acqua', localDate, dashboardContext)
  assert(italianWaterLocal?.action === 'water', 'Italian water wording must create a water draft without AI.')
  assert(italianWaterLocal?.water?.amountMl === 300, 'Italian water wording must keep the ml amount.')

  const portugueseWaterLocal = tryParseWaterRequest('Adiciona 350 ml de água', localDate, dashboardContext)
  assert(portugueseWaterLocal?.action === 'water', 'Portuguese water wording must create a water draft without AI.')
  assert(portugueseWaterLocal?.water?.amountMl === 350, 'Portuguese water wording must keep the ml amount.')

  const macedonianWaterNeedsAmount = tryParseWaterRequest('Додај вода', localDate, waterContext)
  assert(macedonianWaterNeedsAmount?.action === 'water', 'Macedonian water wording without amount must create a water follow-up draft.')
  assert(macedonianWaterNeedsAmount?.canConfirm === false, 'Macedonian water wording without amount must ask a follow-up before saving.')
  const macedonianWaterAmountFollowUp = followUpTranscript(macedonianWaterNeedsAmount, '500 мл')
  assert(/log 500 ml Water/i.test(macedonianWaterAmountFollowUp || ''), 'Macedonian water follow-up must understand ml amount.')

  const spanishWaterAmountFollowUp = followUpTranscript(macedonianWaterNeedsAmount, '500 mililitros')
  assert(/log 500 ml Water/i.test(spanishWaterAmountFollowUp || ''), 'Spanish water follow-up must understand millilitre amount.')

  const frenchWaterAmountFollowUp = followUpTranscript(macedonianWaterNeedsAmount, '500 millilitres')
  assert(/log 500 ml Water/i.test(frenchWaterAmountFollowUp || ''), 'French water follow-up must understand millilitre amount.')

  const germanWaterAmountFollowUp = followUpTranscript(macedonianWaterNeedsAmount, '500 Milliliter')
  assert(/log 500 ml Water/i.test(germanWaterAmountFollowUp || ''), 'German water follow-up must understand millilitre amount.')

  const italianWaterAmountFollowUp = followUpTranscript(macedonianWaterNeedsAmount, '500 millilitri')
  assert(/log 500 ml Water/i.test(italianWaterAmountFollowUp || ''), 'Italian water follow-up must understand millilitre amount.')

  const portugueseWaterAmountFollowUp = followUpTranscript(macedonianWaterNeedsAmount, '500 mililitros')
  assert(/log 500 ml Water/i.test(portugueseWaterAmountFollowUp || ''), 'Portuguese water follow-up must understand millilitre amount.')

  const dashboardJournal = tryParseJournalRequest('update my journal for today: slept better and had less pain', dashboardContext)
  assert(dashboardJournal?.action === 'journal', 'Update my journal wording must create a journal draft.')
  assert(/slept better and had less pain/i.test(dashboardJournal?.journal?.content || ''), 'Journal parser must keep the actual note text.')

  const quickHealthJournal = buildQuickToolDraft('Write in my health journal that I slept better today and had less pain', localDate, journalContext)
  assert(quickHealthJournal?.action === 'journal', 'Explicit health journal wording must stay a journal draft even when it mentions pain.')
  assert(quickHealthJournal?.journal?.journalType === 'health', 'Explicit health journal wording must keep health journal type.')
  assert(quickHealthJournal?.journal?.content === 'I slept better today and had less pain', 'Explicit health journal draft must keep only the actual note text.')
  assert(quickHealthJournal?.canConfirm === true, 'Explicit health journal draft must be reviewable before saving.')
  assert(/Voice health journal note/i.test(quickHealthJournal?.summary || ''), 'Explicit health journal draft must show a review summary.')
  assert(/slept better today and had less pain/i.test(quickHealthJournal?.confirmationMessage || ''), 'Explicit health journal draft must show the note in the review message.')
  const correctedHealthJournal = quickHealthJournal ? await buildReviewedDraftCorrection(quickHealthJournal, 'change it to slept badly and had more pain today instead', localDate) : null
  assert(correctedHealthJournal?.action === 'journal', 'Reviewed journal drafts must support natural note corrections without saving.')
  assert(/slept badly and had more pain today/i.test(correctedHealthJournal?.journal?.content || ''), 'Reviewed journal correction must update the note content.')
  assert(correctedHealthJournal?.journal?.journalType === 'health', 'Reviewed journal correction must preserve health journal type.')
  assert(correctedHealthJournal?.canConfirm === true, 'Reviewed journal correction must return a new reviewable draft.')
  assert(correctedHealthJournal?.autoSave === false, 'Reviewed journal correction must not auto-save the changed draft.')
  const correctedHealthJournalMacedonian = quickHealthJournal ? await buildReviewedDraftCorrection(quickHealthJournal, 'смени во денес се чувствувам многу подобро', localDate) : null
  assert(/денес се чувствувам многу подобро/i.test(correctedHealthJournalMacedonian?.journal?.content || ''), 'Reviewed journal correction must understand Macedonian note changes.')

  const inJournalNote = tryParseJournalRequest('slept better and had less pain', journalContext)
  assert(inJournalNote?.action === 'journal', 'Journal context must treat note-like text as a journal draft.')
  assert(inJournalNote?.journal?.journalType === 'health', 'Journal context must create a health journal draft.')

  const macedonianJournal = tryParseJournalRequest('Запиши во здравствениот дневник дека денес се чувствувам подобро', dashboardContext)
  assert(macedonianJournal?.action === 'journal', 'Macedonian journal wording must create a journal draft.')
  assert(macedonianJournal?.journal?.journalType === 'health', 'Macedonian health journal wording must create a health journal draft.')
  assert(/денес се чувствувам подобро/i.test(macedonianJournal?.journal?.content || ''), 'Macedonian journal parser must keep the actual note text.')

  const spanishJournalLocal = tryParseJournalRequest('Escribe en mi diario de salud que dormí mejor hoy', dashboardContext)
  assert(spanishJournalLocal?.action === 'journal', 'Spanish journal wording must create a journal draft without AI.')
  assert(spanishJournalLocal?.journal?.journalType === 'health', 'Spanish health journal wording must create a health journal draft.')
  assert(/dormí mejor hoy/i.test(spanishJournalLocal?.journal?.content || ''), 'Spanish journal parser must keep the actual note text.')

  const frenchJournalLocal = tryParseJournalRequest("Écris dans mon journal de santé que j'ai mieux dormi", dashboardContext)
  assert(frenchJournalLocal?.action === 'journal', 'French journal wording must create a journal draft without AI.')
  assert(frenchJournalLocal?.journal?.journalType === 'health', 'French health journal wording must create a health journal draft.')
  assert(/j'ai mieux dormi/i.test(frenchJournalLocal?.journal?.content || ''), 'French journal parser must keep the actual note text.')

  const germanJournalLocal = tryParseJournalRequest('Schreibe in mein Gesundheitstagebuch dass ich heute besser geschlafen habe', dashboardContext)
  assert(germanJournalLocal?.action === 'journal', 'German journal wording must create a journal draft without AI.')
  assert(germanJournalLocal?.journal?.journalType === 'health', 'German health journal wording must create a health journal draft.')
  assert(/ich heute besser geschlafen habe/i.test(germanJournalLocal?.journal?.content || ''), 'German journal parser must keep the actual note text.')

  const italianJournalLocal = tryParseJournalRequest('Scrivi nel mio diario di salute che ho dormito meglio oggi', dashboardContext)
  assert(italianJournalLocal?.action === 'journal', 'Italian journal wording must create a journal draft without AI.')
  assert(italianJournalLocal?.journal?.journalType === 'health', 'Italian health journal wording must create a health journal draft.')
  assert(/ho dormito meglio oggi/i.test(italianJournalLocal?.journal?.content || ''), 'Italian journal parser must keep the actual note text.')

  const portugueseJournalLocal = tryParseJournalRequest('Escreva no meu diário de saúde que dormi melhor hoje', dashboardContext)
  assert(portugueseJournalLocal?.action === 'journal', 'Portuguese journal wording must create a journal draft without AI.')
  assert(portugueseJournalLocal?.journal?.journalType === 'health', 'Portuguese health journal wording must create a health journal draft.')
  assert(/dormi melhor hoje/i.test(portugueseJournalLocal?.journal?.content || ''), 'Portuguese journal parser must keep the actual note text.')

  const journalClarification = buildQuickClarificationDraft('add a journal note', localDate)
  assert(journalClarification?.action === 'journal', 'Vague journal requests must create a follow-up draft.')
  const journalFollowUp = followUpTranscript(journalClarification, 'денес се чувствувам подобро')
  assert(/write journal note: денес се чувствувам подобро/i.test(journalFollowUp || ''), 'Journal follow-up must combine the answer with the pending journal request.')
  const parsedJournalFollowUp = tryParseJournalRequest(journalFollowUp || '', dashboardContext)
  assert(parsedJournalFollowUp?.action === 'journal', 'Journal follow-up answer must become a reviewable journal draft.')
  assert(/денес се чувствувам подобро/i.test(parsedJournalFollowUp?.journal?.content || ''), 'Journal follow-up must keep the Macedonian note text.')

  const exerciseClarification = buildQuickClarificationDraft('log exercise', localDate)
  assert(exerciseClarification?.action === 'exercise', 'Vague exercise requests must create a follow-up draft.')
  const exerciseFollowUp = followUpTranscript(exerciseClarification, 'пешачев 30 минути')
  assert(/log exercise: пешачев 30 минути/i.test(exerciseFollowUp || ''), 'Exercise follow-up must combine the answer with the pending exercise request.')
  const parsedExerciseFollowUp = tryParseExerciseRequest(exerciseFollowUp || '', dashboardContext)
  assert(parsedExerciseFollowUp?.action === 'exercise', 'Exercise follow-up answer must become a reviewable exercise draft.')
  assert(parsedExerciseFollowUp?.exercise?.name === 'walking', 'Exercise follow-up must understand Macedonian walking.')
  assert(parsedExerciseFollowUp?.exercise?.durationMinutes === 30, 'Exercise follow-up must keep the Macedonian duration.')

  const walkedDraft = tryParseExerciseRequest('I walked 5k after lunch', dashboardContext)
  assert(walkedDraft?.action === 'exercise', 'Walked 5k wording must create an exercise draft.')
  assert(walkedDraft?.exercise?.name === 'walking', 'Walked 5k must be understood as walking.')
  assert(walkedDraft?.exercise?.distanceKm === 5, 'Walked 5k must keep the 5 km distance.')
  assert(walkedDraft?.exercise?.estimatedDuration === true, 'Walked 5k without minutes must mark time as estimated.')

  const exerciseContextDraft = tryParseExerciseRequest('walking for 30 minutes', exerciseContext)
  assert(exerciseContextDraft?.action === 'exercise', 'Exercise context must handle natural exercise wording without log/add.')
  assert(exerciseContextDraft?.exercise?.durationMinutes === 30, 'Exercise context must keep spoken duration.')
  const reviewedExerciseDraft = exerciseContextDraft ? { ...exerciseContextDraft, canConfirm: true, autoSave: false } : null
  const correctedExercise = reviewedExerciseDraft ? await buildReviewedDraftCorrection(reviewedExerciseDraft, 'make it 45 minutes instead', localDate) : null
  assert(correctedExercise?.action === 'exercise', 'Reviewed exercise drafts must support natural duration corrections without saving.')
  assert(correctedExercise?.exercise?.durationMinutes === 45, 'Reviewed exercise correction must update the duration.')
  assert(correctedExercise?.exercise?.name === 'walking', 'Reviewed exercise correction must preserve the exercise type.')
  assert(correctedExercise?.canConfirm === true, 'Reviewed exercise correction must return a new reviewable draft.')
  assert(correctedExercise?.autoSave === false, 'Reviewed exercise correction must not auto-save the changed draft.')

  const macedonianWalk = tryParseExerciseRequest('Запиши дека пешачев 5 км после ручек', dashboardContext)
  assert(macedonianWalk?.action === 'exercise', 'Macedonian walking wording must create an exercise draft.')
  assert(macedonianWalk?.exercise?.name === 'walking', 'Macedonian walking wording must be understood as walking.')
  assert(macedonianWalk?.exercise?.distanceKm === 5, 'Macedonian walking wording must keep the distance.')

  const macedonianRun = tryParseExerciseRequest('Трчав 30 минути', exerciseContext)
  assert(macedonianRun?.action === 'exercise', 'Macedonian running wording must create an exercise draft in exercise context.')
  assert(macedonianRun?.exercise?.name === 'running', 'Macedonian running wording must be understood as running.')
  assert(macedonianRun?.exercise?.durationMinutes === 30, 'Macedonian running wording must keep the duration.')
  assert(macedonianRun?.exercise?.estimatedDuration === false, 'Macedonian explicit exercise duration must not be marked as estimated.')
  const reviewedMacedonianRun = macedonianRun ? { ...macedonianRun, canConfirm: true, autoSave: false } : null
  const correctedExerciseMacedonian = reviewedMacedonianRun ? await buildReviewedDraftCorrection(reviewedMacedonianRun, 'смени на 45 минути', localDate) : null
  assert(correctedExerciseMacedonian?.exercise?.durationMinutes === 45, 'Reviewed exercise correction must understand Macedonian minute changes.')
  assert(correctedExerciseMacedonian?.exercise?.name === 'running', 'Reviewed exercise correction must preserve Macedonian exercise type.')

  const spanishWalk = tryParseExerciseRequest('Registra que caminé 5 km después del almuerzo', dashboardContext)
  assert(spanishWalk?.action === 'exercise', 'Spanish walking wording must create an exercise draft.')
  assert(spanishWalk?.exercise?.name === 'walking', 'Spanish walking wording must be understood as walking.')
  assert(spanishWalk?.exercise?.distanceKm === 5, 'Spanish walking wording must keep the distance.')

  const frenchRun = tryParseExerciseRequest("J'ai couru 30 minutes", exerciseContext)
  assert(frenchRun?.action === 'exercise', 'French running wording must create an exercise draft in exercise context.')
  assert(frenchRun?.exercise?.name === 'running', 'French running wording must be understood as running.')
  assert(frenchRun?.exercise?.durationMinutes === 30, 'French running wording must keep the duration.')

  const germanWalk = tryParseExerciseRequest('Trage ein dass ich 5 km gegangen bin', dashboardContext)
  assert(germanWalk?.action === 'exercise', 'German walking wording must create an exercise draft.')
  assert(germanWalk?.exercise?.name === 'walking', 'German walking wording must be understood as walking.')
  assert(germanWalk?.exercise?.distanceKm === 5, 'German walking wording must keep the distance.')

  const italianWalk = tryParseExerciseRequest('Registra che ho camminato 5 km dopo pranzo', dashboardContext)
  assert(italianWalk?.action === 'exercise', 'Italian walking wording must create an exercise draft.')
  assert(italianWalk?.exercise?.name === 'walking', 'Italian walking wording must be understood as walking.')
  assert(italianWalk?.exercise?.distanceKm === 5, 'Italian walking wording must keep the distance.')

  const portugueseWalk = tryParseExerciseRequest('Registra que caminhei 5 km depois do almoço', dashboardContext)
  assert(portugueseWalk?.action === 'exercise', 'Portuguese walking wording must create an exercise draft.')
  assert(portugueseWalk?.exercise?.name === 'walking', 'Portuguese walking wording must be understood as walking.')
  assert(portugueseWalk?.exercise?.distanceKm === 5, 'Portuguese walking wording must keep the distance.')

  const dashboardMood = tryParseMoodRequest('log my mood as stressed after work', dashboardContext)
  assert(dashboardMood?.action === 'mood', 'Log my mood wording must create a mood draft.')
  assert(dashboardMood?.mood?.mood === 3, 'Stressed mood wording must map to a lower mood score.')
  assert(dashboardMood?.mood?.tags?.includes('stressed'), 'Stressed mood wording must keep a stressed tag.')

  const moodContextDraft = tryParseMoodRequest('better today after sleep', moodContext)
  assert(moodContextDraft?.action === 'mood', 'Mood context must handle natural mood text without saying mood.')
  assert(moodContextDraft?.mood?.mood === 5, 'Better mood context text must map to an improved mood score.')
  assert(moodContextDraft?.mood?.tags?.includes('positive'), 'Better mood context text must keep a positive tag.')

  const calmMood = tryParseMoodRequest('I feel calm this morning', dashboardContext)
  assert(calmMood?.action === 'mood', 'Calm feeling wording must create a mood draft.')
  assert(calmMood?.mood?.tags?.includes('calm'), 'Calm mood wording must keep a calm tag.')

  const macedonianMood = tryParseMoodRequest('Се чувствувам смирено и подобро денес', dashboardContext)
  assert(macedonianMood?.action === 'mood', 'Macedonian mood wording must create a mood draft.')
  assert(macedonianMood?.mood?.mood === 5, 'Macedonian calm/better mood wording must map to an improved mood score.')
  assert(macedonianMood?.mood?.tags?.includes('calm'), 'Macedonian calm mood wording must keep a calm tag.')
  assert(macedonianMood?.mood?.tags?.includes('positive'), 'Macedonian better mood wording must keep a positive tag.')

  const macedonianStressMood = tryParseMoodRequest('Запиши расположение дека сум под стрес после работа', dashboardContext)
  assert(macedonianStressMood?.action === 'mood', 'Macedonian stress mood wording must create a mood draft.')
  assert(macedonianStressMood?.mood?.mood === 3, 'Macedonian stress mood wording must map to a lower mood score.')
  assert(macedonianStressMood?.mood?.tags?.includes('stressed'), 'Macedonian stress mood wording must keep a stressed tag.')

  const spanishMood = tryParseMoodRequest('Me siento tranquilo y mejor hoy', dashboardContext)
  assert(spanishMood?.action === 'mood', 'Spanish mood wording must create a mood draft without AI.')
  assert(spanishMood?.mood?.tags?.includes('calm'), 'Spanish calm mood wording must keep a calm tag.')
  assert(spanishMood?.mood?.tags?.includes('positive'), 'Spanish better mood wording must keep a positive tag.')

  const frenchMood = tryParseMoodRequest("Je me sens calme et mieux aujourd'hui", dashboardContext)
  assert(frenchMood?.action === 'mood', 'French mood wording must create a mood draft without AI.')
  assert(frenchMood?.mood?.tags?.includes('calm'), 'French calm mood wording must keep a calm tag.')
  assert(frenchMood?.mood?.tags?.includes('positive'), 'French better mood wording must keep a positive tag.')

  const germanMood = tryParseMoodRequest('Ich fühle mich ruhig und besser heute', dashboardContext)
  assert(germanMood?.action === 'mood', 'German mood wording must create a mood draft without AI.')
  assert(germanMood?.mood?.tags?.includes('calm'), 'German calm mood wording must keep a calm tag.')
  assert(germanMood?.mood?.tags?.includes('positive'), 'German better mood wording must keep a positive tag.')

  const italianMood = tryParseMoodRequest('Mi sento calma e meglio oggi', dashboardContext)
  assert(italianMood?.action === 'mood', 'Italian mood wording must create a mood draft without AI.')
  assert(italianMood?.mood?.tags?.includes('calm'), 'Italian calm mood wording must keep a calm tag.')
  assert(italianMood?.mood?.tags?.includes('positive'), 'Italian better mood wording must keep a positive tag.')

  const portugueseMood = tryParseMoodRequest('Me sinto calma e melhor hoje', dashboardContext)
  assert(portugueseMood?.action === 'mood', 'Portuguese mood wording must create a mood draft without AI.')
  assert(portugueseMood?.mood?.tags?.includes('calm'), 'Portuguese calm mood wording must keep a calm tag.')
  assert(portugueseMood?.mood?.tags?.includes('positive'), 'Portuguese better mood wording must keep a positive tag.')

  const moodClarification = buildQuickClarificationDraft('log my mood', localDate)
  assert(moodClarification?.action === 'mood', 'Vague mood requests must create a follow-up draft.')
  const moodFollowUp = followUpTranscript(moodClarification, 'смирено и подобро денес')
  assert(/log mood: смирено и подобро денес/i.test(moodFollowUp || ''), 'Mood follow-up must combine the answer with the pending mood request.')
  const parsedMoodFollowUp = tryParseMoodRequest(moodFollowUp || '', dashboardContext)
  assert(parsedMoodFollowUp?.action === 'mood', 'Mood follow-up answer must become a reviewable mood draft.')
  assert(parsedMoodFollowUp?.mood?.tags?.includes('calm'), 'Mood follow-up must understand Macedonian calm wording.')
  assert(parsedMoodFollowUp?.mood?.tags?.includes('positive'), 'Mood follow-up must understand Macedonian better wording.')
  const reviewedMoodDraft = {
    action: 'mood',
    transcript: 'I feel stressed after work',
    localDate,
    summary: 'Mood 3/7, stressed',
    confirmationMessage: 'I can add this mood entry: Mood 3/7, stressed. Review it, then tap Confirm to save.',
    canConfirm: true,
    autoSave: false,
    mood: { mood: 3, tags: ['stressed'], note: 'I feel stressed after work' },
  }
  const correctedMood = await buildReviewedDraftCorrection(reviewedMoodDraft, 'change it to calm and better today instead', localDate)
  assert(correctedMood?.action === 'mood', 'Reviewed mood drafts must support natural mood corrections without saving.')
  assert(correctedMood?.mood?.mood === 5, 'Reviewed mood correction must update the mood score.')
  assert(correctedMood?.mood?.tags?.includes('calm'), 'Reviewed mood correction must keep the corrected calm tag.')
  assert(correctedMood?.mood?.tags?.includes('positive'), 'Reviewed mood correction must keep the corrected positive tag.')
  assert(correctedMood?.mood?.note === 'calm and better today', 'Reviewed mood correction must update the note text.')
  assert(correctedMood?.canConfirm === true, 'Reviewed mood correction must return a new reviewable draft.')
  assert(correctedMood?.autoSave === false, 'Reviewed mood correction must not auto-save the changed draft.')
  const correctedMoodMacedonian = await buildReviewedDraftCorrection(reviewedMoodDraft, 'смени во смирено и подобро денес', localDate)
  assert(correctedMoodMacedonian?.mood?.mood === 5, 'Reviewed mood correction must understand Macedonian mood changes.')
  assert(correctedMoodMacedonian?.mood?.tags?.includes('calm'), 'Reviewed Macedonian mood correction must keep calm tag.')

  const spanishSymptomNote = await normalizeDraft(
    { action: 'symptom_note' },
    'registrar dolor de cabeza hoy',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(spanishSymptomNote?.draft?.action === 'symptom_note', 'Any-language symptom tracking must create a safe symptom-note draft.')
  assert(spanishSymptomNote?.draft?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'Symptom note handoff must target the native Symptom Notes screen.')
  assert(spanishSymptomNote?.draft?.canConfirm === true, 'Symptom note tracking must be reviewable for saving.')
  assert(spanishSymptomNote?.draft?.autoSave === false, 'Symptom note tracking must not auto-save.')
  assert(spanishSymptomNote?.draft?.symptom?.symptoms?.includes('headache'), 'Spanish symptom tracking must recognize headache locally.')

  const frenchSymptomNote = await normalizeDraft(
    { action: 'unknown' },
    "Enregistre mal de tête aujourd'hui",
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(frenchSymptomNote?.draft?.action === 'symptom_note', 'French symptom tracking must create a safe symptom-note draft without AI.')
  assert(frenchSymptomNote?.draft?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'French symptom tracking must target native Symptom Notes.')
  assert(frenchSymptomNote?.draft?.canConfirm === true, 'French symptom tracking must be reviewable for saving.')
  assert(frenchSymptomNote?.draft?.symptom?.symptoms?.includes('headache'), 'French symptom tracking must recognize headache locally.')

  const spanishAdviceQuestion = await normalizeDraft(
    { action: 'symptom_note' },
    'Tengo dolor de cabeza, qué puede ser?',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(spanishAdviceQuestion?.draft?.action === 'health_question', 'Spanish medical advice questions must stay in the safer health-question path.')

  const frenchAdviceQuestion = await normalizeDraft(
    { action: 'symptom_note' },
    "J'ai mal de tête, qu'est-ce que ça peut être?",
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(frenchAdviceQuestion?.draft?.action === 'health_question', 'French medical advice questions must stay in the safer health-question path.')

  const germanSymptomNote = await normalizeDraft(
    { action: 'unknown' },
    'Notiere Kopfschmerzen heute',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(germanSymptomNote?.draft?.action === 'symptom_note', 'German symptom tracking must create a safe symptom-note draft without AI.')
  assert(germanSymptomNote?.draft?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'German symptom tracking must target native Symptom Notes.')
  assert(germanSymptomNote?.draft?.canConfirm === true, 'German symptom tracking must be reviewable for saving.')
  assert(germanSymptomNote?.draft?.symptom?.symptoms?.includes('headache'), 'German symptom tracking must recognize headache locally.')

  const germanAdviceQuestion = await normalizeDraft(
    { action: 'symptom_note' },
    'Ich habe Kopfschmerzen, was könnte das sein?',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(germanAdviceQuestion?.draft?.action === 'health_question', 'German medical advice questions must stay in the safer health-question path.')

  const italianSymptomNote = await normalizeDraft(
    { action: 'unknown' },
    'Registra mal di testa oggi',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(italianSymptomNote?.draft?.action === 'symptom_note', 'Italian symptom tracking must create a safe symptom-note draft without AI.')
  assert(italianSymptomNote?.draft?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'Italian symptom tracking must target native Symptom Notes.')
  assert(italianSymptomNote?.draft?.canConfirm === true, 'Italian symptom tracking must be reviewable for saving.')
  assert(italianSymptomNote?.draft?.symptom?.symptoms?.includes('headache'), 'Italian symptom tracking must recognize headache locally.')

  const italianAdviceQuestion = await normalizeDraft(
    { action: 'symptom_note' },
    'Ho mal di testa, cosa può essere?',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(italianAdviceQuestion?.draft?.action === 'health_question', 'Italian medical advice questions must stay in the safer health-question path.')

  const portugueseSymptomNote = await normalizeDraft(
    { action: 'unknown' },
    'Registra dor de cabeça hoje',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(portugueseSymptomNote?.draft?.action === 'symptom_note', 'Portuguese symptom tracking must create a safe symptom-note draft without AI.')
  assert(portugueseSymptomNote?.draft?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'Portuguese symptom tracking must target native Symptom Notes.')
  assert(portugueseSymptomNote?.draft?.canConfirm === true, 'Portuguese symptom tracking must be reviewable for saving.')
  assert(portugueseSymptomNote?.draft?.symptom?.symptoms?.includes('headache'), 'Portuguese symptom tracking must recognize headache locally.')

  const portugueseAdviceQuestion = await normalizeDraft(
    { action: 'symptom_note' },
    'Tenho dor de cabeça, o que pode ser?',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(portugueseAdviceQuestion?.draft?.action === 'health_question', 'Portuguese medical advice questions must stay in the safer health-question path.')

  const macedonianFood = await normalizeDraft(
    {
      action: 'food_build_meal',
      summary: 'Snack',
      food: {
        meal: 'snacks',
        mealName: 'Snack',
        draftText: 'two apples and 30 g peanuts',
        ingredients: [
          { name: 'apple', quantity: 2, unit: 'each', display: 'two apples' },
          { name: 'peanuts', quantity: 30, unit: 'g', display: '30 g peanuts' },
        ],
      },
    },
    'Додај две јаболка и 30 грама кикирики како ужина',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(macedonianFood?.draft?.action === 'food_build_meal', 'Macedonian AI food intent must become a real food draft.')
  assert(macedonianFood?.draft?.canConfirm === true, 'Macedonian AI food intent with clear amounts must be reviewable for saving.')
  assert(macedonianFood?.draft?.food?.meal === 'snacks', 'Macedonian AI food intent must keep the target meal.')
  assert(/apple/i.test(macedonianFood?.draft?.food?.draftText || ''), 'Macedonian AI food intent must keep the apple item.')
  assert(/peanut/i.test(macedonianFood?.draft?.food?.draftText || ''), 'Macedonian AI food intent must keep the peanut item.')

  const spanishJournal = await normalizeDraft(
    {
      action: 'journal',
      summary: 'Health journal',
      journal: {
        title: 'Nota de salud',
        content: 'Dormí mejor y tuve menos dolor hoy',
        tags: ['sleep', 'pain'],
        journalType: 'health',
      },
    },
    'Escribe en mi diario de salud que dormí mejor y tuve menos dolor hoy',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(spanishJournal?.draft?.action === 'journal', 'Spanish AI journal intent must become a journal draft.')
  assert(spanishJournal?.draft?.canConfirm === true, 'Spanish AI journal intent must be reviewable for saving.')
  assert(/Dormí mejor/i.test(spanishJournal?.draft?.journal?.content || ''), 'Spanish AI journal intent must keep the note content.')
  assert(spanishJournal?.draft?.journal?.journalType === 'health', 'Spanish AI journal intent must keep health journal type.')

  const frenchWater = await normalizeDraft(
    {
      action: 'water',
      summary: 'Water',
      water: { amount: 500, unit: 'ml', label: 'Water' },
    },
    "Ajoute 500 ml d'eau",
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(frenchWater?.draft?.action === 'water', 'French AI water intent must become a water draft.')
  assert(frenchWater?.draft?.canConfirm === true, 'French AI water intent must be reviewable for saving.')
  assert(frenchWater?.draft?.water?.amountMl === 500, 'French AI water intent must keep the amount.')

  const japaneseFood = await normalizeDraft(
    {
      action: 'food_build_meal',
      summary: 'Snack',
      food: {
        meal: 'snacks',
        mealName: 'Snack',
        draftText: 'two apples and 30 g peanuts',
        ingredients: [
          { name: 'apple', quantity: 2, unit: 'each', display: 'two apples' },
          { name: 'peanuts', quantity: 30, unit: 'g', display: '30 g peanuts' },
        ],
      },
    },
    'おやつにりんご2個とピーナッツ30グラムを記録して',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(japaneseFood?.draft?.action === 'food_build_meal', 'Any-language AI food intent must become a real food draft.')
  assert(japaneseFood?.draft?.canConfirm === true, 'Any-language AI food intent must be reviewable for saving.')
  assert(/apple/i.test(japaneseFood?.draft?.food?.draftText || ''), 'Any-language AI food intent must keep translated food items.')
  assert(/peanut/i.test(japaneseFood?.draft?.food?.draftText || ''), 'Any-language AI food intent must keep translated amounts.')

  const arabicWater = await normalizeDraft(
    {
      action: 'water',
      summary: 'Water',
      water: { amount: 750, unit: 'ml', label: 'Water' },
    },
    'سجل لي ٧٥٠ مل من الماء',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(arabicWater?.draft?.action === 'water', 'Any-language AI water intent must become a water draft.')
  assert(arabicWater?.draft?.canConfirm === true, 'Any-language AI water intent must be reviewable for saving.')
  assert(arabicWater?.draft?.water?.amountMl === 750, 'Any-language AI water intent must keep the translated amount.')

  const hindiJournal = await normalizeDraft(
    {
      action: 'journal',
      summary: 'Health journal',
      journal: {
        title: 'Health note',
        content: 'आज मेरी नींद बेहतर थी और दर्द कम था',
        tags: ['sleep', 'pain'],
        journalType: 'health',
      },
    },
    'मेरे हेल्थ जर्नल में लिखो कि आज मेरी नींद बेहतर थी और दर्द कम था',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(hindiJournal?.draft?.action === 'journal', 'Any-language AI journal intent must become a journal draft.')
  assert(hindiJournal?.draft?.canConfirm === true, 'Any-language AI journal intent must be reviewable for saving.')
  assert(/नींद/.test(hindiJournal?.draft?.journal?.content || ''), 'Any-language AI journal intent must keep the user note content.')
  assert(hindiJournal?.draft?.journal?.journalType === 'health', 'Any-language AI journal intent must keep the health journal target.')

  const chineseSymptom = await normalizeDraft(
    {
      action: 'symptom_note',
      symptom: {
        symptoms: ['headache', 'nausea'],
        duration: 'three hours',
        notes: '今天头痛和恶心三个小时',
      },
    },
    '记录一下今天头痛和恶心三个小时',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(chineseSymptom?.draft?.action === 'symptom_note', 'Any-language AI symptom tracking must create a safe symptom-note draft.')
  assert(chineseSymptom?.draft?.canConfirm === true, 'Any-language AI symptom tracking must be reviewable for saving.')
  assert(chineseSymptom?.draft?.autoSave === false, 'Any-language AI symptom tracking must not auto-save.')
  assert(chineseSymptom?.draft?.symptom?.symptoms?.includes('headache'), 'Any-language AI symptom tracking must keep translated symptom fields.')
  assert(chineseSymptom?.draft?.symptom?.duration === 'three hours', 'Any-language AI symptom tracking must keep translated duration.')

  const macedonianSymptom = await normalizeDraft(
    { action: 'symptom_note' },
    'Запиши дека денес имам главоболка и трае два часа',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(macedonianSymptom?.draft?.action === 'symptom_note', 'Macedonian symptom tracking must create a safe Symptom Notes draft.')
  assert(macedonianSymptom?.draft?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'Macedonian symptom tracking must target native Symptom Notes.')
  assert(macedonianSymptom?.draft?.canConfirm === true, 'Macedonian symptom tracking must be reviewable for saving.')
  assert(macedonianSymptom?.draft?.autoSave === false, 'Macedonian symptom tracking must not auto-save or diagnose.')
  assert(macedonianSymptom?.draft?.symptom?.symptoms?.includes('headache'), 'Local Macedonian symptom tracking must recognize headache.')
  assert(macedonianSymptom?.draft?.symptom?.duration === 'два часа', 'Local Macedonian symptom tracking must keep the spoken duration.')

  const macedonianAdvice = await normalizeDraft(
    { action: 'symptom_note' },
    'Имам главоболка, што може да биде?',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(macedonianAdvice?.draft?.action === 'health_question', 'Macedonian medical advice questions must stay in the safer health-question path.')

  const englishSymptomNote = buildQuickToolDraft('Record a symptom note: headache today for 2 hours', localDate, { section: 'symptoms', title: 'Symptom Notes' })
  assert(englishSymptomNote?.action === 'symptom_note', 'English symptom-note wording must stay a symptom note, not a journal note.')
  assert(englishSymptomNote?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'English symptom-note wording must target native Symptom Notes.')
  assert(englishSymptomNote?.canConfirm === true, 'English symptom-note wording must be reviewable before saving.')
  const correctedSymptomNote = englishSymptomNote ? await buildReviewedDraftCorrection(englishSymptomNote, 'change it to headache and nausea for 3 hours instead', localDate) : null
  assert(correctedSymptomNote?.action === 'symptom_note', 'Reviewed symptom-note drafts must support natural symptom corrections without saving.')
  assert(correctedSymptomNote?.symptom?.symptoms?.includes('headache'), 'Reviewed symptom-note correction must keep headache.')
  assert(correctedSymptomNote?.symptom?.symptoms?.includes('nausea'), 'Reviewed symptom-note correction must add nausea.')
  assert(correctedSymptomNote?.symptom?.duration === '3 hours', 'Reviewed symptom-note correction must update duration.')
  assert(/headache and nausea/i.test(correctedSymptomNote?.symptom?.notes || ''), 'Reviewed symptom-note correction must update notes.')
  assert(correctedSymptomNote?.canConfirm === true, 'Reviewed symptom-note correction must return a new reviewable draft.')
  assert(correctedSymptomNote?.autoSave === false, 'Reviewed symptom-note correction must not auto-save the changed draft.')
  assert(correctedSymptomNote?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'Reviewed symptom-note correction must still target native Symptom Notes.')
  const correctedSymptomMacedonian = englishSymptomNote ? await buildReviewedDraftCorrection(englishSymptomNote, 'смени во главоболка денес два часа', localDate) : null
  assert(correctedSymptomMacedonian?.symptom?.symptoms?.includes('headache'), 'Reviewed symptom-note correction must understand Macedonian symptom changes.')
  assert(correctedSymptomMacedonian?.symptom?.duration === 'два часа', 'Reviewed symptom-note correction must keep Macedonian duration.')

  const aiMacedonianSymptom = await normalizeDraft(
    {
      action: 'symptom_note',
      symptom: {
        symptoms: ['headache'],
        duration: 'two hours',
        notes: 'денес имам главоболка',
      },
    },
    'Запиши дека денес имам главоболка и трае два часа',
    localDate,
    'test-user',
    {},
    0,
    [],
  )
  assert(aiMacedonianSymptom?.draft?.symptom?.symptoms?.includes('headache'), 'AI-translated Macedonian symptom details must be saved in structured symptom-note fields.')
  assert(aiMacedonianSymptom?.draft?.symptom?.duration === 'two hours', 'AI-translated Macedonian symptom duration must be kept.')

  const calorieRecommendation = 'what should I eat based on calories and nutrients left today'
  assert(isFoodRecommendationRequest(calorieRecommendation, dashboardContext), 'Calories and nutrients left wording must be treated as meal recommendation.')
  assert(buildQuickRecipeDraft(calorieRecommendation, localDate, dashboardContext) === null, 'Diary-aware meal recommendations must not become generic quick recipe shortcuts.')
  assert(buildQuickToolDraft(calorieRecommendation, localDate, foodContext) === null, 'Diary-aware meal recommendations must not fall through to the generic health-question shortcut.')
  const exactSimulatorMealQuestion = 'What should I eat based on calories and nutrients left today?'
  assert(isFoodRecommendationRequest(exactSimulatorMealQuestion, foodContext), 'Exact simulator meal question must be treated as a meal recommendation.')
  assert(isFoodRecommendationRequest(exactSimulatorMealQuestion, { section: 'generic', title: 'Food Diary', meal: 'lunch' }), 'Exact simulator meal question must stay a meal recommendation when Food Diary is only present in the title.')
  assert(buildQuickToolDraft(exactSimulatorMealQuestion, localDate, foodContext) === null, 'Exact simulator meal question must not become a generic health-question handoff.')
  const correctedHealthQuestionRecommendation = await normalizeDraft(
    { action: 'health_question' },
    exactSimulatorMealQuestion,
    localDate,
    'test-user',
    {},
    0,
    [],
    { section: 'generic', title: 'Food Diary', meal: 'lunch' },
  )
  assert(correctedHealthQuestionRecommendation?.draft?.action === 'recipe', 'AI health_question mislabels from Food Diary must be corrected to meal recommendation replies.')
  assert(!correctedHealthQuestionRecommendation?.draft?.appTarget, 'Corrected Food Diary meal recommendation must not open Build a meal on the first reply.')
  assert(/Tell me what you think/i.test(correctedHealthQuestionRecommendation?.draft?.confirmationMessage || ''), 'Corrected Food Diary meal recommendation must invite conversation first.')
  const greedyFavoriteRequest = 'Log chicken breast and cooked rice for lunch'
  const chickenFavorite = [{ label: 'Chicken Breast', description: 'Chicken Breast', meal: 'lunch', nutrition: { calories: 168 } }]
  assert(!shouldUseFavoriteFood(greedyFavoriteRequest, chickenFavorite), 'Multi-item meal logging must not be swallowed by a single matching favourite.')
  const greedyFavoriteMeal = tryParseDirectFoodRequest(greedyFavoriteRequest, { section: 'food', title: 'Food Diary', meal: 'lunch' })
  assert((greedyFavoriteMeal?.ingredients || []).length >= 2, 'Direct meal logging must keep chicken and rice as separate review items.')
  const misheardFavoriteRequest = 'lobbed chicken breast and cooked rice for lunch'
  assert(!shouldUseFavoriteFood(misheardFavoriteRequest, chickenFavorite), 'Misheard voice meal logging must not be swallowed by a single matching favourite.')
  const misheardFavoriteMeal = tryParseDirectFoodRequest(misheardFavoriteRequest, { section: 'food', title: 'Food Diary', meal: 'lunch' })
  assert((misheardFavoriteMeal?.ingredients || []).length >= 2, 'Misheard voice meal logging must keep chicken and rice as separate review items.')
  const explicitFavoriteRequest = 'Log my saved Chicken Breast for lunch'
  assert(shouldUseFavoriteFood(explicitFavoriteRequest, chickenFavorite), 'Explicit saved/favourite wording must still use favourites.')
  const pluralFavoriteRequest = "Please add Louis' breakfast from my favourites to breakfast in my food diary."
  const louieBreakfastFavorite = [{ label: "Louie's Breakfast", description: "Louie's Breakfast", meal: 'breakfast', nutrition: { calories: 315 } }]
  assert(shouldUseFavoriteFood(pluralFavoriteRequest, louieBreakfastFavorite), 'Plural favourites wording must still use the saved favourite fast path.')
  const pluralFavoriteDraft = await buildFavoriteFoodDraft(pluralFavoriteRequest, localDate, louieBreakfastFavorite)
  assert(pluralFavoriteDraft?.action === 'food_favorite', 'Plural favourites wording must build a favourite food draft.')
	  assert(pluralFavoriteDraft?.food?.favorite?.label === "Louie's Breakfast", 'Possessive spelling differences must still match the saved favourite.')
	  const journalAfterLunchRequest = 'Write in my health journal that I felt tired after lunch today.'
	  const lunchNamedFavorite = [{ label: 'For lunch', description: 'For lunch', meal: 'lunch', nutrition: { calories: 300 } }]
	  assert(!shouldUseFavoriteFood(journalAfterLunchRequest, lunchNamedFavorite), 'Health journal wording must not be swallowed by a favourite named around lunch.')
	  const foodContextHealthIntakeRequest = 'I take magnesium glycinate 200 mg at night and metformin 500 mg twice daily.'
	  const misleadingDailyFavorite = [{ label: 'Daily to', description: 'Daily to', meal: 'breakfast', nutrition: { calories: 315 } }]
	  assert(!shouldUseFavoriteFood(foodContextHealthIntakeRequest, misleadingDailyFavorite), 'Health Intake medication/supplement wording from Food Diary must not be swallowed by a favourite named Daily.')
	  const foodContextHealthIntakeDraft = tryParseHealthIntakeItemsRequest(foodContextHealthIntakeRequest, localDate, foodContext)
	  assert(foodContextHealthIntakeDraft?.action === 'health_intake_items', 'Health Intake medication/supplement wording from Food Diary must create a review draft.')
	  assert((foodContextHealthIntakeDraft?.healthIntake?.items || []).some((item) => item.type === 'supplement' && /^magnesium glycinate$/i.test(item.name)), 'Food Diary Health Intake wording must keep magnesium glycinate as a supplement.')
	  assert((foodContextHealthIntakeDraft?.healthIntake?.items || []).some((item) => item.type === 'medication' && /^metformin$/i.test(item.name)), 'Food Diary Health Intake wording must keep metformin as a medication.')
	  assert(foodContextHealthIntakeDraft?.autoSave === false, 'Food Diary Health Intake wording must stay review-first.')
	  const foodDiaryAdviceContext = { section: 'food', title: 'Food Diary' }
  const foodDiaryAdviceDraft = buildFoodRecommendationConversationDraft(calorieRecommendation, localDate, foodDiaryAdviceContext)
  assert(!/uncategorized/i.test(foodDiaryAdviceDraft?.recipe?.text || ''), 'Generic Food Diary meal advice must not say uncategorized.')
  assert(/Dinner recommendation/i.test(foodDiaryAdviceDraft?.recipe?.importDraft?.title || ''), 'Generic Food Diary meal advice should fall back to a real meal category.')

  const macroRecommendation = 'recommend dinner that fits my remaining carbs and fat'
  assert(isFoodRecommendationRequest(macroRecommendation, dashboardContext), 'Remaining carbs and fat wording must be treated as meal recommendation.')
  assert(buildQuickRecipeDraft(macroRecommendation, localDate, dashboardContext) === null, 'Macro-based meal recommendations must stay on the diary-aware recommendation path.')

  const remainingProteinRecommendation = 'Recommend dinner based on my remaining calories and protein today'
  assert(isFoodRecommendationRequest(remainingProteinRecommendation, foodContext), 'Remaining calories and protein recommendation wording must be treated as a meal recommendation.')
  const remainingProteinDraft = buildFoodRecommendationConversationDraft(remainingProteinRecommendation, localDate, foodContext)
  assert(remainingProteinDraft?.action === 'recipe', 'Remaining calories and protein recommendation must create a meal recommendation reply.')
  assert(!remainingProteinDraft?.appTarget, 'First meal recommendation reply must not immediately open Build a meal.')
  assert(/High-protein Dinner recommendation/i.test(remainingProteinDraft?.recipe?.importDraft?.title || ''), 'Food recommendation fallback must create a useful high-protein dinner title.')
  assert((remainingProteinDraft?.recipe?.importDraft?.ingredients || []).includes('150 g chicken breast'), 'Food recommendation fallback must prefill useful starter ingredients.')
  assert(/Tell me what you think/i.test(remainingProteinDraft?.confirmationMessage || ''), 'Food recommendation fallback must invite conversation before building.')

  const lunchRecommendation = "It's nearly lunchtime. Based on my current calories and macros today, what do you recommend I eat?"
  assert(isFoodRecommendationRequest(lunchRecommendation, foodContext), 'Exact lunchtime calories/macros wording must be treated as a meal recommendation.')
  const fallbackLunchRecommendationDraft = buildFoodRecommendationConversationDraft(lunchRecommendation, localDate, foodContext)
  assert(!fallbackLunchRecommendationDraft?.appTarget, 'Exact lunch recommendation must start as conversation, not a Build a meal handoff.')
  assert(!/prepared something|opened|build a meal/i.test(fallbackLunchRecommendationDraft?.recipe?.text || ''), 'First lunch recommendation must not sound like it already prepared or opened a Build a meal draft.')
  assert(!/build this meal|want me to build/i.test(fallbackLunchRecommendationDraft?.recipe?.text || ''), 'First lunch recommendation must not push Build a meal before the user chooses.')
  assert(/Balanced Lunch recommendation/i.test(fallbackLunchRecommendationDraft?.recipe?.text || ''), 'Fallback lunch recommendation must say the suggested meal aloud/in text.')
  assert(/100 g chickpeas/i.test(fallbackLunchRecommendationDraft?.recipe?.text || ''), 'Fallback lunch recommendation must include the starter ingredients aloud/in text.')
  const sampleDiarySnapshot = {
    localDate,
    tzOffsetMin: 0,
    totals: { calories: 600, protein_g: 35, carbs_g: 70, fat_g: 20, fiber_g: 8, sugar_g: 12 },
    targets: { calories: 2200, protein_g: 150, carbs_g: 240, fat_g: 70, fiber_g: 30, sugar_g: 35 },
    remaining: {
      calories: { remaining: 1600, remainingClamped: 1600, overBy: 0 },
      protein_g: { remaining: 115, remainingClamped: 115, overBy: 0 },
      carbs_g: { remaining: 170, remainingClamped: 170, overBy: 0 },
      fat_g: { remaining: 50, remainingClamped: 50, overBy: 0 },
      fiber_g: { remaining: 22, remainingClamped: 22, overBy: 0 },
      sugar_g: { remaining: 23, remainingClamped: 23, overBy: 0 },
    },
    priority: { low: ['Protein', 'Fibre'], nearCap: ['Sugar'] },
    logCount: 2,
  }
  const contextualLunchRecommendationDraft = buildFoodRecommendationConversationDraft(lunchRecommendation, localDate, foodContext, undefined, { diarySnapshot: sampleDiarySnapshot })
  assert(/about 1600 kcal left/i.test(contextualLunchRecommendationDraft?.recipe?.text || ''), 'Fallback lunch recommendation must mention remaining calories when diary context is available.')
  assert(/more Protein and Fibre/i.test(contextualLunchRecommendationDraft?.recipe?.text || ''), 'Fallback lunch recommendation must mention low-priority nutrients when diary context is available.')
  assert(/keeping Sugar lighter/i.test(contextualLunchRecommendationDraft?.recipe?.text || ''), 'Fallback lunch recommendation must mention near-target nutrients when diary context is available.')
  assert(wantsToBuildRecommendedMeal('yes please build that meal'), 'Natural confirmation must be recognized as a Build a meal follow-up.')
  const lunchBuildDraft = buildFoodRecommendationHandoffDraft('yes please build that meal', localDate, foodContext, fallbackLunchRecommendationDraft.recipe.text)
  assert(lunchBuildDraft?.appTarget?.nativeTarget?.action === 'openBuildMeal', 'Confirmed lunch recommendation must open native Build a meal.')
  assert(lunchBuildDraft?.appTarget?.nativeTarget?.meal === 'lunch', 'Confirmed lunch recommendation must open Build a meal in Lunch.')
  assert(wantsAnotherMealRecommendation("I don't really like that, do you have another suggestion?"), 'Natural dislike/another-option wording must be recognized as a meal recommendation follow-up.')
  assert(wantsAnotherMealRecommendation('No me gusta, dame otra opción'), 'Spanish another-option wording must be recognized as a meal recommendation follow-up.')
  assert(wantsAnotherMealRecommendation("Je n'aime pas ça, une autre suggestion ?"), 'French another-option wording must be recognized as a meal recommendation follow-up.')
  assert(wantsAnotherMealRecommendation('Das mag ich nicht, etwas anderes bitte'), 'German another-option wording must be recognized as a meal recommendation follow-up.')
  assert(wantsAnotherMealRecommendation('Не ми се допаѓа, дај друга опција'), 'Macedonian another-option wording must be recognized as a meal recommendation follow-up.')
  assert(wantsAnotherMealRecommendation('好きじゃない、別のおすすめは？'), 'Japanese another-option wording must be recognized as a meal recommendation follow-up.')
  assert(wantsMealRecommendationAdjustment('can you make it vegetarian?'), 'Vegetarian meal tweak wording must be recognized as a meal recommendation adjustment.')
  assert(wantsMealRecommendationAdjustment('make it less carbs'), 'Lower-carb meal tweak wording must be recognized as a meal recommendation adjustment.')
  assert(wantsMealRecommendationAdjustment("I don't eat chicken"), 'No-chicken meal tweak wording must be recognized as a meal recommendation adjustment.')
  assert(wantsMealRecommendationAdjustment('make it dairy-free'), 'Dairy-free meal tweak wording must be recognized as a meal recommendation adjustment.')
  assert(wantsMealRecommendationAdjustment('no nuts please'), 'Nut-free meal tweak wording must be recognized as a meal recommendation adjustment.')
  assert(wantsMealRecommendationAdjustment('make it vegan'), 'Vegan meal tweak wording must be recognized as a meal recommendation adjustment.')
  assert(wantsMealRecommendationAdjustment('направи го без месо'), 'Macedonian meat-free meal tweak wording must be recognized as a meal recommendation adjustment.')
  const anotherLunchDraft = buildFoodRecommendationConversationDraft(
    "I don't really like that, do you have another suggestion?",
    localDate,
    { section: 'food', title: 'Food Diary' },
    undefined,
    { alternativeTo: fallbackLunchRecommendationDraft.recipe.text },
  )
  assert(!anotherLunchDraft?.appTarget, 'Another meal suggestion must stay conversational and not open Build a meal immediately.')
  assert(/Another option/i.test(anotherLunchDraft?.recipe?.text || ''), 'Another meal suggestion must clearly answer as an alternative option.')
  assert(/Chicken quinoa lunch/i.test(anotherLunchDraft?.recipe?.text || ''), 'Another meal suggestion must avoid repeating the first fallback lunch.')
  const anotherLunchBuildDraft = buildFoodRecommendationHandoffDraft('yes please build that meal', localDate, { section: 'food', title: 'Food Diary' }, anotherLunchDraft.recipe.text)
  assert(anotherLunchBuildDraft?.appTarget?.nativeTarget?.meal === 'lunch', 'Confirmed alternative lunch must keep the lunch context.')
  assert((anotherLunchBuildDraft?.recipe?.importDraft?.ingredients || []).includes('140 g chicken breast'), 'Confirmed alternative lunch must build the alternative ingredients.')
  const vegetarianLunchDraft = buildFoodRecommendationConversationDraft(
    'can you make it vegetarian?',
    localDate,
    { section: 'food', title: 'Food Diary' },
    undefined,
    { alternativeTo: fallbackLunchRecommendationDraft.recipe.text, adjustment: true },
  )
  assert(!vegetarianLunchDraft?.appTarget, 'Vegetarian meal tweak must stay conversational and not open Build a meal immediately.')
  assert(/adjusted option/i.test(vegetarianLunchDraft?.recipe?.text || ''), 'Vegetarian meal tweak must clearly answer with an adjusted option.')
  assert(/Vegetarian chickpea lunch/i.test(vegetarianLunchDraft?.recipe?.text || ''), 'Vegetarian meal tweak must create a vegetarian lunch suggestion.')
  assert((vegetarianLunchDraft?.recipe?.importDraft?.ingredients || []).includes('120 g tofu'), 'Vegetarian meal tweak must include vegetarian starter ingredients.')
  const vegetarianBuildDraft = buildFoodRecommendationHandoffDraft('yes please build that meal', localDate, { section: 'food', title: 'Food Diary' }, vegetarianLunchDraft.recipe.text)
  assert((vegetarianBuildDraft?.recipe?.importDraft?.ingredients || []).includes('120 g tofu'), 'Confirmed vegetarian tweak must build the adjusted ingredients.')
  const lowCarbLunchDraft = buildFoodRecommendationConversationDraft(
    'make it less carbs',
    localDate,
    { section: 'food', title: 'Food Diary' },
    undefined,
    { alternativeTo: fallbackLunchRecommendationDraft.recipe.text, adjustment: true },
  )
  assert(/Lower-carb chicken salad lunch/i.test(lowCarbLunchDraft?.recipe?.text || ''), 'Lower-carb meal tweak must create a lower-carb lunch suggestion.')
  assert((lowCarbLunchDraft?.recipe?.importDraft?.ingredients || []).includes('150 g salad greens'), 'Lower-carb meal tweak must include lower-carb starter ingredients.')
  const noChickenLunchDraft = buildFoodRecommendationConversationDraft(
    "I don't eat chicken",
    localDate,
    { section: 'food', title: 'Food Diary' },
    undefined,
    { alternativeTo: anotherLunchDraft.recipe.text, adjustment: true },
  )
  assert(/Chicken-free salmon lunch/i.test(noChickenLunchDraft?.recipe?.text || ''), 'No-chicken meal tweak must create a chicken-free lunch suggestion.')
  assert(!(noChickenLunchDraft?.recipe?.importDraft?.ingredients || []).some((ingredient) => /chicken/i.test(ingredient)), 'No-chicken meal tweak must not include chicken.')
  const dairyFreeSnackDraft = buildFoodRecommendationConversationDraft(
    'make it dairy-free',
    localDate,
    { section: 'food', title: 'Food Diary', meal: 'snacks' },
    undefined,
    { alternativeTo: 'Greek yogurt banana snack. Ingredients: 170 g plain Greek yogurt, 1 banana.', adjustment: true },
  )
  assert(/Dairy-free apple seed snack/i.test(dairyFreeSnackDraft?.recipe?.text || ''), 'Dairy-free snack tweak must create a dairy-free snack suggestion.')
  assert(!(dairyFreeSnackDraft?.recipe?.importDraft?.ingredients || []).some((ingredient) => /yogurt|yoghurt|milk|dairy/i.test(ingredient)), 'Dairy-free snack tweak must not include dairy ingredients.')
  const nutFreeSnackDraft = buildFoodRecommendationConversationDraft(
    'no nuts please',
    localDate,
    { section: 'food', title: 'Food Diary', meal: 'snacks' },
    undefined,
    { alternativeTo: 'Apple peanut snack. Ingredients: 1 apple, 30 g peanuts.', adjustment: true },
  )
  assert(/Nut-free yogurt berry snack/i.test(nutFreeSnackDraft?.recipe?.text || ''), 'Nut-free snack tweak must create a nut-free snack suggestion.')
  assert(!(nutFreeSnackDraft?.recipe?.importDraft?.ingredients || []).some((ingredient) => /peanut|nuts?/i.test(ingredient)), 'Nut-free snack tweak must not include nuts.')
  const veganLunchDraft = buildFoodRecommendationConversationDraft(
    'make it vegan',
    localDate,
    { section: 'food', title: 'Food Diary' },
    undefined,
    { alternativeTo: fallbackLunchRecommendationDraft.recipe.text, adjustment: true },
  )
  assert(/Vegan tofu chickpea lunch/i.test(veganLunchDraft?.recipe?.text || ''), 'Vegan lunch tweak must create a vegan lunch suggestion.')
  assert(!(veganLunchDraft?.recipe?.importDraft?.ingredients || []).some((ingredient) => /chicken|salmon|egg|yogurt|yoghurt|milk|dairy/i.test(ingredient)), 'Vegan lunch tweak must not include animal products.')
  const veganBreakfastDraft = buildFoodRecommendationConversationDraft(
    'plant-based please',
    localDate,
    { section: 'food', title: 'Food Diary', meal: 'breakfast' },
    undefined,
    { alternativeTo: 'Greek yogurt egg breakfast. Ingredients: 2 eggs, 170 g plain Greek yogurt.', adjustment: true },
  )
  assert(/Vegan oat chia breakfast/i.test(veganBreakfastDraft?.recipe?.text || ''), 'Plant-based breakfast tweak must create a vegan breakfast suggestion.')
  assert(!(veganBreakfastDraft?.recipe?.importDraft?.ingredients || []).some((ingredient) => /egg|yogurt|yoghurt|milk|dairy/i.test(ingredient)), 'Plant-based breakfast tweak must not include egg or dairy.')
  assert(wantsToBuildRecommendedMeal('sí, prepara esa comida'), 'Spanish build-that-meal wording must be recognized as a meal build follow-up.')
  assert(wantsToBuildRecommendedMeal('oui, prépare ce repas'), 'French build-that-meal wording must be recognized as a meal build follow-up.')
  assert(wantsToBuildRecommendedMeal('ja, baue diese Mahlzeit'), 'German build-that-meal wording must be recognized as a meal build follow-up.')
  assert(wantsToBuildRecommendedMeal('да, направи го тој оброк'), 'Macedonian build-that-meal wording must be recognized as a meal build follow-up.')
  assert(wantsToBuildRecommendedMeal('はい、この食事を作って'), 'Japanese build-that-meal wording must be recognized as a meal build follow-up.')
  assert(wantsToChooseRecommendedMeal('that sounds good'), 'User liking a meal recommendation must be recognized as choosing the suggested meal.')
  assert(wantsToChooseRecommendedMeal('mi se dopaga') === false, 'Loose transliteration without clear intent must not accidentally choose a meal.')
  assert(wantsToChooseRecommendedMeal('ми се допаѓа'), 'Macedonian meal choice wording must be recognized.')
  const buildOfferDraft = buildFoodRecommendationBuildOfferDraft('that sounds good', localDate)
  assert(!buildOfferDraft?.appTarget, 'Meal choice follow-up must ask before opening Build a meal.')
  assert(/Would you like me to build that meal/i.test(buildOfferDraft?.recipe?.text || ''), 'Meal choice follow-up must ask whether to build the agreed meal.')
  const parsedRecommendationFollowUp = parseFollowUpDraft(fallbackLunchRecommendationDraft)
  assert(parsedRecommendationFollowUp?.action === 'recipe', 'Visible meal recommendation drafts must be accepted as follow-up context.')
  assert(
    latestMealRecommendationText([{ role: 'assistant', text: parsedRecommendationFollowUp.recipe.text }])?.includes('chickpeas'),
    'Visible meal recommendation follow-up context must be usable as meal memory.',
  )
  const declineBuildOfferDraft = buildFoodRecommendationBuildDeclineDraft('no thanks', localDate)
  assert(!declineBuildOfferDraft?.appTarget && declineBuildOfferDraft?.canConfirm === false, 'Declining a meal build offer must not open Build a meal or save anything.')
  assert(/will not build or save/i.test(declineBuildOfferDraft?.recipe?.text || ''), 'Declining a meal build offer must clearly say nothing will be built or saved.')
  assert(latestMealBuildOfferText([{ role: 'assistant', text: buildOfferDraft.recipe.text }]), 'Build-offer prompt must be recognized for the next yes/no response.')
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: fallbackLunchRecommendationDraft.recipe.text },
      { role: 'assistant', text: buildOfferDraft.recipe.text },
      { role: 'assistant', text: declineBuildOfferDraft.recipe.text },
    ])?.includes('chickpeas'),
    'Declining a build offer must not replace the real meal recommendation memory.',
  )
  assert(
    !latestMealBuildOfferText([
      { role: 'assistant', text: fallbackLunchRecommendationDraft.recipe.text },
      { role: 'assistant', text: buildOfferDraft.recipe.text },
      { role: 'assistant', text: declineBuildOfferDraft.recipe.text },
    ]),
    'Declining a build offer must stop a later plain yes from using the older build-offer prompt.',
  )
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: fallbackLunchRecommendationDraft.recipe.text },
      { role: 'assistant', text: buildOfferDraft.recipe.text },
    ])?.includes('chickpeas'),
    'Build-offer prompt must not replace the prior meal recommendation memory.',
  )
  assert(isConfirmingDraftText('yes') && latestMealBuildOfferText([{ role: 'assistant', text: buildOfferDraft.recipe.text }]), 'A plain yes after a build-offer prompt must be enough to build the prior recommendation.')
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: 'Te recomiendo un almuerzo con pollo. Ingredientes: pollo, arroz integral, verduras.' },
    ])?.includes('pollo'),
    'Spanish assistant meal replies must be found as prior meal recommendations.',
  )
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: 'Je recommande un déjeuner avec poulet. Ingrédients: poulet, riz, salade.' },
    ])?.includes('poulet'),
    'French assistant meal replies must be found as prior meal recommendations.',
  )
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: 'Препорачувам ручек со пилешко. Состојки: пилешко, ориз, салата.' },
    ])?.includes('пилешко'),
    'Macedonian assistant meal replies must be found as prior meal recommendations.',
  )
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: '昼食には鶏肉の食事がおすすめです。材料: 鶏肉、米、野菜。' },
    ])?.includes('鶏肉'),
    'Japanese assistant meal replies must be found as prior meal recommendations.',
  )
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: 'أوصي بوجبة غداء مع الدجاج. مكونات: دجاج، أرز، خضار.' },
    ])?.includes('دجاج'),
    'Arabic assistant meal replies must be found as prior meal recommendations.',
  )
  assert(
    latestMealRecommendationText([
      { role: 'assistant', text: 'मैं चिकन वाला भोजन सुझाता हूँ। सामग्री: चिकन, चावल, सब्जियां।' },
    ])?.includes('चिकन'),
    'Hindi assistant meal replies must be found as prior meal recommendations.',
  )
  const lunchAiText = [
    'High Protein Chicken Rice Bowl',
    'Ingredients:',
    '- 140 g chicken breast',
    '- 120 g cooked brown rice',
    '- 80 g cucumber',
    '- 50 g avocado',
    'Steps:',
    '1. Cook the chicken.',
    '2. Add rice and vegetables.',
    '3. Review portions before saving.',
  ].join('\\n')
  const lunchRecommendationDraft = buildFoodRecommendationConversationDraft(lunchRecommendation, localDate, foodContext, lunchAiText)
  assert(!lunchRecommendationDraft?.appTarget, 'Live-AI lunch recommendations must stay conversational until the user confirms.')
  assert((lunchRecommendationDraft?.recipe?.importDraft?.ingredients || []).includes('140 g chicken breast'), 'Live-AI recommendation handoff must use the suggested ingredients, not fixed fallback ingredients.')
  assert(/High Protein Chicken Rice Bowl/i.test(lunchRecommendationDraft?.recipe?.importDraft?.title || ''), 'Live-AI recommendation handoff must keep the suggested meal title.')
  assert(/High Protein Chicken Rice Bowl/i.test(lunchRecommendationDraft?.recipe?.text || ''), 'Live-AI recommendation text must stay available for display and spoken reply.')
  const formattedDiaryContext = formatFoodDiarySnapshotForVoiceRecipe(sampleDiarySnapshot)
  assert(/Carbs: 70g used 240g target 170g left/.test(formattedDiaryContext), 'Meal recommendation prompt must include carb context.')
  assert(/Fat: 20g used 70g target 50g left/.test(formattedDiaryContext), 'Meal recommendation prompt must include fat context.')
  assert(/Fibre: 8g used 30g target 22g left/.test(formattedDiaryContext), 'Meal recommendation prompt must include fibre context.')
  assert(/Near or over target: Sugar/.test(formattedDiaryContext), 'Meal recommendation prompt must include near-target macro notes.')

  const macedonianRecommendation = 'Што да јадам за вечера според преостанатите калории и протеини?'
  assert(isFoodRecommendationRequest(macedonianRecommendation, foodContext), 'Macedonian meal advice wording must be treated as a meal recommendation.')
  assert(buildQuickRecipeDraft(macedonianRecommendation, localDate, foodContext) === null, 'Macedonian diary-aware meal recommendations must not become generic quick recipe shortcuts.')

  const macedonianMacroRecommendation = 'Препорачај ми оброк што одговара на моите макроа денес'
  assert(isFoodRecommendationRequest(macedonianMacroRecommendation, dashboardContext), 'Macedonian macro wording must be treated as meal recommendation.')
  assert(buildQuickRecipeDraft(macedonianMacroRecommendation, localDate, dashboardContext) === null, 'Macedonian macro recommendations must stay on the diary-aware recommendation path.')

  const spanishRecommendation = 'Qué debo comer para cenar según las calorías y proteínas restantes?'
  assert(isFoodRecommendationRequest(spanishRecommendation, foodContext), 'Spanish meal advice wording must be treated as a meal recommendation.')
  assert(buildQuickRecipeDraft(spanishRecommendation, localDate, foodContext) === null, 'Spanish diary-aware meal recommendations must not become generic quick recipe shortcuts.')

  const frenchRecommendation = 'Que devrais-je manger au dîner selon mes calories et protéines restantes?'
  assert(isFoodRecommendationRequest(frenchRecommendation, foodContext), 'French meal advice wording must be treated as a meal recommendation.')
  assert(buildQuickRecipeDraft(frenchRecommendation, localDate, foodContext) === null, 'French diary-aware meal recommendations must not become generic quick recipe shortcuts.')

  const germanRecommendation = 'Was soll ich essen nach meinen verbleibenden Kalorien und Proteinen?'
  assert(isFoodRecommendationRequest(germanRecommendation, foodContext), 'German meal advice wording must be treated as a meal recommendation.')
  assert(buildQuickRecipeDraft(germanRecommendation, localDate, foodContext) === null, 'German diary-aware meal recommendations must not become generic quick recipe shortcuts.')

  const italianRecommendation = 'Cosa dovrei mangiare a cena secondo le calorie e proteine restanti?'
  assert(isFoodRecommendationRequest(italianRecommendation, foodContext), 'Italian meal advice wording must be treated as a meal recommendation.')
  assert(buildQuickRecipeDraft(italianRecommendation, localDate, foodContext) === null, 'Italian diary-aware meal recommendations must not become generic quick recipe shortcuts.')

  const portugueseRecommendation = 'O que devo comer no jantar segundo as calorias e proteínas restantes?'
  assert(isFoodRecommendationRequest(portugueseRecommendation, foodContext), 'Portuguese meal advice wording must be treated as a meal recommendation.')
  assert(buildQuickRecipeDraft(portugueseRecommendation, localDate, foodContext) === null, 'Portuguese diary-aware meal recommendations must not become generic quick recipe shortcuts.')

  const macedonianWaterHandoff = inferNativeWebTarget({}, 'Отвори вода')
  assert(macedonianWaterHandoff?.nativeTarget?.route === 'WaterIntake', 'Macedonian open-water wording must open Water Intake.')

  const macedonianJournalHandoff = inferNativeWebTarget({}, 'Отвори здравствен дневник')
  assert(macedonianJournalHandoff?.title === 'Health Journal', 'Macedonian open-health-journal wording must open Health Journal.')

  const macedonianSymptomHandoff = buildQuickToolDraft('Отвори симптоми', localDate)
  assert(macedonianSymptomHandoff?.action === 'app_handoff', 'Macedonian open-symptoms wording must create an app handoff, not a medical advice response.')
  assert(macedonianSymptomHandoff?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'Macedonian open-symptoms wording must open Symptom Notes.')

  const macedonianBillingHandoff = inferNativeWebTarget({}, 'Покажи кредити')
  assert(macedonianBillingHandoff?.nativeTarget?.route === 'Billing', 'Macedonian open-credits wording must open Billing.')

  const macedonianInsightsHandoff = inferNativeWebTarget({}, 'Отвори увиди')
  assert(macedonianInsightsHandoff?.nativeTarget?.tab === 'Insights', 'Macedonian open-insights wording must open Insights.')

  const germanWaterHandoff = inferNativeWebTarget({}, 'Öffne Wasser')
  assert(germanWaterHandoff?.nativeTarget?.route === 'WaterIntake', 'German open-water wording must open Water Intake.')

  const germanSymptomHandoff = buildQuickToolDraft('Öffne Symptome', localDate)
  assert(germanSymptomHandoff?.action === 'app_handoff', 'German open-symptoms wording must create an app handoff, not a medical advice response.')
  assert(germanSymptomHandoff?.appTarget?.nativeTarget?.route === 'SymptomNotes', 'German open-symptoms wording must open Symptom Notes.')

  const germanBillingHandoff = inferNativeWebTarget({}, 'Zeige Guthaben')
  assert(germanBillingHandoff?.nativeTarget?.route === 'Billing', 'German open-credits wording must open Billing.')

  const germanInsightsHandoff = inferNativeWebTarget({}, 'Öffne Einblicke')
  assert(germanInsightsHandoff?.nativeTarget?.tab === 'Insights', 'German open-insights wording must open Insights.')

  const spokenFoodPhoto = buildQuickToolDraft('Take a food photo for lunch', localDate)
  assert(spokenFoodPhoto?.action === 'app_handoff', 'Spoken food photo requests must create an app handoff.')
  assert(spokenFoodPhoto?.appTarget?.nativeTarget?.type === 'foodAction', 'Spoken food photo requests must use a native food action.')
  assert(spokenFoodPhoto?.appTarget?.nativeTarget?.action === 'openPhoto', 'Spoken food photo requests must open the food photo picker.')
  assert(spokenFoodPhoto?.appTarget?.nativeTarget?.meal === 'lunch', 'Spoken food photo requests must keep the meal context.')
  const spanishFoodPhoto = buildQuickToolDraft('Toma una foto de mi almuerzo', localDate)
  assert(spanishFoodPhoto?.appTarget?.nativeTarget?.action === 'openPhoto', 'Spanish food photo requests must open the food photo picker.')
  assert(spanishFoodPhoto?.appTarget?.nativeTarget?.meal === 'lunch', 'Spanish food photo requests must keep the meal context.')
  const macedonianFoodPhoto = buildQuickToolDraft('Направи фото од ручек', localDate)
  assert(macedonianFoodPhoto?.appTarget?.nativeTarget?.action === 'openPhoto', 'Macedonian food photo requests must open the food photo picker.')
  assert(macedonianFoodPhoto?.appTarget?.nativeTarget?.meal === 'lunch', 'Macedonian food photo requests must keep the meal context.')
  const japaneseFoodPhoto = buildQuickToolDraft('昼食の写真を撮って', localDate)
  assert(japaneseFoodPhoto?.appTarget?.nativeTarget?.action === 'openPhoto', 'Japanese food photo requests must open the food photo picker.')
  assert(japaneseFoodPhoto?.appTarget?.nativeTarget?.meal === 'lunch', 'Japanese food photo requests must keep the meal context.')
  const chineseFoodPhoto = buildQuickToolDraft('拍一张我的午餐照片', localDate)
  assert(chineseFoodPhoto?.appTarget?.nativeTarget?.action === 'openPhoto', 'Chinese food photo requests must open the food photo picker.')
  assert(chineseFoodPhoto?.appTarget?.nativeTarget?.meal === 'lunch', 'Chinese food photo requests must keep the meal context.')
  const arabicFoodPhoto = buildQuickToolDraft('التقط صورة لغدائي', localDate)
  assert(arabicFoodPhoto?.appTarget?.nativeTarget?.action === 'openPhoto', 'Arabic food photo requests must open the food photo picker.')
  assert(arabicFoodPhoto?.appTarget?.nativeTarget?.meal === 'lunch', 'Arabic food photo requests must keep the meal context.')
  const hindiFoodPhoto = buildQuickToolDraft('मेरे लंच की फोटो लें', localDate)
  assert(hindiFoodPhoto?.appTarget?.nativeTarget?.action === 'openPhoto', 'Hindi food photo requests must open the food photo picker.')
  assert(hindiFoodPhoto?.appTarget?.nativeTarget?.meal === 'lunch', 'Hindi food photo requests must keep the meal context.')

  const spokenJournalPhoto = buildQuickToolDraft('Add a photo to my health journal', localDate)
  assert(spokenJournalPhoto?.action === 'app_handoff', 'Spoken journal photo requests must create an app handoff.')
  assert(spokenJournalPhoto?.appTarget?.nativeTarget?.route === 'HealthJournal', 'Spoken journal photo requests must target Health Journal.')
  assert(spokenJournalPhoto?.appTarget?.nativeTarget?.action === 'pickPhoto', 'Spoken journal photo requests must open the journal photo picker.')
  const frenchJournalPhoto = buildQuickToolDraft('Ajoute une photo à mon journal de santé', localDate)
  assert(frenchJournalPhoto?.appTarget?.nativeTarget?.route === 'HealthJournal', 'French journal photo requests must target Health Journal.')
  assert(frenchJournalPhoto?.appTarget?.nativeTarget?.action === 'pickPhoto', 'French journal photo requests must open the journal photo picker.')
  const chineseJournalPhoto = buildQuickToolDraft('给我的健康日志添加照片', localDate)
  assert(chineseJournalPhoto?.appTarget?.nativeTarget?.route === 'HealthJournal', 'Chinese journal photo requests must target Health Journal.')
  assert(chineseJournalPhoto?.appTarget?.nativeTarget?.action === 'pickPhoto', 'Chinese journal photo requests must open the journal photo picker.')
  const arabicJournalPhoto = buildQuickToolDraft('أضف صورة إلى يومياتي الصحية', localDate)
  assert(arabicJournalPhoto?.appTarget?.nativeTarget?.route === 'HealthJournal', 'Arabic journal photo requests must target Health Journal.')
  assert(arabicJournalPhoto?.appTarget?.nativeTarget?.action === 'pickPhoto', 'Arabic journal photo requests must open the journal photo picker.')
  const hindiJournalPhoto = buildQuickToolDraft('मेरी स्वास्थ्य डायरी में फोटो जोड़ें', localDate)
  assert(hindiJournalPhoto?.appTarget?.nativeTarget?.route === 'HealthJournal', 'Hindi journal photo requests must target Health Journal.')
  assert(hindiJournalPhoto?.appTarget?.nativeTarget?.action === 'pickPhoto', 'Hindi journal photo requests must open the journal photo picker.')

  const spokenHealthImageNote = buildQuickToolDraft('Open health image notes', localDate)
  assert(spokenHealthImageNote?.action === 'app_handoff', 'Spoken health image note requests must create an app handoff.')
  assert(spokenHealthImageNote?.appTarget?.nativeTarget?.route === 'HealthImageNotes', 'Spoken health image note requests must target Health Image Notes.')
  assert(spokenHealthImageNote?.appTarget?.nativeTarget?.action === 'pickImage', 'Spoken health image note requests must open the health image picker.')
  assert(/not diagnose or suggest treatment/i.test(spokenHealthImageNote?.confirmationMessage || ''), 'Spoken health image note handoffs must clearly say they are not diagnosis or treatment.')
  const germanHealthImageNote = buildQuickToolDraft('Öffne Gesundheitsbild Notizen', localDate)
  assert(germanHealthImageNote?.appTarget?.nativeTarget?.route === 'HealthImageNotes', 'German health image note requests must target Health Image Notes.')
  assert(germanHealthImageNote?.appTarget?.nativeTarget?.action === 'pickImage', 'German health image note requests must open the health image picker.')
  assert(/history only/i.test(germanHealthImageNote?.confirmationMessage || ''), 'Multilingual health image note handoffs must keep safe history-only wording.')
  const chineseHealthImageNote = buildQuickToolDraft('打开健康照片记录', localDate)
  assert(chineseHealthImageNote?.appTarget?.nativeTarget?.route === 'HealthImageNotes', 'Chinese health image note requests must target Health Image Notes.')
  assert(chineseHealthImageNote?.appTarget?.nativeTarget?.action === 'pickImage', 'Chinese health image note requests must open the health image picker.')
  assert(/not diagnose or suggest treatment/i.test(chineseHealthImageNote?.confirmationMessage || ''), 'Chinese health image note handoffs must keep safe no-diagnosis wording.')
  const arabicHealthImageNote = buildQuickToolDraft('افتح ملاحظات الصور الصحية', localDate)
  assert(arabicHealthImageNote?.appTarget?.nativeTarget?.route === 'HealthImageNotes', 'Arabic health image note requests must target Health Image Notes.')
  assert(arabicHealthImageNote?.appTarget?.nativeTarget?.action === 'pickImage', 'Arabic health image note requests must open the health image picker.')
  assert(/not diagnose or suggest treatment/i.test(arabicHealthImageNote?.confirmationMessage || ''), 'Arabic health image note handoffs must keep safe no-diagnosis wording.')
	  const hindiHealthImageNote = buildQuickToolDraft('स्वास्थ्य फोटो नोट खोलें', localDate)
	  assert(hindiHealthImageNote?.appTarget?.nativeTarget?.route === 'HealthImageNotes', 'Hindi health image note requests must target Health Image Notes.')
	  assert(hindiHealthImageNote?.appTarget?.nativeTarget?.action === 'pickImage', 'Hindi health image note requests must open the health image picker.')
	  assert(/not diagnose or suggest treatment/i.test(hindiHealthImageNote?.confirmationMessage || ''), 'Hindi health image note handoffs must keep safe no-diagnosis wording.')

	  const spokenSupplementBottle = buildQuickToolDraft('Scan my supplement bottle label', localDate, healthIntakeContext)
	  assert(spokenSupplementBottle?.action === 'app_handoff', 'Spoken supplement bottle requests must create an app handoff.')
	  assert(spokenSupplementBottle?.appTarget?.nativeTarget?.type === 'voiceAction', 'Spoken supplement bottle requests must use a native voice action.')
	  assert(spokenSupplementBottle?.appTarget?.nativeTarget?.action === 'openHealthIntakeLiveCamera', 'Spoken supplement bottle requests must open Health Intake live camera mode.')
	  assert(spokenSupplementBottle?.appTarget?.nativeTarget?.itemType === 'supplement', 'Spoken supplement bottle requests must keep supplement type.')
	  assert(spokenSupplementBottle?.autoSave === false, 'Spoken supplement bottle requests must not auto-save.')
	  assert(/review it before anything is saved/i.test(spokenSupplementBottle?.confirmationMessage || ''), 'Spoken supplement bottle handoffs must stay review-first.')
	  assert(/not recommending changes/i.test(spokenSupplementBottle?.confirmationMessage || ''), 'Spoken supplement bottle handoffs must not sound like treatment advice.')

	  const spokenMedicationBottle = buildQuickToolDraft('Read my medication bottle label', localDate, healthIntakeContext)
	  assert(spokenMedicationBottle?.appTarget?.nativeTarget?.action === 'openHealthIntakeLiveCamera', 'Spoken medication bottle requests must open Health Intake live camera mode.')
	  assert(spokenMedicationBottle?.appTarget?.nativeTarget?.itemType === 'medication', 'Spoken medication bottle requests must keep medication type.')
	  assert(spokenMedicationBottle?.autoSave === false, 'Spoken medication bottle requests must not auto-save.')

	  const ambiguousBottle = buildQuickToolDraft('Scan this bottle label', localDate, healthIntakeContext)
	  assert(ambiguousBottle?.action === 'app_handoff', 'Ambiguous Health Intake bottle requests must create a safe handoff.')
	  assert(ambiguousBottle?.appTarget?.nativeTarget?.action === 'openHealthIntakeBottleChoices', 'Ambiguous Health Intake bottle requests must ask the user to choose supplement or medication first.')
	  assert(ambiguousBottle?.autoSave === false, 'Ambiguous Health Intake bottle requests must not auto-save.')

	  const unsafeHealthPhotoReview = buildQuickToolDraft('Check this rash photo for me', localDate)
	  assert(unsafeHealthPhotoReview?.action === 'health_question', 'Health photo review requests must stay in the safer health-question path.')

  const genericRecipe = buildQuickRecipeDraft('suggest a quick dinner recipe', localDate, dashboardContext)
  assert(genericRecipe?.action === 'recipe', 'Generic recipe requests should still open a normal Build a meal recipe draft.')
  assert(genericRecipe?.appTarget?.nativeTarget?.action === 'openBuildMeal', 'Recipe handoffs must open the native Build a meal tool.')
  assert(genericRecipe?.appTarget?.nativeTarget?.recipeDraft?.ingredients?.length > 0, 'Recipe handoffs must carry ingredients into the native Build a meal tool.')

  return failures
}

globalThis.__nativeVoiceCommandBehaviorPromise = __runNativeVoiceCommandBehaviorAssertions()
`

const compiled = ts.transpileModule(`${source}\n${appended}`, {
  compilerOptions: {
    module: ts.ModuleKind.None,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText

const sandbox = {
  console,
  URLSearchParams,
  URL,
  Date,
  Math,
  Number,
  String,
  Boolean,
  RegExp,
  Array,
  Object,
  JSON,
  Set,
  Map,
  encodeURIComponent,
  decodeURIComponent,
  Buffer,
  createNativeVoicePromptHandoff: async () => ({ token: 'test-private-token' }),
  __routeSource: source,
  __realtimeRouteSource: realtimeSource,
  __nativeSourcesAvailable: Boolean(voiceAssistantSource && realtimeClientSource),
  __realtimeClientSource: realtimeClientSource,
  __voiceAssistantSource: voiceAssistantSource,
  prisma: {
    foodLibraryItem: {
      findMany: async () => [],
    },
  },
  searchCustomFoodMacros: async () => [],
  buildFoodDiarySnapshot: async () => ({
    localDate: '2026-07-02',
    tzOffsetMin: 0,
    totals: { calories: 600, protein_g: 35, carbs_g: 70, fat_g: 20, fiber_g: 8, sugar_g: 12 },
    targets: { calories: 2200, protein_g: 150, carbs_g: 240, fat_g: 70, fiber_g: 30, sugar_g: 35 },
    remaining: {
      calories: { remaining: 1600, remainingClamped: 1600, overBy: 0 },
      protein_g: { remaining: 115, remainingClamped: 115, overBy: 0 },
      carbs_g: { remaining: 170, remainingClamped: 170, overBy: 0 },
      fat_g: { remaining: 50, remainingClamped: 50, overBy: 0 },
      fiber_g: { remaining: 22, remainingClamped: 22, overBy: 0 },
      sugar_g: { remaining: 23, remainingClamped: 23, overBy: 0 },
    },
    priority: { low: ['Protein', 'Fibre'], nearCap: ['Sugar'] },
    logCount: 2,
  }),
  searchLocalFoods: async (query) => {
    const normalized = String(query || '').toLowerCase()
    const rows = []
    if (normalized.includes('apple') || normalized.includes('pear')) {
      rows.push({
        source: 'usda',
        id: 'test-apple',
        name: 'Apple raw',
        brand: null,
        serving_size: '100 g',
        calories: 52,
        protein_g: 0.3,
        carbs_g: 13.8,
        fat_g: 0.2,
        fiber_g: 2.4,
        sugar_g: 10.4,
      })
    }
    if (normalized.includes('peanut')) {
      rows.push({
        source: 'usda',
        id: 'test-peanuts',
        name: 'Peanuts raw',
        brand: null,
        serving_size: '100 g',
        calories: 567,
        protein_g: 25.8,
        carbs_g: 16.1,
        fat_g: 49.2,
        fiber_g: 8.5,
        sugar_g: 4.7,
      })
    }
    if (normalized.includes('banana')) {
      rows.push({
        source: 'usda',
        id: 'test-banana',
        name: 'Banana raw',
        brand: null,
        serving_size: '100 g',
        calories: 89,
        protein_g: 1.1,
        carbs_g: 22.8,
        fat_g: 0.3,
        fiber_g: 2.6,
        sugar_g: 12.2,
      })
    }
    return rows
  },
  process: { env: { ...process.env, OPENAI_API_KEY: '' } },
  globalThis: {},
}

try {
  vm.runInNewContext(compiled, sandbox, { filename: 'native-voice-command-behavior.vm.js', timeout: 5000 })
} catch (error) {
  console.error('Native voice command behavior check could not run:')
  console.error(error)
  process.exit(1)
}

Promise.resolve(sandbox.globalThis.__nativeVoiceCommandBehaviorPromise)
  .then((failures) => {
    if (failures.length) {
      console.error('\\nNative voice command behavior check failed:\\n')
      for (const failure of failures) console.error(`- ${failure}`)
      process.exit(1)
    }
    console.log('Native voice command behavior check passed.')
  })
  .catch((error) => {
    console.error('Native voice command behavior check failed unexpectedly:')
    console.error(error)
    process.exit(1)
  })
