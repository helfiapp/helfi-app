import { NextRequest } from 'next/server'
import { hasAiSharingConsent, getAiConsentRequestUserId } from '@/lib/ai-consent'
import { validatePublicRecipeUrl } from '@/lib/public-recipe-url'
import { RECIPE_IMPORT_URL_CREDITS } from '@/lib/recipe-import-pricing'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'

export type RecipeUrlImportOptions = { localDate: string; meal?: string; destination?: 'diary' | 'library' }
export type VoiceRecipeUrlImportIo = {
  userId: (request: NextRequest) => Promise<string | null>
  consent: (userId: string) => Promise<boolean>
  validateUrl: (url: string) => Promise<any>
  importRecipe: (request: NextRequest, url: string) => Promise<{ recipe: any; costCredits: number }>
}
const defaultIo: VoiceRecipeUrlImportIo = {
  userId: getAiConsentRequestUserId,
  consent: hasAiSharingConsent,
  validateUrl: validatePublicRecipeUrl,
  importRecipe: async(original,url)=>{
    const headers = new Headers(original.headers);headers.set('content-type','application/json')
    // No model/client rawText, arbitrary endpoint, credential copy or direct AI call.
    const request = new NextRequest(new URL('/api/recipe-import',original.url),{method:'POST',headers,body:JSON.stringify({url})})
    const response = await (await import('@/app/api/recipe-import/route')).POST(request)
    const data = await response.json()
    if (!response.ok || !data?.recipe) throw new Error(data?.error || data?.message || 'The recipe could not be imported.')
    return data
  },
}
function exactUrlFromRequest(transcript: string) {
  const matches = transcript.match(/https?:\/\/[^\s<>"']+/gi) || []
  if (matches.length !== 1) throw new Error('Please give exactly one complete recipe link to import.')
  return matches[0].replace(/[.,!;]+$/,'')
}
export async function prepareVoiceRecipeUrlImport(request: NextRequest, userId: string, transcript: string, options: RecipeUrlImportOptions, io: VoiceRecipeUrlImportIo = defaultIo) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key=>!['localDate','meal','destination'].includes(key))) throw new Error('Please use the reviewed recipe import options.')
  if (await io.userId(request) !== userId || !await io.consent(userId)) throw new Error('Please allow AI help and sign in before importing a recipe.')
  const url = exactUrlFromRequest(transcript)
  await io.validateUrl(url)
  const date = new Date(`${options.localDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.localDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==options.localDate) throw new Error('Please choose a valid recipe date.')
  if (options.destination !== undefined && !['diary','library'].includes(options.destination)) throw new Error('Please choose where to use this recipe.')
  if (options.meal !== undefined && !['breakfast','lunch','dinner','snacks','uncategorized'].includes(options.meal)) throw new Error('Please choose a meal for this recipe.')
  const draft: any = { action:'recipe_import_url',transcript,localDate:options.localDate,summary:`Import recipe from ${new URL(url).hostname}`,confirmationMessage:`Import this recipe link for ${RECIPE_IMPORT_URL_CREDITS} credits? I will show the imported recipe for review before saving any food.`,canConfirm:true,autoSave:false,reviewIssuedAt:Date.now(),
    recipeImport:{...options,userId,url,costCredits:RECIPE_IMPORT_URL_CREDITS} }
  draft.reviewToken = signNativeVoiceDraft(userId,draft)
  return draft
}
/** Must run INSIDE the existing confirmation receipt lock. The receipt stores
 * this result before replay; a process interruption must not retry/charge again.
 * This adapter imports only. It never saves a FoodLog or a library record.
 */
export async function executeVoiceRecipeUrlImport(request: NextRequest, userId: string, draft: any, context: { receiptClaimed: true; actionId: string }, io: VoiceRecipeUrlImportIo = defaultIo) {
  if (!context?.receiptClaimed || !context.actionId || draft?.action !== 'recipe_import_url' || !verifyNativeVoiceDraft(userId,draft) || draft.recipeImport?.userId !== userId || draft.recipeImport.costCredits !== RECIPE_IMPORT_URL_CREDITS || exactUrlFromRequest(draft.transcript) !== draft.recipeImport.url) throw new Error('Please review this exact recipe import again.')
  if (await io.userId(request) !== userId || !await io.consent(userId)) throw new Error('AI permission or the signed-in account changed. Please review again.')
  await io.validateUrl(draft.recipeImport.url)
  const imported = await io.importRecipe(request,draft.recipeImport.url)
  if (imported.costCredits !== RECIPE_IMPORT_URL_CREDITS || !imported.recipe || !Array.isArray(imported.recipe.ingredients) || !imported.recipe.ingredients.length) throw new Error('The importer did not confirm the complete recipe import result. Please check before retrying.')
  const recipe = imported.recipe
  // The next normal recipe resolver requires an actual yield, steps and measured
  // ingredients; missing imported details must be clarified, never defaulted.
  const nextRecipeDraft = {action:'recipe',transcript:draft.transcript,localDate:draft.localDate,summary:recipe.title || 'Imported recipe',confirmationMessage:'The recipe was imported. Please review its ingredients, yield and steps before saving it.',canConfirm:false,autoSave:false,recipe:{text:[recipe.title,...recipe.ingredients].join('\n'),importDraft:recipe},recipeImportDestination:draft.recipeImport.destination,recipeImportMeal:draft.recipeImport.meal}
  return {kind:'recipe_import',status:'imported_not_saved',saved:false,actionId:context.actionId,costCredits:imported.costCredits,message:'Recipe imported for review. No food diary entry or saved recipe has been created.',nextRecipeDraft}
}
