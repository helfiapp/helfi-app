import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const toNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeText = (value: any): string | null => {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

const stripNutritionFromServingSize = (raw: string) => {
  return String(raw || '')
    .replace(/\([^)]*(calories?|kcal|kilojoules?|kj|protein|carbs?|fat|fibre|fiber|sugar)[^)]*\)/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*(kcal|cal|kj)\b[^,)]*(?:protein|carb|fat|fiber|fibre|sugar)[^,)]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const parseServingWeight = (servingSize?: string | null): number | null => {
  if (!servingSize) return null
  const raw = String(servingSize)
  const gramsMatch = raw.match(/(\d+(?:\.\d+)?)\s*g\b/i)
  if (gramsMatch) return parseFloat(gramsMatch[1])
  const mlMatch = raw.match(/(\d+(?:\.\d+)?)\s*ml\b/i)
  if (mlMatch) return parseFloat(mlMatch[1])
  const ozMatch = raw.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/i)
  if (ozMatch) return parseFloat(ozMatch[1]) * 28.3495
  return null
}

const validateServingSanity = (data: {
  servingSize?: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
}) => {
  const weight = parseServingWeight(data.servingSize || null)
  if (!weight || weight <= 0) return { ok: true }
  const safe = (v: number | null) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)
  const macroSum = safe(data.proteinG) + safe(data.carbsG) + safe(data.fatG) + safe(data.fiberG)
  const macroLimit = weight * 1.3 + 2
  if (macroSum > macroLimit) {
    return { ok: false, message: 'Nutrition values do not fit the serving size. Please retake the label photo.' }
  }
  const calories = safe(data.calories)
  const calorieLimit = weight * 9.5 + 10
  if (calories > calorieLimit) {
    return { ok: false, message: 'Calories do not fit the serving size. Please retake the label photo.' }
  }
  return { ok: true }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const rawBarcode = normalizeText(body?.barcode)
    if (!rawBarcode) {
      return NextResponse.json({ error: 'Missing barcode' }, { status: 400 })
    }

    const barcode = rawBarcode.replace(/[^0-9A-Za-z]/g, '')
    if (!barcode) {
      return NextResponse.json({ error: 'Invalid barcode' }, { status: 400 })
    }

    const item = body?.item || {}
    const name = normalizeText(item?.name) || 'Packaged item'
    const brand = normalizeText(item?.brand)
    const rawServingSize = normalizeText(item?.serving_size || item?.servingSize)
    const servingSize = rawServingSize ? stripNutritionFromServingSize(rawServingSize) : null

    const calories = toNumber(item?.calories)
    const proteinG = toNumber(item?.protein_g ?? item?.proteinG)
    const carbsG = toNumber(item?.carbs_g ?? item?.carbsG)
    const fatG = toNumber(item?.fat_g ?? item?.fatG)
    const fiberG = toNumber(item?.fiber_g ?? item?.fiberG)
    const sugarG = toNumber(item?.sugar_g ?? item?.sugarG)
    const quantityG = toNumber(item?.quantity_g ?? item?.quantityG)
    const piecesPerServing = toNumber(item?.piecesPerServing ?? item?.pieces_per_serving)

    const nutritionValues = [calories, proteinG, carbsG, fatG, fiberG, sugarG]
    const hasNutrition = nutritionValues.some((v) => Number.isFinite(Number(v)) && Number(v) > 0)
    if (!hasNutrition) {
      return NextResponse.json(
        {
          error: 'nutrition_missing',
          message: 'We could not read clear nutrition values from that photo. Please try a clearer label photo.',
        },
        { status: 422 },
      )
    }

    const sanity = validateServingSanity({
      servingSize,
      calories,
      proteinG,
      carbsG,
      fatG,
      fiberG,
    })
    if (!sanity.ok) {
      return NextResponse.json(
        {
          error: 'nutrition_mismatch',
          message: sanity.message || 'Nutrition values do not match the serving size.',
        },
        { status: 422 },
      )
    }

    const isReport = Boolean(body?.report)
    const now = new Date()

    const updateData = {
      name,
      brand,
      servingSize,
      calories,
      proteinG,
      carbsG,
      fatG,
      fiberG,
      sugarG,
      quantityG,
      piecesPerServing,
      source: 'label-photo',
      updatedById: user.id,
      updatedAt: now,
      ...(isReport ? { reportCount: { increment: 1 }, lastReportedAt: now } : {}),
    }

    const createData = {
      barcode,
      name,
      brand,
      servingSize,
      calories,
      proteinG,
      carbsG,
      fatG,
      fiberG,
      sugarG,
      quantityG,
      piecesPerServing,
      source: 'label-photo',
      reportCount: isReport ? 1 : 0,
      lastReportedAt: isReport ? now : null,
      createdById: user.id,
      updatedById: user.id,
      createdAt: now,
      updatedAt: now,
    }

    const record = await prisma.barcodeProduct.upsert({
      where: { barcode },
      update: updateData,
      create: createData,
    })

    return NextResponse.json({
      success: true,
      product: {
        barcode: record.barcode,
        name: record.name,
        brand: record.brand,
        servingSize: record.servingSize,
      },
    })
  } catch (error) {
    console.error('Barcode label save failed', error)
    return NextResponse.json({ error: 'Failed to save barcode label' }, { status: 500 })
  }
}
