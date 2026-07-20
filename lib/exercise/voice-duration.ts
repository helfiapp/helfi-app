function positiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function estimateVoiceExerciseDurationMinutes(params: {
  exerciseName?: unknown
  steps?: unknown
  caloriesKcal?: unknown
}) {
  const name = String(params.exerciseName || '').toLowerCase()
  const steps = positiveNumber(params.steps)
  const caloriesKcal = positiveNumber(params.caloriesKcal)

  if (steps) {
    const stepsPerMinute = /run|jog/.test(name) ? 160 : 100
    return Math.max(1, Math.min(24 * 60, Math.round(steps / stepsPerMinute)))
  }

  if (caloriesKcal) {
    const caloriesPerMinute = /run|jog/.test(name)
      ? 10
      : /cycl|bike|ride/.test(name)
      ? 8
      : /gym|strength|weight|workout/.test(name)
      ? 7
      : 5
    return Math.max(1, Math.min(24 * 60, Math.round(caloriesKcal / caloriesPerMinute)))
  }

  return null
}
