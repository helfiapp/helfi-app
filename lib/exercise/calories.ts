export function calculateExerciseCalories(params: {
  met: number
  weightKg: number
  durationMinutes: number
}) {
  const durationHours = params.durationMinutes / 60
  return params.met * params.weightKg * durationHours
}

