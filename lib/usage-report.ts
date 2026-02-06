import { prisma } from '@/lib/prisma'

export type ActivityTable = {
  label: string
  table: string
  column: string
  spikeThreshold: number
}

export const ACTIVITY_TABLES: ActivityTable[] = [
  { label: 'Health goals', table: 'HealthGoal', column: 'createdAt', spikeThreshold: 30 },
  { label: 'Food diary entries', table: 'FoodLog', column: 'createdAt', spikeThreshold: 20 },
  { label: 'Water logs', table: 'WaterLog', column: 'createdAt', spikeThreshold: 20 },
  { label: 'Exercise entries', table: 'ExerciseEntry', column: 'createdAt', spikeThreshold: 15 },
  { label: 'Health journal entries', table: 'HealthJournalEntry', column: 'createdAt', spikeThreshold: 10 },
  { label: 'Mood entries', table: 'MoodEntries', column: 'timestamp', spikeThreshold: 30 },
  { label: 'Mood journal entries', table: 'MoodJournalEntries', column: 'createdAt', spikeThreshold: 10 },
  { label: 'Symptom analyses', table: 'SymptomAnalysis', column: 'createdAt', spikeThreshold: 10 },
  { label: 'Interaction analyses', table: 'InteractionAnalysis', column: 'createdAt', spikeThreshold: 10 },
  { label: 'Medical image analyses', table: 'MedicalImageAnalysis', column: 'createdAt', spikeThreshold: 5 },
  { label: 'Lab reports', table: 'Report', column: 'createdAt', spikeThreshold: 5 },
  { label: 'Supplements', table: 'Supplement', column: 'createdAt', spikeThreshold: 10 },
  { label: 'Medications', table: 'Medication', column: 'createdAt', spikeThreshold: 10 },
  { label: 'AI usage events', table: 'AIUsageEvent', column: 'createdAt', spikeThreshold: 30 },
]

export type ActivityCount = ActivityTable & {
  count: number
}

export type ActivityWindowCounts = ActivityTable & {
  recentCount: number
  baselineCount: number
  baselinePerWindow: number
}

export const formatNumber = (value: number) => {
  return new Intl.NumberFormat('en-US').format(value)
}

export const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let idx = 0
  let current = value
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024
    idx += 1
  }
  return `${current.toFixed(current >= 10 ? 1 : 2)} ${units[idx]}`
}

export async function countTableRows(table: string, column: string, from: Date, to: Date): Promise<number> {
  try {
    const query = `SELECT COUNT(*)::bigint AS count FROM "${table}" WHERE "${column}" >= $1 AND "${column}" < $2`
    const rows: any[] = await prisma.$queryRawUnsafe(query, from, to)
    const count = rows?.[0]?.count
    return Number(count || 0)
  } catch (error) {
    return 0
  }
}

export async function getActivityCounts(from: Date, to: Date): Promise<ActivityCount[]> {
  const results: ActivityCount[] = []
  for (const table of ACTIVITY_TABLES) {
    const count = await countTableRows(table.table, table.column, from, to)
    if (count > 0) {
      results.push({ ...table, count })
    }
  }
  return results.sort((a, b) => b.count - a.count)
}

export async function getSpikeCandidates(options: {
  recentFrom: Date
  recentTo: Date
  baselineFrom: Date
  baselineTo: Date
  baselineWindows: number
}): Promise<ActivityWindowCounts[]> {
  const rows: ActivityWindowCounts[] = []

  for (const table of ACTIVITY_TABLES) {
    const recentCount = await countTableRows(table.table, table.column, options.recentFrom, options.recentTo)
    const baselineCount = await countTableRows(table.table, table.column, options.baselineFrom, options.baselineTo)
    const baselinePerWindow = options.baselineWindows > 0 ? baselineCount / options.baselineWindows : 0
    rows.push({
      ...table,
      recentCount,
      baselineCount,
      baselinePerWindow,
    })
  }

  return rows
}
