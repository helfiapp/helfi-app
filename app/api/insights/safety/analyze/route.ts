import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type InsightCard = {
  id: string
  title: string
  summary: string
  reason: string
  actions: string[]
  tags: string[]
  confidence: number
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ items: [] }, { status: 200 })

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        supplements: true,
        medications: true,
        foodLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
        healthLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
        healthGoals: { orderBy: { updatedAt: 'desc' } },
      },
    })

    if (!user) return NextResponse.json({ items: [] }, { status: 200 })

    const supps = (user.supplements || []).map((s: any) => ({ name: String(s.name || ''), timing: s.timing || [], dosage: s.dosage || '' }))
    const meds = (user.medications || []).map((m: any) => ({ name: String(m.name || ''), timing: m.timing || [], dosage: m.dosage || '' }))
    const foods = (user.foodLogs || []).map((f: any) => ({ name: String(f.name || ''), nutrients: f.nutrients || {} }))

    const has = <T extends { name: string }>(list: T[], re: RegExp) => list.some(i => re.test(i.name))
    const find = <T extends { name: string }>(list: T[], re: RegExp): T[] => list.filter(i => re.test(i.name))

    const items: InsightCard[] = []

    // Rule: Separate iron and calcium
    if ((has(supps, /iron/i) || has(meds, /iron/i)) && (has(supps, /calcium/i) || has(meds, /calcium/i))) {
      const ironCount = find([...supps, ...meds], /iron/i).length
      const calciumCount = find([...supps, ...meds], /calcium/i).length
      items.push({
        id: 'safety-iron-calcium',
        title: 'Separate iron and calcium',
        summary: 'Taking iron and calcium close together can reduce iron absorption.',
        reason: `You logged iron (${ironCount}) and calcium (${calciumCount}).`,
        actions: [
          'Take iron and calcium at least 2 hours apart.',
          'Take iron away from high‑fiber meals if possible.',
          'Confirm timing with your clinician if dosing is medically necessary.',
        ],
        tags: ['safety','timing','medication','supplement'],
        confidence: 0.8,
      })
    }

    // Rule: Magnesium timing towards evening
    if (has(supps, /magnesium/i)) {
      const mag = find(supps, /magnesium/i) as Array<{ name: string; timing?: string[] }>
      const hasMorning = mag.some(m => Array.isArray(m.timing) && m.timing.some((t: string) => /am|morn/i.test(t)))
      items.push({
        id: 'safety-magnesium-evening',
        title: 'Consider magnesium in the evening',
        summary: 'Magnesium is often better tolerated 1–2 hours before sleep.',
        reason: hasMorning ? 'Your magnesium timing includes morning doses.' : 'You take magnesium; evening timing can support sleep quality.',
        actions: [
          'Try moving magnesium to 1–2 hours before sleep.',
          'Avoid pairing with very high‑fiber meals to support absorption.',
        ],
        tags: ['supplement','timing','sleep'],
        confidence: 0.65,
      })
    }

    // Rule: Low average protein → fatigue/energy
    const proteinVals: number[] = foods.map(f => Number((f.nutrients || {}).protein)).filter(v => Number.isFinite(v))
    if (proteinVals.length >= 3) {
      const avgProtein = proteinVals.reduce((a,b)=>a+b,0) / proteinVals.length
      if (avgProtein < 60) {
        items.push({
          id: 'nutrition-protein-low',
          title: 'Protein may be low on average',
          summary: 'Low daily protein can contribute to low energy and poor appetite control.',
          reason: `Your recent foods average about ${Math.round(avgProtein)}g protein per entry.`,
          actions: [
            'Aim for 25–35g protein at breakfast.',
            'Include a protein source in each meal (eggs, dairy, fish, poultry, legumes).',
          ],
          tags: ['nutrition','energy','safety'],
          confidence: 0.6,
        })
      }
    }

    // Rule: Sodium awareness if BP-related (simple heuristic)
    const sodiumVals: number[] = foods.map(f => Number((f.nutrients || {}).sodium)).filter(v => Number.isFinite(v))
    if (sodiumVals.length >= 3) {
      const avgNa = sodiumVals.reduce((a,b)=>a+b,0) / sodiumVals.length
      if (avgNa > 800) {
        items.push({
          id: 'nutrition-sodium-awareness',
          title: 'Sodium may be high',
          summary: 'Higher sodium intake can affect blood pressure in some people.',
          reason: `Average sodium per entry is ~${Math.round(avgNa)} mg across recent meals.`,
          actions: [
            'Choose lower‑sodium options (broths, sauces, deli meats).',
            'Pair higher‑sodium meals with potassium‑rich foods (vegetables, legumes).',
          ],
          tags: ['nutrition','bp','safety'],
          confidence: 0.55,
        })
      }
    }

    // Rule: Tadalafil + ginger → potential additive BP lowering (informational)
    if ((has(meds, /tadalafil|cialis/i)) && (has(supps, /ginger|zingiber/i) || foods.some(f => /ginger/i.test(f.name)))) {
      items.push({
        id: 'interaction-tadalafil-ginger',
        title: 'Possible additive blood pressure lowering (tadalafil + ginger)',
        summary: 'Both tadalafil and ginger may lower blood pressure. Together they could increase the effect in some people.',
        reason: 'You logged tadalafil and ginger (supplement or food).',
        actions: [
          'Avoid taking ginger around the time you use tadalafil if you notice dizziness or light‑headedness.',
          'Stand up slowly; hydrate well on those days.',
          'Discuss with your clinician if you experience symptoms.',
        ],
        tags: ['safety','interaction','bp'],
        confidence: 0.55,
      })
    }

    return NextResponse.json({ items }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}

