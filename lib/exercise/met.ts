export function distanceBasedMet(params: { name: string; speedKmh: number }) {
  const n = (params.name || '').toLowerCase()
  const s = params.speedKmh
  if (!Number.isFinite(s) || s <= 0) return null

  if (n.includes('walk')) {
    if (s < 4) return 2.8
    if (s < 5.5) return 3.3
    if (s < 6.8) return 4.3
    return 6.5
  }

  if (n.includes('run') || n.includes('jog')) {
    if (s < 8.5) return 7.0
    if (s < 9.5) return 8.3
    if (s < 11.5) return 9.8
    return 11.5
  }

  if (n.includes('cycl') || n.includes('bike')) {
    if (s < 16) return 4.0
    if (s < 22) return 8.0
    return 10.0
  }

  return null
}

export function inferMetAndLabel(params: {
  exerciseName: string
  baseMet: number
  durationMinutes: number
  distanceKm?: number | null
}) {
  const durationMins = Math.max(1, Math.floor(params.durationMinutes))
  const distanceKm =
    params.distanceKm !== null && params.distanceKm !== undefined ? Number(params.distanceKm) : null

  let met = params.baseMet
  let label = params.exerciseName

  if (distanceKm && Number.isFinite(distanceKm) && distanceKm > 0) {
    const speedKmh = distanceKm / (durationMins / 60)
    const inferredMet = distanceBasedMet({ name: params.exerciseName, speedKmh })
    if (inferredMet) {
      met = inferredMet
      const lower = params.exerciseName.toLowerCase()
      const base =
        lower.includes('walk')
          ? 'Walking'
          : lower.includes('run') || lower.includes('jog')
          ? 'Running'
          : lower.includes('cycl') || lower.includes('bike')
          ? 'Cycling'
          : params.exerciseName
      label = `${base} (${Math.round(speedKmh * 10) / 10} km/h)`
    }
  }

  return { met, label, durationMinutes: durationMins }
}

