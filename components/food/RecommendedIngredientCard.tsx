'use client'

import { useMemo } from 'react'

type RecommendedItem = {
  name: string
  serving_size?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  servings: number
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const formatNumber = (value: number | null | undefined, decimals = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}

const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const formatServingsDisplay = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const normalized = Math.round(value * 1000) / 1000
  const rounded = Math.round(normalized * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

const iconKeyForIngredient = (name: string) => {
  const n = String(name || '').toLowerCase()
  const has = (re: RegExp) => re.test(n)
  if (has(/\b(cod|salmon|tuna|sardine|mackerel|fish|prawn|shrimp)\b/)) return 'fish'
  if (has(/\b(chicken|beef|pork|lamb|turkey|steak|bacon|ham)\b/)) return 'meat'
  if (has(/\b(egg|eggs)\b/)) return 'egg'
  if (has(/\b(milk|cheese|yogurt|yoghurt|whey|casein|kefir)\b/)) return 'dairy'
  if (has(/\b(oat|oats|rice|bread|pasta|quinoa|barley|cereal|granola)\b/)) return 'grain'
  if (has(/\b(lentil|lentils|bean|beans|chickpea|chickpeas|tofu|tempeh|edamame)\b/)) return 'legume'
  if (has(/\b(lemon|lime|orange|apple|banana|berry|berries|mango|pineapple|grape)\b/)) return 'fruit'
  if (has(/\b(garlic|ginger|turmeric|cumin|paprika|chili|chilli|pepper|salt|spice|herb|parsley|basil|oregano|coriander|cilantro)\b/))
    return 'spice'
  if (has(/\b(oil|olive|butter|ghee)\b/)) return 'oil'
  if (has(/\b(broccoli|spinach|kale|lettuce|carrot|tomato|cucumber|zucchini|capsicum|pepper|onion|mushroom)\b/))
    return 'veg'
  return 'bowl'
}

const Icon = ({ name }: { name: string }) => {
  const key = iconKeyForIngredient(name)
  const { bg, fg, svg } = (() => {
    switch (key) {
      case 'fish':
        return {
          bg: 'bg-sky-50 border-sky-100',
          fg: 'text-sky-700',
          svg: (
            <path
              d="M7 12c2.2-2.3 4.8-3.5 7.8-3.5 2 0 3.8.5 5.4 1.5l2.3-1.8v7.6L20.2 14c-1.6 1-3.4 1.5-5.4 1.5C11.8 15.5 9.2 14.3 7 12Zm7.8-2c-1.9 0-3.6.7-5.1 2 1.5 1.3 3.2 2 5.1 2 1.3 0 2.5-.3 3.6-.9l.3-.2-.3-.2c-1.1-.6-2.3-.9-3.6-.9Zm4.9 2.1a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z"
              fill="currentColor"
            />
          ),
        }
      case 'meat':
        return {
          bg: 'bg-rose-50 border-rose-100',
          fg: 'text-rose-700',
          svg: (
            <path
              d="M9.5 7.2c2-2 5.2-2 7.2 0 2.7 2.7 1.8 6.2-.6 8.6-2.4 2.4-5.9 3.3-8.6.6-2-2-2-5.2 0-7.2l.7-.7c.3-.3.8-.3 1.1 0l.2.2ZM8.8 10a3.2 3.2 0 0 0 0 4.5c1.9 1.9 4.6 1.1 6.4-.7 1.8-1.8 2.6-4.5.7-6.4a3.2 3.2 0 0 0-4.5 0L8.8 10Zm-1.9 8.6a1.5 1.5 0 0 1 2.1 0l.3.3a1.5 1.5 0 1 1-2.1 2.1l-.3-.3a1.5 1.5 0 0 1 0-2.1Z"
              fill="currentColor"
            />
          ),
        }
      case 'egg':
        return {
          bg: 'bg-amber-50 border-amber-100',
          fg: 'text-amber-700',
          svg: <path d="M12 3c3.1 0 6 5.2 6 9.5S15.1 21 12 21s-6-4.2-6-8.5S8.9 3 12 3Z" fill="currentColor" />,
        }
      case 'dairy':
        return {
          bg: 'bg-indigo-50 border-indigo-100',
          fg: 'text-indigo-700',
          svg: <path d="M9 2h6l1 3v16a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5l1-3Zm1.7 5L10 9h4l-.7-2H10.7Z" fill="currentColor" />,
        }
      case 'grain':
        return {
          bg: 'bg-yellow-50 border-yellow-100',
          fg: 'text-yellow-700',
          svg: <path d="M12 3c3 2 5 5 5 8 0 4-2.2 7-5 10-2.8-3-5-6-5-10 0-3 2-6 5-8Z" fill="currentColor" />,
        }
      case 'legume':
        return {
          bg: 'bg-emerald-50 border-emerald-100',
          fg: 'text-emerald-700',
          svg: (
            <path
              d="M10.3 4.2c3.1-.8 6.3 1.1 7.1 4.2.8 3.1-1.1 6.3-4.2 7.1-1.6.4-3 .2-4.3-.5l-2.2 2.2a2 2 0 1 1-2.8-2.8l2.2-2.2c-.7-1.3-.9-2.8-.5-4.3.8-3.1 4-5 7-4.2Zm-.1 3.1a3.5 3.5 0 1 0 1.7 6.8 3.5 3.5 0 0 0-1.7-6.8Z"
              fill="currentColor"
            />
          ),
        }
      case 'fruit':
        return {
          bg: 'bg-pink-50 border-pink-100',
          fg: 'text-pink-700',
          svg: (
            <path
              d="M13 4c1.5 0 2.8.6 3.8 1.6l.7-.7a1 1 0 0 1 1.4 1.4l-.8.8c.6 1 .9 2.1.9 3.4 0 4.7-3.8 8.5-8.5 8.5S2 15.2 2 10.5 5.8 2 10.5 2c.9 0 1.8.1 2.5.4V4Z"
              fill="currentColor"
            />
          ),
        }
      case 'spice':
        return {
          bg: 'bg-violet-50 border-violet-100',
          fg: 'text-violet-700',
          svg: (
            <path
              d="M12 2l1.2 3.6L17 7l-3.8 1.4L12 12l-1.2-3.6L7 7l3.8-1.4L12 2Zm7 10l.7 2.1L22 15l-2.3.9L19 18l-.7-2.1L16 15l2.3-.9L19 12ZM5 12l.7 2.1L8 15l-2.3.9L5 18l-.7-2.1L2 15l2.3-.9L5 12Z"
              fill="currentColor"
            />
          ),
        }
      case 'oil':
        return {
          bg: 'bg-lime-50 border-lime-100',
          fg: 'text-lime-700',
          svg: <path d="M12 2c2.5 3 5 6.2 5 9a5 5 0 1 1-10 0c0-2.8 2.5-6 5-9Z" fill="currentColor" />,
        }
      case 'veg':
        return {
          bg: 'bg-green-50 border-green-100',
          fg: 'text-green-700',
          svg: (
            <path
              d="M12 3c4 0 7 3 7 7 0 6-5 11-7 11S5 16 5 10c0-4 3-7 7-7Zm0 3c-2.2 0-4 1.8-4 4 0 4.1 3.2 7.9 4 8.9.8-1 4-4.8 4-8.9 0-2.2-1.8-4-4-4Z"
              fill="currentColor"
            />
          ),
        }
      default:
        return {
          bg: 'bg-gray-50 border-gray-100',
          fg: 'text-gray-700',
          svg: <path d="M7 6h10a2 2 0 0 1 2 2v2c0 4.4-3.6 8-8 8H7V6Zm2 2v8h2a6 6 0 0 0 6-6V8H9Z" fill="currentColor" />,
        }
    }
  })()

  return (
    <div className={`h-9 w-9 rounded-xl border ${bg} flex items-center justify-center ${fg} shrink-0`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        {svg}
      </svg>
    </div>
  )
}

export default function RecommendedIngredientCard({
  item,
  index,
  onServingsChange,
}: {
  item: RecommendedItem
  index: number
  onServingsChange: (index: number, next: number) => void
}) {
  const servings = useMemo(() => {
    const raw = Number(item?.servings ?? 1)
    return Number.isFinite(raw) ? clamp(raw, 0, 20) : 1
  }, [item?.servings])

  const totals = useMemo(() => {
    return {
      calories: Math.round(macroOrZero(item.calories) * servings),
      protein_g: Math.round(macroOrZero(item.protein_g) * servings * 10) / 10,
      carbs_g: Math.round(macroOrZero(item.carbs_g) * servings * 10) / 10,
      fat_g: Math.round(macroOrZero(item.fat_g) * servings * 10) / 10,
      fiber_g: Math.round(macroOrZero(item.fiber_g) * servings * 10) / 10,
      sugar_g: Math.round(macroOrZero(item.sugar_g) * servings * 10) / 10,
    }
  }, [item.calories, item.protein_g, item.carbs_g, item.fat_g, item.fiber_g, item.sugar_g, servings])

  const perServingCalories = Math.round(macroOrZero(item.calories))
  const servingSizeLabel = item.serving_size ? String(item.serving_size).trim() : '1 serving'
  const totalsLabel = `${formatServingsDisplay(servings)} serving${Math.abs(servings - 1) < 0.001 ? '' : 's'}`

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Icon name={item.name} />
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-base truncate">{item.name}</div>
            <div className="text-sm text-gray-500 mt-1 truncate">
              Serving size: {servingSizeLabel} • {perServingCalories} kcal per serving
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Servings</span>
          <input
            value={String(servings)}
            onChange={(e) => onServingsChange(index, Number(e.target.value))}
            inputMode="decimal"
            className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900"
            aria-label={`Servings for ${item.name}`}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Totals for {totalsLabel}</div>
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-orange-600">{formatNumber(totals.calories)}</span>
            <span className="uppercase text-gray-500">Calories</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-blue-600">{formatNumber(totals.protein_g, 1)}g</span>
            <span className="uppercase text-gray-500">Protein</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-green-600">{formatNumber(totals.carbs_g, 1)}g</span>
            <span className="uppercase text-gray-500">Carbs</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-purple-600">{formatNumber(totals.fat_g, 1)}g</span>
            <span className="uppercase text-gray-500">Fat</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-amber-600">{formatNumber(totals.fiber_g, 1)}g</span>
            <span className="uppercase text-gray-500">Fiber</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-pink-600">{formatNumber(totals.sugar_g, 1)}g</span>
            <span className="uppercase text-gray-500">Sugar</span>
          </div>
        </div>
      </div>
    </div>
  )
}
