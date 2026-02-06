import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { getEmailFooter } from '@/lib/email-footer'
import { buildCustomFoodKey } from '@/lib/food/custom-food-import'
import { findMenuMatchForReport, syncFastFoodMenus } from '@/lib/food/fast-food-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getResend = () => {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

const getSupportEmail = () => process.env.MISSING_FOOD_EMAIL_TO || 'support@helfi.ai'

const sendAddedEmail = async (payload: {
  name: string
  brand?: string | null
  country?: string | null
  userEmail?: string | null
}) => {
  const resend = getResend()
  if (!resend) return

  try {
    const supportEmail = getSupportEmail()
    const emailResponse = await resend.emails.send({
      from: 'Helfi Food Requests <support@helfi.ai>',
      to: supportEmail,
      subject: `Auto-added food item: ${payload.name}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 28px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">Food Item Auto-Added</h1>
          </div>
          <div style="padding: 28px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
            <p style="margin: 0 0 16px 0; font-size: 16px;"><strong>Item:</strong> ${payload.name}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Brand/Chain:</strong> ${payload.brand || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>Country:</strong> ${payload.country || '—'}</p>
            <p style="margin: 0 0 10px 0; font-size: 14px;"><strong>User:</strong> ${payload.userEmail || '—'}</p>
            ${getEmailFooter({ recipientEmail: supportEmail, emailType: 'support' })}
          </div>
        </div>
      `,
    })

    console.log(`✅ [MISSING FOOD AUTO-ADD] Email sent: ${emailResponse.data?.id}`)
  } catch (error) {
    console.error('❌ [MISSING FOOD AUTO-ADD] Email failed:', error)
  }
}

const resolveCountry = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim().toUpperCase()
  return trimmed || null
}

export async function GET(request: NextRequest) {
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  const authHeader = request.headers.get('authorization')
  const expected = process.env.FOOD_MISSING_AUTOFILL_SECRET || process.env.SCHEDULER_SECRET

  if (!(isVercelCron || (expected && authHeader === `Bearer ${expected}`))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const syncResult = await syncFastFoodMenus()

  const pendingReports = await prisma.foodMissingReport.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  let matched = 0
  let added = 0
  let skipped = 0

  for (const report of pendingReports) {
    const reportCountry = resolveCountry(report.country)
    const brand = report.brand || report.chain || null

    const menuMatch = findMenuMatchForReport({
      name: report.name,
      brand,
      country: reportCountry,
    })

    if (menuMatch) {
      const key = buildCustomFoodKey({
        name: menuMatch.name,
        brand: menuMatch.chain,
        kind: 'FAST_FOOD',
        country: menuMatch.country ?? null,
      })

      const customItem = await prisma.customFoodItem.findUnique({ where: { key } })

      if (customItem) {
        await prisma.foodMissingReport.update({
          where: { id: report.id },
          data: {
            status: 'ADDED',
            matchedCustomFoodId: customItem.id,
            processedAt: new Date(),
            processedNote: 'Matched to fast-food menu list',
          },
        })

        added += 1

        // Fire-and-forget email (do not await)
        sendAddedEmail({
          name: customItem.name,
          brand: customItem.brand,
          country: customItem.country,
          userEmail: report.userEmail,
        }).catch((error) => {
          console.error('❌ [MISSING FOOD AUTO-ADD] Error:', error)
        })
        continue
      }
    }

    const existing = await prisma.customFoodItem.findFirst({
      where: {
        kind: 'FAST_FOOD',
        name: report.name,
        ...(reportCountry ? { OR: [{ country: reportCountry }, { country: null }] } : {}),
        ...(brand ? { brand } : {}),
      },
    })

    if (existing) {
      await prisma.foodMissingReport.update({
        where: { id: report.id },
        data: {
          status: 'MATCHED',
          matchedCustomFoodId: existing.id,
          processedAt: new Date(),
          processedNote: 'Already available in custom foods',
        },
      })
      matched += 1
    } else {
      skipped += 1
    }
  }

  return NextResponse.json({
    ok: true,
    synced: syncResult,
    pending: pendingReports.length,
    matched,
    added,
    skipped,
  })
}
