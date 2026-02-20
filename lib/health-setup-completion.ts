type HealthGoalLike = string | { name?: string | null } | null | undefined

export function isVisibleHealthGoalName(name: string): boolean {
  return !!name && !name.startsWith('__')
}

function extractGoalName(goal: HealthGoalLike): string {
  if (typeof goal === 'string') return goal.trim()
  if (!goal || typeof goal !== 'object') return ''
  if (typeof goal.name !== 'string') return ''
  return goal.name.trim()
}

export function countVisibleHealthGoals(goals: HealthGoalLike[] | null | undefined): number {
  if (!Array.isArray(goals)) return 0
  return goals.reduce((count, goal) => {
    const name = extractGoalName(goal)
    return isVisibleHealthGoalName(name) ? count + 1 : count
  }, 0)
}

export function hasBasicProfileData(input: {
  gender?: unknown
  weight?: unknown
  height?: unknown
}): boolean {
  return !!(input.gender && input.weight && input.height)
}

export function isHealthSetupComplete(input: {
  gender?: unknown
  weight?: unknown
  height?: unknown
  goals?: HealthGoalLike[] | null
}): boolean {
  return hasBasicProfileData(input) && countVisibleHealthGoals(input.goals) > 0
}
