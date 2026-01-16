import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildFoodDiarySnapshot } from '@/lib/food-diary-context'

const GENERAL_EXAMPLES = [
  'What supplements should I take?',
  'How are my medications interacting?',
  'Why am I feeling tired?',
  'What should I eat today?',
]

const FOOD_EXAMPLES = [
  'Based on my macros today, what should I eat right now?',
  'My protein is low and fat is near max. Give me 3 options.',
  'What can I make with what I have in my fridge/pantry?',
  'How can I add more fiber without adding much fat?',
]

const toLabel = (value: string) => value.trim().toLowerCase()

const pickAvoidLabel = (items: string[]) => {
  if (items.length === 0) return null
  const lowered = items.map(toLabel)
  const index = lowered.findIndex((item) => item !== 'calories')
  return items[index >= 0 ? index : 0]
}

const pickFocusLabels = (items: string[]) => {
  const lowered = items.map(toLabel)
  const filtered = lowered.filter((item) => !['calories', 'sugar'].includes(item))
  if (filtered.length > 0) return filtered
  return lowered
}

const addUnique = (list: string[], value: string) => {
  if (!value) return
  if (list.includes(value)) return
  list.push(value)
}

const buildFoodQuestions = async (userId: string, localDate: string, tzOffsetMin: number) => {
  const snapshot = await buildFoodDiarySnapshot({ userId, localDate, tzOffsetMin })
  if (!snapshot) return FOOD_EXAMPLES

  const low = snapshot.priority.low.map(toLabel)
  const focusCandidates = pickFocusLabels(low)
  const focusOne = focusCandidates[0] || 'protein'
  const focusTwo = focusCandidates[1] || (focusOne === 'fiber' ? 'protein' : 'fiber')
  const avoidRaw = pickAvoidLabel(snapshot.priority.nearCap)
  const avoid = avoidRaw ? toLabel(avoidRaw) : null

  const remainingCaloriesRaw = snapshot.remaining?.calories?.remainingClamped
  const remainingCalories =
    typeof remainingCaloriesRaw === 'number' && Number.isFinite(remainingCaloriesRaw)
      ? Math.max(0, Math.round(remainingCaloriesRaw))
      : null

  const questions: string[] = []
  addUnique(
    questions,
    `Based on my macros today, what should I eat right now to boost ${focusOne} and ${focusTwo}?`
  )

  if (avoid) {
    addUnique(
      questions,
      `My ${focusOne} is low and ${avoid} is near max. Give me 3 options.`
    )
  }

  if (remainingCalories !== null) {
    addUnique(
      questions,
      `I have about ${remainingCalories} kcal left today. What meal fits that and adds ${focusOne}?`
    )
  }

  addUnique(questions, 'What can I make with what I have in my fridge/pantry?')

  return questions.slice(0, 4)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const context = (searchParams.get('context') || 'general').toLowerCase()
  if (context !== 'food') {
    return NextResponse.json({ questions: GENERAL_EXAMPLES }, { status: 200 })
  }

  const localDate = searchParams.get('localDate') || ''
  const tzOffsetMin = Number(searchParams.get('tzOffsetMin'))
  const resolvedDate =
    /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : new Date().toISOString().slice(0, 10)
  const resolvedOffset = Number.isFinite(tzOffsetMin) ? tzOffsetMin : new Date().getTimezoneOffset()

  const questions = await buildFoodQuestions(session.user.id, resolvedDate, resolvedOffset)
  return NextResponse.json({ questions }, { status: 200 })
}
