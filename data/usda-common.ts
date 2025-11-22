// Curated USDA-backed entries for common foods to avoid repeated API calls.
// Values are per serving as noted by serving_size.
export type CommonFood = {
  name: string
  serving_size: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  sugar_g?: number
}

export const COMMON_USDA_FOODS: CommonFood[] = [
  // Burger components
  { name: 'Burger bun', serving_size: '1 medium bun (70 g)', calories: 150, protein_g: 5, carbs_g: 28, fat_g: 3, fiber_g: 1, sugar_g: 3 },
  // 80/20 cooked: ~430-460 kcal; use 450 to avoid underestimates
  { name: 'Beef patty (6 oz)', serving_size: '6 oz (cooked)', calories: 450, protein_g: 32, carbs_g: 0, fat_g: 33, fiber_g: 0, sugar_g: 0 },
  // Typical American/cheddar slice
  { name: 'Cheese slice', serving_size: '1 slice (28 g)', calories: 110, protein_g: 6, carbs_g: 1, fat_g: 9, fiber_g: 0, sugar_g: 0 },
  { name: 'Lettuce', serving_size: '1 leaf (5 g)', calories: 1, protein_g: 0.1, carbs_g: 0.2, fat_g: 0, fiber_g: 0.1, sugar_g: 0 },
  { name: 'Pickles', serving_size: '1 slice (9 g)', calories: 2, protein_g: 0.1, carbs_g: 0.4, fat_g: 0, fiber_g: 0.2, sugar_g: 0.2 },
  { name: 'Red onion', serving_size: '1 slice (10 g)', calories: 4, protein_g: 0.1, carbs_g: 1, fat_g: 0, fiber_g: 0.2, sugar_g: 0.4 },
  { name: 'Ketchup (1 tbsp)', serving_size: '1 tbsp (17 g)', calories: 20, protein_g: 0.2, carbs_g: 5, fat_g: 0, fiber_g: 0, sugar_g: 4 },
  // Breakfast staples (extras)
  { name: 'Plain bagel', serving_size: '1 whole', calories: 270, protein_g: 10, carbs_g: 53, fat_g: 1.5, fiber_g: 2, sugar_g: 6 },
  { name: 'Sesame bagel', serving_size: '1 whole', calories: 270, protein_g: 10, carbs_g: 53, fat_g: 1.5, fiber_g: 2, sugar_g: 6 },
]
