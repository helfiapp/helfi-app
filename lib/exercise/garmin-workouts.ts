export function extractGarminWorkouts(payload: any) {
  const results: Array<{
    deviceId: string
    startTime: Date | null
    durationMinutes: number
    calories: number
    label: string
    raw: any
  }> = []

  const seen = new Set<string>()

  const visit = (node: any) => {
    if (!node) return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (typeof node !== 'object') return

    const activityId = node.activityId ?? node.activitySummaryId ?? node.summaryId ?? node.id
    const durationSeconds = node.durationInSeconds ?? node.duration ?? node.activeDurationInSeconds ?? null
    const calories = node.activeKilocalories ?? node.totalKilocalories ?? node.calories ?? node.kilocalories ?? null
    const startSeconds = node.startTimeInSeconds ?? node.startTimeInMillis ?? null
    const startIso = node.startTime ?? node.startDate ?? null
    const labelRaw = node.activityName ?? node.activityType ?? node.sport ?? node.type ?? 'Garmin activity'

    const deviceId = activityId !== null && activityId !== undefined ? String(activityId) : ''
    const durationMinutes =
      Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) / 60 : 0
    const kcal = Number(calories)

    let startTime: Date | null = null
    if (Number.isFinite(Number(startSeconds)) && Number(startSeconds) > 0) {
      const millis = Number(startSeconds) > 9_999_999_999 ? Number(startSeconds) : Number(startSeconds) * 1000
      const dt = new Date(millis)
      startTime = Number.isNaN(dt.getTime()) ? null : dt
    } else if (startIso) {
      const dt = new Date(String(startIso))
      startTime = Number.isNaN(dt.getTime()) ? null : dt
    }

    if (deviceId && durationMinutes > 0 && kcal > 0) {
      const key = `${deviceId}:${startTime ? startTime.toISOString() : ''}:${Math.round(durationMinutes)}:${Math.round(kcal)}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({
          deviceId,
          startTime,
          durationMinutes,
          calories: kcal,
          label: String(labelRaw),
          raw: node,
        })
      }
    }

    for (const value of Object.values(node)) {
      visit(value)
    }
  }

  visit(payload)
  return results
}

