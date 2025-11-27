import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkInsightsStatus } from '@/lib/insights/regeneration-service'
import { ISSUE_SECTION_ORDER, type IssueSectionKey } from '@/lib/insights/issue-engine'

export async function GET(
  _request: Request,
  context: { params: { slug: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const issueSlug = context.params.slug
    const sections = ISSUE_SECTION_ORDER.filter((s) => s !== 'overview') as IssueSectionKey[]
    
    // Check status for all sections
    const statusPromises = sections.map(async (section) => {
      const status = await checkInsightsStatus(session.user.id, issueSlug, section)
      return {
        section,
        ...status,
      }
    })
    
    const statuses = await Promise.all(statusPromises)
    
    // Determine overall status
    const hasStale = statuses.some(s => s.status === 'stale' || s.needsUpdate)
    const hasMissing = statuses.some(s => s.status === 'missing')
    const hasGenerating = statuses.some(s => s.status === 'generating')
    const allFresh = statuses.every(s => s.status === 'fresh' && !s.needsUpdate)
    
    const needsRegeneration = hasStale || hasMissing || (hasGenerating && !allFresh)
    
    return NextResponse.json({
      needsRegeneration,
      statuses: statuses.reduce((acc, s) => {
        acc[s.section] = {
          status: s.status,
          needsUpdate: s.needsUpdate,
          lastGenerated: s.lastGenerated?.toISOString() || null,
        }
        return acc
      }, {} as Record<string, { status: string; needsUpdate: boolean; lastGenerated: string | null }>),
    })
  } catch (error) {
    console.error('[insights.api] Error checking insights status', error)
    return NextResponse.json({ error: 'Failed to check insights status' }, { status: 500 })
  }
}

