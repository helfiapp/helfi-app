import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import OpenAI from 'openai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runChatCompletionWithLogging } from '@/lib/ai-usage-logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type ImportedRecipe = {
  title: string
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  ingredients: string[]
  steps: string[]
  sourceUrl: string | null
}

const clampText = (value: string, maxChars: number) => {
  const v = String(value || '')
  if (v.length <= maxChars) return v
  return v.slice(0, maxChars)
}

const normalizeLines = (value: any) => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
}

const toIngredientDedupeKey = (value: string) => {
  return String(value || '')
    .toLowerCase()
    .replace(/^[\s•*\-–—]+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const dedupeIngredientLines = (lines: string[]) => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of lines) {
    const line = String(raw || '').trim()
    if (!line) continue
    const key = toIngredientDedupeKey(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  return out
}

const parseNumberOrNull = (value: any) => {
  const n = typeof value === 'number' ? value : Number(String(value || '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

const stripHtmlToText = (html: string) => {
  try {
    const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    const noTags = noStyles.replace(/<[^>]+>/g, ' ')
    return noTags.replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

const extractJsonLdBlocks = (html: string) => {
  const blocks: string[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null = null
  while ((m = re.exec(html))) {
    const raw = String(m[1] || '').trim()
    if (raw) blocks.push(raw)
  }
  return blocks
}

const safeJsonParse = (raw: string): any | null => {
  try {
    return JSON.parse(raw)
  } catch {
    try {
      const cleaned = String(raw || '')
        .trim()
        .replace(/^\uFEFF/, '')
        .replace(/<!--|-->/g, '')
      return JSON.parse(cleaned)
    } catch {
      return null
    }
  }
}

const flattenJsonLdCandidates = (value: any): any[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap((v) => flattenJsonLdCandidates(v))
  if (typeof value !== 'object') return []
  const graph = (value as any)['@graph']
  if (Array.isArray(graph)) return [value, ...graph.flatMap((v) => flattenJsonLdCandidates(v))]
  return [value]
}

const looksLikeRecipeType = (obj: any) => {
  const t = (obj as any)?.['@type']
  if (typeof t === 'string') return t.toLowerCase() === 'recipe'
  if (Array.isArray(t)) return t.map((x) => String(x || '').toLowerCase()).includes('recipe')
  return false
}

const normalizeInstructions = (raw: any): string[] => {
  if (!raw) return []
  if (typeof raw === 'string') {
    return raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (Array.isArray(raw)) {
    const out: string[] = []
    for (const step of raw) {
      if (typeof step === 'string') {
        const t = step.trim()
        if (t) out.push(t)
      } else if (step && typeof step === 'object') {
        const text = String((step as any).text || (step as any).name || '').trim()
        if (text) out.push(text)
      }
    }
    return out
  }
  if (raw && typeof raw === 'object') {
    const text = String((raw as any).text || '').trim()
    return text ? [text] : []
  }
  return []
}

const parseRecipeFromJsonLd = (obj: any, sourceUrl: string): ImportedRecipe | null => {
  if (!obj || typeof obj !== 'object') return null
  if (!looksLikeRecipeType(obj)) return null

  const title = String((obj as any).name || (obj as any).headline || 'Recipe').trim() || 'Recipe'
  const ingredients = dedupeIngredientLines(normalizeLines((obj as any).recipeIngredient))
  const steps = normalizeInstructions((obj as any).recipeInstructions)

  const yieldRaw = (obj as any).recipeYield
  const yieldStr = Array.isArray(yieldRaw) ? String(yieldRaw[0] || '').trim() : String(yieldRaw || '').trim()
  const servings = (() => {
    const m = yieldStr.match(/(\d+(?:\.\d+)?)/)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const prepMinutes = (() => {
    const raw = (obj as any).prepTime
    const s = String(raw || '').trim()
    const m = s.match(/PT(\d+)M/i)
    return m ? parseNumberOrNull(m[1]) : null
  })()
  const cookMinutes = (() => {
    const raw = (obj as any).cookTime
    const s = String(raw || '').trim()
    const m = s.match(/PT(\d+)M/i)
    return m ? parseNumberOrNull(m[1]) : null
  })()

  if (!ingredients.length) return null
  return { title, servings, prepMinutes, cookMinutes, ingredients, steps, sourceUrl }
}

const RECIPE_IMPORT_BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const

type FetchedRecipePage = {
  html: string | null
  finalUrl: string | null
  recipe: ImportedRecipe | null
  fallbackText: string | null
  debug: string[]
}

const fetchRecipeTextViaMirror = async (url: string): Promise<{ text: string | null; debug: string[] }> => {
  const debug: string[] = []
  try {
    const normalized = String(url || '').trim().replace(/^https?:\/\//i, '')
    if (!normalized) return { text: null, debug: ['mirror:empty-url'] }
    const mirrorUrl = `https://r.jina.ai/http://${normalized}`
    const res = await fetch(mirrorUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': RECIPE_IMPORT_BROWSER_HEADERS['user-agent'],
        accept: 'text/plain,text/markdown;q=0.9,*/*;q=0.8',
      },
    })
    debug.push(`mirror-status:${res.status}`)
    if (!res.ok) return { text: null, debug }
    const text = clampText(await res.text(), 1_200_000).trim()
    debug.push(`mirror-text-len:${text.length}`)
    if (!text) return { text: null, debug }
    return { text, debug }
  } catch {
    return { text: null, debug: ['mirror-error'] }
  }
}

const fetchRecipePage = async (url: string): Promise<FetchedRecipePage> => {
  const debug: string[] = []
  const attempts: string[] = []
  const seen = new Set<string>()
  const pushAttempt = (candidate: string | null) => {
    const c = String(candidate || '').trim()
    if (!c || seen.has(c)) return
    seen.add(c)
    attempts.push(c)
  }

  pushAttempt(url)
  try {
    const u = new URL(url)
    if (u.search || u.hash) {
      u.search = ''
      u.hash = ''
      pushAttempt(u.toString())
    }
  } catch {}

  let bestHtml: string | null = null
  let bestFinalUrl: string | null = null

  for (const attemptUrl of attempts) {
    try {
      const res = await fetch(attemptUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: RECIPE_IMPORT_BROWSER_HEADERS,
      })
      debug.push(`direct:${attemptUrl}:status:${res.status}`)
      if (!res.ok) continue

      const finalUrl = String(res.url || attemptUrl).trim() || attemptUrl
      debug.push(`direct-final:${finalUrl}`)
      const html = clampText(await res.text(), 2_000_000)
      debug.push(`direct-html-len:${html.length}`)
      if (html && (!bestHtml || html.length > bestHtml.length)) {
        bestHtml = html
        bestFinalUrl = finalUrl
      }

      const blocks = extractJsonLdBlocks(html)
      for (const block of blocks) {
        const parsed = safeJsonParse(block)
        const candidates = flattenJsonLdCandidates(parsed)
        for (const c of candidates) {
          const found = parseRecipeFromJsonLd(c, finalUrl)
          if (found) return { html, finalUrl, recipe: found, fallbackText: null, debug }
        }
      }
    } catch (err: any) {
      debug.push(`direct:${attemptUrl}:error:${String(err?.message || err || 'unknown')}`)
    }
  }

  const mirror = await fetchRecipeTextViaMirror(url)
  const fallbackText = mirror.text
  debug.push(...mirror.debug)
  debug.push(`mirror-len:${fallbackText ? fallbackText.length : 0}`)
  return { html: bestHtml, finalUrl: bestFinalUrl, recipe: null, fallbackText, debug }
}

const getOpenAIClient = () => {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  return new OpenAI({ apiKey: key })
}

const coerceRecipeFromModel = (value: any, sourceUrl: string | null): ImportedRecipe | null => {
  if (!value || typeof value !== 'object') return null
  const title = String((value as any).title || (value as any).name || 'Recipe').trim() || 'Recipe'
  const ingredients = dedupeIngredientLines(
    normalizeLines((value as any).ingredients || (value as any).recipeIngredient || (value as any).recipeIngredients),
  )
  const steps = normalizeLines((value as any).steps || (value as any).instructions || (value as any).recipeInstructions)
  const servings = parseNumberOrNull((value as any).servings || (value as any).yield)
  const prepMinutes = parseNumberOrNull((value as any).prepMinutes)
  const cookMinutes = parseNumberOrNull((value as any).cookMinutes)
  if (!ingredients.length) return null
  return { title, servings, prepMinutes, cookMinutes, ingredients, steps, sourceUrl }
}

const extractRecipeFromText = async ({
  openai,
  text,
  sourceUrl,
  userId,
  userEmail,
  callDetail,
}: {
  openai: OpenAI
  text: string
  sourceUrl: string | null
  userId: string
  userEmail: string
  callDetail: string
}): Promise<ImportedRecipe | null> => {
  const completion = await runChatCompletionWithLogging(
    openai,
    {
      model: process.env.OPENAI_RECIPE_IMPORT_MODEL || 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 900,
      response_format: { type: 'json_object' } as any,
      messages: [
        {
          role: 'system',
          content:
            'Extract ONE recipe from the given page text.\n' +
            'Return JSON only with keys: title, servings, prepMinutes, cookMinutes, ingredients (array of strings), steps (array of strings).\n' +
            'Ingredients must include amounts/units when present.\n' +
            'Steps should be short and actionable.',
        },
        { role: 'user', content: text },
      ],
    } as any,
    { feature: 'recipe-import', userId, userLabel: userEmail, endpoint: '/api/recipe-import' },
    { callDetail },
  )

  const raw = completion?.choices?.[0]?.message?.content || ''
  const parsed = safeJsonParse(String(raw || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim())
  return coerceRecipeFromModel(parsed, sourceUrl)
}

export async function POST(request: NextRequest) {
  try {
    // Auth (session, with JWT fallback)
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) userEmail = String(token.email)
      } catch {}
    }
    if (!userEmail) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const contentType = String(request.headers.get('content-type') || '').toLowerCase()

    // URL import
    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({} as any))
      const url = String(body?.url || '').trim()
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
      }

      const rawTextFromClient = clampText(String(body?.rawText || ''), 60_000).trim()
      if (rawTextFromClient) {
        const openai = getOpenAIClient()
        if (!openai) return NextResponse.json({ error: 'Recipe import is temporarily unavailable.' }, { status: 503 })

        const recipeFromClientText = await extractRecipeFromText({
          openai,
          text: clampText(rawTextFromClient, 22_000),
          sourceUrl: url,
          userId: user.id,
          userEmail,
          callDetail: 'url-client-mirror-text',
        })
        if (!recipeFromClientText) {
          return NextResponse.json({ error: 'Could not import that recipe. Try a photo instead.' }, { status: 422 })
        }
        return NextResponse.json({ recipe: recipeFromClientText }, { status: 200 })
      }

      const fetchedPage = await fetchRecipePage(url)
      if (fetchedPage.recipe) return NextResponse.json({ recipe: fetchedPage.recipe }, { status: 200 })

      const openai = getOpenAIClient()
      if (!openai) return NextResponse.json({ error: 'Recipe import is temporarily unavailable.' }, { status: 503 })

      const html = clampText(String(fetchedPage.html || ''), 1_200_000)
      const htmlText = html ? clampText(stripHtmlToText(html), 22_000) : ''
      const mirrorText = clampText(String(fetchedPage.fallbackText || ''), 22_000)
      const text = (mirrorText.length > htmlText.length ? mirrorText : htmlText).trim()
      if (!text) {
        console.warn('recipe-import:url-load-empty', {
          url,
          finalUrl: fetchedPage.finalUrl,
          htmlLength: html.length,
          htmlTextLength: htmlText.length,
          mirrorTextLength: mirrorText.length,
          debug: fetchedPage.debug,
        })
        return NextResponse.json({ error: 'Could not load that link.' }, { status: 400 })
      }

      const recipe = await extractRecipeFromText({
        openai,
        text,
        sourceUrl: fetchedPage.finalUrl || url,
        userId: user.id,
        userEmail,
        callDetail: 'url-fallback-text',
      })
      if (!recipe) return NextResponse.json({ error: 'Could not import that recipe. Try a photo instead.' }, { status: 422 })
      return NextResponse.json({ recipe }, { status: 200 })
    }

    // Photo import
    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData()
      const all = fd.getAll('images')
      const files = all.filter((v) => v && typeof (v as any).arrayBuffer === 'function') as File[]
      if (!files.length) return NextResponse.json({ error: 'No images received' }, { status: 400 })
      if (files.length > 6) return NextResponse.json({ error: 'Please upload 6 photos or fewer.' }, { status: 400 })

      const openai = getOpenAIClient()
      if (!openai) return NextResponse.json({ error: 'Recipe import is temporarily unavailable.' }, { status: 503 })

      const images: Array<{ type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' } }> = []
      let firstImageMeta: { width: number | null; height: number | null; bytes: number | null; mime: string | null } | null = null

      for (const f of files) {
        const ab = await f.arrayBuffer()
        const bytes = Buffer.from(ab)
        const mime = String((f as any).type || 'image/jpeg')
        const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
        images.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'high' } })
        if (!firstImageMeta) firstImageMeta = { width: null, height: null, bytes: bytes.length, mime }
      }

      const completion = await runChatCompletionWithLogging(
        openai,
        {
          model: process.env.OPENAI_RECIPE_IMPORT_VISION_MODEL || 'gpt-4o-mini',
          temperature: 0,
          max_tokens: 1200,
          response_format: { type: 'json_object' } as any,
          messages: [
            {
              role: 'system',
              content:
                'You are reading one recipe from photo(s) of a cookbook or printed page.\n' +
                'Return JSON only with keys: title, servings, prepMinutes, cookMinutes, ingredients (array of strings), steps (array of strings).\n' +
                'Be careful with fractions (1/2, 1 1/2) and units.\n' +
                'Ingredients must be one per line in the array.\n' +
                'Steps must be short, in order, and one per line in the array.\n' +
                'If a field is missing, use null (for numbers) or [] (for arrays).',
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Extract the recipe from these photo(s).' }, ...images] as any,
            },
          ],
        } as any,
        { feature: 'recipe-import', userId: user.id, userLabel: userEmail, endpoint: '/api/recipe-import' },
        { callDetail: 'photo', image: firstImageMeta || undefined },
      )

      const raw = completion?.choices?.[0]?.message?.content || ''
      const parsed = safeJsonParse(String(raw || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim())
      const recipe = coerceRecipeFromModel(parsed, null)
      if (!recipe) return NextResponse.json({ error: 'Could not read a recipe from that photo. Try a clearer photo.' }, { status: 422 })
      return NextResponse.json({ recipe }, { status: 200 })
    }

    return NextResponse.json({ error: 'Unsupported request type' }, { status: 415 })
  } catch (err) {
    console.error('POST /api/recipe-import error', err)
    return NextResponse.json({ error: 'Recipe import failed.' }, { status: 500 })
  }
}
