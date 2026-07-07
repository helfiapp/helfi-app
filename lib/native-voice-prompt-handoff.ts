import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const HANDOFF_NAME_PREFIX = '__NATIVE_VOICE_PROMPT_HANDOFF__:'
const HANDOFF_TTL_MS = 10 * 60 * 1000

function cleanPrompt(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 1200)
}

function handoffName(token: string) {
  return `${HANDOFF_NAME_PREFIX}${token}`
}

export async function createNativeVoicePromptHandoff(userId: string, prompt: unknown) {
  const cleanedPrompt = cleanPrompt(prompt)
  const token = crypto.randomBytes(24).toString('base64url')
  const expiresAt = Date.now() + HANDOFF_TTL_MS
  const expiresAtSeconds = Math.floor(expiresAt / 1000)

  await prisma.healthGoal.deleteMany({
    where: {
      userId,
      name: { startsWith: HANDOFF_NAME_PREFIX },
      currentRating: { lt: Math.floor(Date.now() / 1000) },
    },
  }).catch(() => {})

  await prisma.healthGoal.create({
    data: {
      userId,
      name: handoffName(token),
      category: JSON.stringify({ prompt: cleanedPrompt, expiresAt }),
      currentRating: expiresAtSeconds,
    },
  })

  return { token, expiresAt }
}

export async function consumeNativeVoicePromptHandoff(userId: string, token: unknown) {
  const cleanToken = String(token || '').trim()
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(cleanToken)) return ''

  const record = await prisma.healthGoal.findFirst({
    where: {
      userId,
      name: handoffName(cleanToken),
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!record) return ''

  await prisma.healthGoal.delete({ where: { id: record.id } }).catch(() => {})

  try {
    const parsed = JSON.parse(record.category || '{}')
    const expiresAt = Number(parsed?.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return ''
    return cleanPrompt(parsed?.prompt)
  } catch {
    return ''
  }
}
