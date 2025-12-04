import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { triggerManualSectionRegeneration, getAffectedSections } from '@/lib/insights/regeneration-service'

const VALID_CHANGE_TYPES = [
  'supplements',
  'medications',
  'food',
  'exercise',
  'health_goals',
  'health_situations',
  'profile',
  'blood_results',
] as const

type ChangeType = (typeof VALID_CHANGE_TYPES)[number]

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const changeTypesInput: unknown = body?.changeTypes
    const changeTypes = Array.isArray(changeTypesInput)
      ? changeTypesInput.filter((t): t is ChangeType => VALID_CHANGE_TYPES.includes(t as ChangeType))
      : []

    if (changeTypes.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No valid change types provided; nothing to regenerate.',
        sectionsTriggered: [],
      }, { status: 400 })
    }

    const sections = await triggerManualSectionRegeneration(session.user.id, changeTypes)
    const affected = changeTypes.reduce<string[]>((acc, type) => {
      const mapped = getAffectedSections(type)
      mapped.forEach((s) => acc.push(s))
      return acc
    }, [])

    return NextResponse.json({
      success: true,
      message: 'Targeted insights regeneration started.',
      changeTypes: Array.from(new Set(changeTypes)),
      sectionsTriggered: sections,
      affectedSections: Array.from(new Set(affected)),
    }, { status: 202 })
  } catch (error) {
    console.error('[insights.regenerate-targeted] Failed to trigger regeneration', error)
    return NextResponse.json({ error: 'Failed to start regeneration' }, { status: 500 })
  }
}
