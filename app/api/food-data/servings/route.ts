export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { fetchFatSecretServingOptions, fetchUsdaServingOptions } from '@/lib/food-data'
import { buildCustomFoodServingOptions } from '@/lib/food/custom-serving-options'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const source = (searchParams.get('source') || '').toLowerCase()
    const id = (searchParams.get('id') || '').trim()

    if (!source || !id) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: source, id' },
        { status: 400 },
      )
    }

    const normalizedId = id.startsWith('custom:') ? id.slice('custom:'.length) : id

    if (source === 'custom' || id.startsWith('custom:')) {
      const item = await prisma.customFoodItem.findUnique({ where: { id: normalizedId } })
      const storedOptions = Array.isArray(item?.servingOptions) ? item.servingOptions : []
      const options =
        storedOptions.length > 0 || !item
          ? storedOptions
          : buildCustomFoodServingOptions({
              name: item.name,
              kind: item.kind,
              caloriesPer100g: item.caloriesPer100g,
              proteinPer100g: item.proteinPer100g,
              carbsPer100g: item.carbsPer100g,
              fatPer100g: item.fatPer100g,
              fiberPer100g: item.fiberPer100g,
              sugarPer100g: item.sugarPer100g,
            })
      return NextResponse.json({ success: true, source: 'custom', options })
    }

    if (source === 'usda') {
      const options = await fetchUsdaServingOptions(id)
      return NextResponse.json({ success: true, source: 'usda', options })
    }

    if (source === 'fatsecret') {
      const options = await fetchFatSecretServingOptions(id)
      return NextResponse.json({ success: true, source: 'fatsecret', options })
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported source. Expected usda or fatsecret.' },
      { status: 400 },
    )
  } catch (error) {
    console.error('GET /api/food-data/servings error', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch serving options' }, { status: 500 })
  }
}
