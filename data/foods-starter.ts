// Minimal in-app starter list for ingredient search.
// Values are per 1 serving indicated by serving_size.
export type StarterFood = {
  name: string
  brand?: string | null
  serving_size: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  sugar_g?: number
}

export const STARTER_FOODS: StarterFood[] = [
  // Breakfast basics
  { name: 'Scrambled eggs', serving_size: '1 large egg', calories: 70, protein_g: 6, carbs_g: 0.4, fat_g: 5, fiber_g: 0, sugar_g: 0 },
  { name: 'Bacon', serving_size: '1 slice', calories: 42, protein_g: 3, carbs_g: 0.1, fat_g: 3.3, fiber_g: 0, sugar_g: 0 },
  { name: 'Bagel', serving_size: '1 whole', calories: 270, protein_g: 10, carbs_g: 53, fat_g: 1.5, fiber_g: 2, sugar_g: 6 },
  { name: 'Sesame Bagel', serving_size: '1 whole', calories: 270, protein_g: 10, carbs_g: 53, fat_g: 1.5, fiber_g: 2, sugar_g: 6 },
  { name: 'Orange juice', serving_size: '8 oz', calories: 112, protein_g: 2, carbs_g: 26, fat_g: 0.5, fiber_g: 0.5, sugar_g: 21 },
  { name: 'Whole wheat toast', serving_size: '1 slice', calories: 80, protein_g: 4, carbs_g: 14, fat_g: 1, fiber_g: 2, sugar_g: 2 },
  { name: 'Butter', serving_size: '1 tbsp', calories: 102, protein_g: 0.1, carbs_g: 0, fat_g: 11.5, fiber_g: 0, sugar_g: 0 },
  // Common proteins
  { name: 'Grilled chicken breast', serving_size: '6 oz', calories: 276, protein_g: 52, carbs_g: 0, fat_g: 6, fiber_g: 0, sugar_g: 0 },
  { name: 'Salmon (grilled)', serving_size: '6 oz', calories: 367, protein_g: 39, carbs_g: 0, fat_g: 22, fiber_g: 0, sugar_g: 0 },
  { name: 'Lean ground beef (cooked)', serving_size: '4 oz', calories: 250, protein_g: 26, carbs_g: 0, fat_g: 17, fiber_g: 0, sugar_g: 0 },
  // Starches and grains
  { name: 'Brown rice (cooked)', serving_size: '1 cup', calories: 216, protein_g: 5, carbs_g: 45, fat_g: 1.8, fiber_g: 3.5, sugar_g: 1 },
  { name: 'White rice (cooked)', serving_size: '1 cup', calories: 205, protein_g: 4.3, carbs_g: 45, fat_g: 0.4, fiber_g: 0.6, sugar_g: 0.1 },
  { name: 'Pasta (cooked)', serving_size: '1 cup', calories: 221, protein_g: 8, carbs_g: 43, fat_g: 1.3, fiber_g: 2.5, sugar_g: 0.8 },
  { name: 'Quinoa (cooked)', serving_size: '1 cup', calories: 222, protein_g: 8, carbs_g: 39, fat_g: 3.6, fiber_g: 5, sugar_g: 1.6 },
  // Vegetables
  { name: 'Broccoli (steamed)', serving_size: '1 cup', calories: 55, protein_g: 3.7, carbs_g: 11, fat_g: 0.6, fiber_g: 5.1, sugar_g: 2.2 },
  { name: 'Mixed salad greens', serving_size: '2 cups', calories: 16, protein_g: 1.2, carbs_g: 3, fat_g: 0.2, fiber_g: 1.8, sugar_g: 1.5 },
  { name: 'Avocado', serving_size: '1/2 medium', calories: 120, protein_g: 1.5, carbs_g: 6, fat_g: 11, fiber_g: 5, sugar_g: 0.2 },
  // Dairy
  { name: 'Greek yogurt (plain, nonfat)', serving_size: '1 cup', calories: 130, protein_g: 23, carbs_g: 9, fat_g: 0, fiber_g: 0, sugar_g: 7 },
  { name: 'Cheddar cheese', serving_size: '1 oz', calories: 114, protein_g: 7, carbs_g: 0.9, fat_g: 9.4, fiber_g: 0, sugar_g: 0.2 },
  // Fruits
  { name: 'Banana', serving_size: '1 medium', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, fiber_g: 3.1, sugar_g: 14.4 },
  { name: 'Apple', serving_size: '1 medium', calories: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4, sugar_g: 19 },
  // Drinks
  { name: 'Black coffee', serving_size: '8 oz', calories: 2, protein_g: 0.3, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 },
  { name: 'Whole milk', serving_size: '1 cup', calories: 150, protein_g: 8, carbs_g: 12, fat_g: 8, fiber_g: 0, sugar_g: 12 },
]

