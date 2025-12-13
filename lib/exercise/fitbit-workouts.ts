export function parseFitbitActivitiesToIngest(params: { date: string; payload: any }) {
  const items = Array.isArray(params.payload?.activities) ? params.payload.activities : []
  return items
    .map((a: any) => {
      const logId = a?.logId ?? a?.activityLogId ?? a?.id
      const deviceId = logId !== null && logId !== undefined ? String(logId) : ''
      const startTimeRaw = a?.startTime || a?.startDate || a?.originalStartTime
      const startTime = startTimeRaw ? new Date(String(startTimeRaw)) : null
      const durationMs = Number(a?.duration ?? a?.activeDuration ?? 0)
      const durationMinutes = Number.isFinite(durationMs) ? durationMs / 60000 : 0
      const calories = Number(a?.calories ?? a?.activityCalories ?? a?.caloriesOut ?? 0)
      const label = String(a?.activityName || a?.name || a?.activityTypeName || 'Fitbit activity')

      if (!deviceId) return null
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null
      if (!Number.isFinite(calories) || calories <= 0) return null

      // Fitbit list can span multiple dates; filter to selected date when startTime is present.
      if (startTime && !Number.isNaN(startTime.getTime())) {
        const d = `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, '0')}-${String(startTime.getDate()).padStart(2, '0')}`
        if (d !== params.date) return null
      }

      return {
        deviceId,
        startTime: startTime && !Number.isNaN(startTime.getTime()) ? startTime : null,
        durationMinutes,
        calories,
        label,
        raw: a,
      }
    })
    .filter(Boolean)
}

