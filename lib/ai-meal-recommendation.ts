export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'uncategorized'

// Fixed, disclosed cost for generating an AI meal recommendation.
// Credits are wallet "cents" in Helfi's billing system.
export const AI_MEAL_RECOMMENDATION_CREDITS = 6

export const AI_MEAL_RECOMMENDATION_GOAL_NAME = '__AI_MEAL_RECOMMENDATIONS__'

export const AI_MEAL_RECOMMENDATION_HISTORY_LIMIT = 50

// Storage version for the server-persisted AI meal recommendation state.
// v2 introduces "committed" history (only saved recommendations appear).
export const AI_MEAL_RECOMMENDATION_STORAGE_VERSION = 2

export const CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  uncategorized: 'Other',
}

export const normalizeMealCategory = (raw: any): MealCategory => {
  const value = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (/breakfast/.test(value)) return 'breakfast'
  if (/lunch/.test(value)) return 'lunch'
  if (/dinner/.test(value)) return 'dinner'
  if (/snack/.test(value)) return 'snacks'
  if (/uncat/.test(value) || /other/.test(value)) return 'uncategorized'
  return 'uncategorized'
}
