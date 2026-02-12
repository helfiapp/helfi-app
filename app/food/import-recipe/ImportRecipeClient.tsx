'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type ImportedRecipe = {
  title: string
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  ingredients: string[]
  steps: string[]
  sourceUrl: string | null
}

type RecipeImportDraft = ImportedRecipe & {
  saveRecipe: boolean
  createdAt: number
}

const isValidHttpUrl = (value: string) => {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const toCleanLines = (raw: string) =>
  String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export default function ImportRecipeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedDate = searchParams.get('date') || ''
  const category = searchParams.get('category') || ''

  const [mode, setMode] = useState<'url' | 'photo'>('url')
  const [urlInput, setUrlInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<ImportedRecipe | null>(null)

  const ingredientsText = useMemo(() => (recipe ? recipe.ingredients.join('\n') : ''), [recipe])
  const stepsText = useMemo(() => (recipe ? recipe.steps.join('\n') : ''), [recipe])

  const titleRef = useRef<HTMLInputElement | null>(null)
  const servingsRef = useRef<HTMLInputElement | null>(null)
  const ingredientsRef = useRef<HTMLTextAreaElement | null>(null)
  const stepsRef = useRef<HTMLTextAreaElement | null>(null)

  const tryBrowserMirrorFallback = async (url: string): Promise<ImportedRecipe | null> => {
    try {
      const mirrorRes = await fetch(`https://r.jina.ai/http://${url}`, { method: 'GET' })
      if (!mirrorRes.ok) return null
      const mirrorText = String(await mirrorRes.text()).trim()
      if (!mirrorText) return null

      const parseRes = await fetch('/api/recipe-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, rawText: mirrorText }),
      })
      const parseData = await parseRes.json().catch(() => ({} as any))
      if (!parseRes.ok || !parseData?.recipe) return null
      return parseData.recipe as ImportedRecipe
    } catch {
      return null
    }
  }

  const doImportFromUrl = async () => {
    const url = urlInput.trim()
    if (!isValidHttpUrl(url)) {
      setError('Please paste a valid recipe link (it must start with http:// or https://).')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/recipe-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.recipe) {
        if (String(data?.error || '').toLowerCase().includes('could not load that link')) {
          const fallbackRecipe = await tryBrowserMirrorFallback(url)
          if (fallbackRecipe) {
            setRecipe(fallbackRecipe)
            return
          }
        }
        setError(data?.error || 'Import failed. Please try a different link or use a photo.')
        return
      }
      setRecipe(data.recipe as ImportedRecipe)
    } catch {
      setError('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const doImportFromPhoto = async () => {
    if (!files.length) {
      setError('Please add at least 1 photo.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('images', f)
      const res = await fetch('/api/recipe-import', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.recipe) {
        setError(data?.error || 'Import failed. Please try again with a clearer photo.')
        return
      }
      setRecipe(data.recipe as ImportedRecipe)
    } catch {
      setError('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const continueToBuilder = () => {
    const current = recipe
    if (!current) return

    const title = titleRef.current?.value?.trim() || current.title || 'Recipe'
    const servingsRaw = (servingsRef.current?.value || '').trim()
    const servingsNum = servingsRaw ? Number(servingsRaw) : NaN
    const servings = Number.isFinite(servingsNum) && servingsNum > 0 ? servingsNum : null

    const ingredients = toCleanLines(ingredientsRef.current?.value || ingredientsText)
    const steps = toCleanLines(stepsRef.current?.value || stepsText)

    const draft: RecipeImportDraft = {
      title,
      servings,
      prepMinutes: current.prepMinutes ?? null,
      cookMinutes: current.cookMinutes ?? null,
      ingredients,
      steps,
      sourceUrl: current.sourceUrl ?? null,
      saveRecipe: false,
      createdAt: Date.now(),
    }

    try {
      sessionStorage.setItem('food:recipeImportDraft', JSON.stringify(draft))
    } catch {}

    const qs = new URLSearchParams()
    if (selectedDate) qs.set('date', selectedDate)
    if (category) qs.set('category', category)
    qs.set('recipeImport', '1')
    qs.set('t', String(Date.now()))
    router.push(`/food/build-meal?${qs.toString()}`)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/food')}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <span aria-hidden>←</span>
          </button>
          <div className="text-lg font-semibold text-gray-900">Import recipe</div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`px-3 py-2 text-sm font-semibold rounded-xl border ${
              mode === 'url'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
            aria-pressed={mode === 'url'}
          >
            Import by URL
          </button>
          <button
            type="button"
            onClick={() => setMode('photo')}
            className={`px-3 py-2 text-sm font-semibold rounded-xl border ${
              mode === 'photo'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
            aria-pressed={mode === 'photo'}
          >
            Import by photo
          </button>
        </div>

        {!recipe && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
            {mode === 'url' ? (
              <>
                <div className="text-sm font-semibold text-gray-900">Recipe link</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Paste a recipe URL"
                    className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={doImportFromUrl}
                    disabled={loading}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      loading ? 'bg-gray-200 text-gray-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {loading ? 'Importing…' : 'Import'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500">Tip: if a site blocks imports, use the photo option instead.</div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-gray-900">Recipe photos</div>
                <div className="mt-2 text-xs text-gray-500">You can add multiple photos (useful if the recipe is on 2 pages).</div>
                <div className="mt-3">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    onChange={(e) => {
                      const list = Array.from(e.target.files || [])
                      setFiles(list)
                    }}
                  />
                </div>
                {files.length > 0 && <div className="mt-2 text-xs text-gray-600">{files.length} photo(s) selected</div>}
                <button
                  type="button"
                  onClick={doImportFromPhoto}
                  disabled={loading}
                  className={`mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold ${
                    loading ? 'bg-gray-200 text-gray-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {loading ? 'Importing…' : 'Import from photo'}
                </button>
              </>
            )}

            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          </div>
        )}

        {recipe && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">Review (you can edit)</div>

              <div className="mt-3 grid gap-3">
                <label className="text-sm text-gray-700">
                  Title
                  <input
                    ref={titleRef}
                    defaultValue={recipe.title}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm text-gray-700">
                  Servings (optional)
                  <input
                    ref={servingsRef}
                    defaultValue={recipe.servings ?? ''}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Example: 4"
                  />
                </label>

                <label className="text-sm text-gray-700">
                  Ingredients (one per line)
                  <textarea
                    ref={ingredientsRef}
                    defaultValue={ingredientsText}
                    className="mt-1 w-full min-h-[160px] rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm text-gray-700">
                  Instructions (one step per line)
                  <textarea
                    ref={stepsRef}
                    defaultValue={stepsText}
                    className="mt-1 w-full min-h-[160px] rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={continueToBuilder}
                className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Continue to Build a meal
              </button>
            </div>
            <div className="text-xs text-gray-500">
              You can choose “Save to favorites” on the next screen after reviewing the meal.
            </div>

            <button
              type="button"
              onClick={() => {
                setRecipe(null)
                setError(null)
              }}
              className="w-full rounded-xl px-4 py-2 text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
