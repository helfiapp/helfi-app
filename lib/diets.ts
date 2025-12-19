export type DietOption = {
  id: string
  label: string
  group: string
  summary: string
}

export type DietCategory = {
  id: string
  label: string
  group: string
  subtitle: string
  icon: string
}

export const DIET_CATEGORIES: DietCategory[] = [
  {
    id: 'animal-focused',
    label: 'Animal-Focused Diets',
    group: 'Animal-Focused',
    subtitle: 'Carnivore, Paleo, Primal',
    icon: 'skillet',
  },
  {
    id: 'plant-based',
    label: 'Plant-Based Diets',
    group: 'Plant-Based',
    subtitle: 'Vegan, Vegetarian, WFPB',
    icon: 'eco',
  },
  {
    id: 'mixed-balanced',
    label: 'Mixed / Balanced Diets',
    group: 'Mixed / Balanced',
    subtitle: 'Mediterranean, Nordic',
    icon: 'restaurant',
  },
  {
    id: 'low-carb',
    label: 'Low-Carb / Carb-Restricted',
    group: 'Low-Carb',
    subtitle: 'Keto, Atkins, Zero-Carb',
    icon: 'egg',
  },
  {
    id: 'grain-gluten',
    label: 'Grain / Gluten / Carb-Free',
    group: 'Grain / Gluten',
    subtitle: 'Gluten-Free, Grain-Free',
    icon: 'grain',
  },
  {
    id: 'timing-based',
    label: 'Calorie / Timing-Based',
    group: 'Timing-Based',
    subtitle: 'Intermittent Fasting, OMAD',
    icon: 'timer',
  },
  {
    id: 'medical-therapeutic',
    label: 'Medical / Therapeutic',
    group: 'Medical / Therapeutic',
    subtitle: 'Diabetic, Low-FODMAP, Renal',
    icon: 'monitor_heart',
  },
  {
    id: 'ethical-lifestyle',
    label: 'Ethical / Lifestyle-Driven',
    group: 'Ethical / Lifestyle',
    subtitle: 'Halal, Kosher, Jain',
    icon: 'public',
  },
  {
    id: 'performance-goal',
    label: 'Performance / Goal-Based',
    group: 'Performance / Goal-Based',
    subtitle: 'High-Protein, Cutting, Bulking',
    icon: 'fitness_center',
  },
]

export const DIET_OPTIONS: DietOption[] = [
  // Animal-Focused
  { id: 'carnivore', label: 'Carnivore', group: 'Animal-Focused', summary: 'Animal foods only.' },
  { id: 'lion', label: 'Lion Diet', group: 'Animal-Focused', summary: 'Ruminant meat, salt, water.' },
  { id: 'keto-carnivore', label: 'Keto Carnivore', group: 'Animal-Focused', summary: 'Carnivore with a fat emphasis.' },
  { id: 'paleo-animal-leaning', label: 'Paleo (Animal-leaning)', group: 'Animal-Focused', summary: 'Meat, fish, eggs, plus some plants.' },
  { id: 'primal', label: 'Primal', group: 'Animal-Focused', summary: 'Paleo plus some dairy.' },

  // Plant-Based
  { id: 'vegan', label: 'Vegan', group: 'Plant-Based', summary: 'No animal products.' },
  { id: 'vegetarian', label: 'Vegetarian', group: 'Plant-Based', summary: 'No meat.' },
  { id: 'lacto-vegetarian', label: 'Lacto-Vegetarian', group: 'Plant-Based', summary: 'Dairy allowed, no eggs or meat.' },
  { id: 'ovo-vegetarian', label: 'Ovo-Vegetarian', group: 'Plant-Based', summary: 'Eggs allowed, no dairy or meat.' },
  { id: 'lacto-ovo-vegetarian', label: 'Lacto-Ovo Vegetarian', group: 'Plant-Based', summary: 'Dairy and eggs allowed, no meat.' },
  { id: 'wfpb', label: 'Whole-Food Plant-Based (WFPB)', group: 'Plant-Based', summary: 'Vegan with minimal processing.' },
  { id: 'raw-vegan', label: 'Raw Vegan', group: 'Plant-Based', summary: 'Mostly uncooked plant foods.' },

  // Mixed / Balanced
  { id: 'omnivore', label: 'Omnivore', group: 'Mixed / Balanced', summary: 'Animal and plant foods.' },
  { id: 'flexitarian', label: 'Flexitarian', group: 'Mixed / Balanced', summary: 'Mostly plant-based, sometimes meat.' },
  { id: 'mediterranean', label: 'Mediterranean', group: 'Mixed / Balanced', summary: 'Fish, olive oil, vegetables, low red meat.' },
  { id: 'nordic', label: 'Nordic Diet', group: 'Mixed / Balanced', summary: 'Fish, root vegetables, whole grains.' },
  { id: 'traditional-ancestral', label: 'Traditional Ancestral Diet', group: 'Mixed / Balanced', summary: 'Region-specific whole foods.' },

  // Low-Carb / Carb-Restricted
  { id: 'keto', label: 'Ketogenic (Keto)', group: 'Low-Carb', summary: 'Very low carb, higher fat.' },
  { id: 'low-carb', label: 'Low-Carb', group: 'Low-Carb', summary: 'Reduced carbs, not strict keto.' },
  { id: 'atkins', label: 'Atkins', group: 'Low-Carb', summary: 'Phased low-carb.' },
  { id: 'zero-carb', label: 'Zero-Carb', group: 'Low-Carb', summary: 'No digestible carbs.' },

  // Grain / Gluten / Carb-Free
  { id: 'gluten-free', label: 'Gluten-Free', group: 'Grain / Gluten', summary: 'Avoid gluten.' },
  { id: 'grain-free', label: 'Grain-Free', group: 'Grain / Gluten', summary: 'Avoid grains.' },
  { id: 'wheat-free', label: 'Wheat-Free', group: 'Grain / Gluten', summary: 'Avoid wheat.' },
  { id: 'low-fodmap', label: 'Low-FODMAP', group: 'Grain / Gluten', summary: 'Gut-focused carb restriction.' },

  // Calorie / Timing-Based
  { id: 'intermittent-fasting', label: 'Intermittent Fasting (IF)', group: 'Timing-Based', summary: 'Eating-window based.' },
  { id: 'omad', label: 'OMAD (One Meal a Day)', group: 'Timing-Based', summary: 'One meal per day.' },
  { id: 'time-restricted', label: 'Time-Restricted Eating', group: 'Timing-Based', summary: 'Eat within a daily time window.' },
  { id: 'calorie-restriction', label: 'Calorie Restriction', group: 'Timing-Based', summary: 'Lower total daily calories.' },

  // Medical / Therapeutic
  { id: 'low-histamine', label: 'Low-Histamine', group: 'Medical / Therapeutic', summary: 'Avoid common histamine triggers.' },
  { id: 'low-oxalate', label: 'Low-Oxalate', group: 'Medical / Therapeutic', summary: 'Avoid high-oxalate foods.' },
  { id: 'low-purine', label: 'Low-Purine', group: 'Medical / Therapeutic', summary: 'Avoid high-purine foods.' },
  { id: 'renal', label: 'Renal Diet', group: 'Medical / Therapeutic', summary: 'Kidney-friendly choices.' },
  { id: 'diabetic', label: 'Diabetic Diet', group: 'Medical / Therapeutic', summary: 'Carb and sugar-aware choices.' },
  { id: 'gerd', label: 'GERD Diet', group: 'Medical / Therapeutic', summary: 'Avoid common reflux triggers.' },

  // Ethical / Lifestyle-Driven
  { id: 'halal', label: 'Halal', group: 'Ethical / Lifestyle', summary: 'Avoid pork and alcohol.' },
  { id: 'kosher', label: 'Kosher', group: 'Ethical / Lifestyle', summary: 'Avoid pork and shellfish; don’t mix meat and dairy.' },
  { id: 'jain', label: 'Jain Diet', group: 'Ethical / Lifestyle', summary: 'No meat, eggs, or root vegetables.' },
  { id: 'buddhist-vegetarian', label: 'Buddhist Vegetarian', group: 'Ethical / Lifestyle', summary: 'Vegetarian; often avoids garlic/onion.' },

  // Performance / Goal-Based
  { id: 'bodybuilding', label: 'Bodybuilding Diet', group: 'Performance / Goal-Based', summary: 'High-protein, structured meals.' },
  { id: 'high-protein', label: 'High-Protein Diet', group: 'Performance / Goal-Based', summary: 'Protein-focused.' },
  { id: 'cutting-bulking', label: 'Cutting / Bulking Diets', group: 'Performance / Goal-Based', summary: 'Adjust calories for goals.' },
  { id: 'athlete', label: 'Athlete-Specific Diets', group: 'Performance / Goal-Based', summary: 'Fuel for training and recovery.' },
]

export const getDietOption = (id: string | null | undefined): DietOption | null => {
  const key = (id || '').toString().trim()
  if (!key) return null
  return DIET_OPTIONS.find((d) => d.id === key) || null
}

export const normalizeDietTypes = (raw: any): string[] => {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .filter((v) => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    )
  }
  if (typeof raw === 'string') {
    const v = raw.trim()
    return v ? [v] : []
  }
  return []
}

type DietCheckInput = {
  dietId: string
  itemNames?: string[]
  analysisText?: string
  totals?: {
    calories?: any
    protein_g?: any
    carbs_g?: any
    fat_g?: any
    fiber_g?: any
    sugar_g?: any
  } | null
}

export type DietCheckResult = {
  warnings: string[]
  suggestions: string[]
}

const lower = (value: any) => (value || '').toString().toLowerCase()

const hasAny = (text: string, keywords: string[]) => keywords.some((k) => text.includes(k))

const normalizeTextBlob = (input: DietCheckInput) => {
  const names = Array.isArray(input.itemNames) ? input.itemNames : []
  const blob = `${input.analysisText || ''} ${names.join(' ')}`.toLowerCase()
  return blob.replace(/\s+/g, ' ').trim()
}

const KEYWORDS = {
  meat: [
    'beef',
    'steak',
    'pork',
    'bacon',
    'ham',
    'sausage',
    'chicken',
    'turkey',
    'duck',
    'lamb',
    'mutton',
    'venison',
    'veal',
    'salami',
    'pepperoni',
  ],
  fishSeafood: ['fish', 'salmon', 'tuna', 'cod', 'trout', 'anchovy', 'sardine', 'shrimp', 'prawn', 'crab', 'lobster', 'shellfish', 'mussel', 'oyster'],
  dairy: ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'ghee', 'whey', 'casein', 'ice cream'],
  eggs: ['egg', 'eggs', 'omelet', 'omelette', 'mayo', 'mayonnaise'],
  honey: ['honey'],
  grains: ['bread', 'bun', 'pasta', 'noodle', 'rice', 'oat', 'barley', 'rye', 'wheat', 'flour', 'cereal', 'cracker', 'wrap', 'tortilla'],
  gluten: ['gluten', 'wheat', 'barley', 'rye', 'malt', 'semolina', 'spelt'],
  legumes: ['bean', 'beans', 'lentil', 'chickpea', 'soy', 'tofu', 'tempeh', 'edamame'],
  plantsCommon: ['salad', 'vegetable', 'veg', 'fruit', 'apple', 'banana', 'berries', 'tomato', 'broccoli', 'carrot', 'spinach', 'potato', 'rice', 'bread'],
  roots: ['potato', 'onion', 'garlic', 'carrot', 'beet', 'turnip', 'radish', 'ginger'],
  alcohol: ['beer', 'wine', 'whiskey', 'vodka', 'rum', 'gin', 'tequila', 'brandy', 'cider'],
  sugary: ['cake', 'cookie', 'candy', 'soda', 'soft drink', 'syrup', 'sweet', 'chocolate', 'ice cream', 'dessert', 'pastry', 'donut', 'doughnut'],
  processed: ['chips', 'crisps', 'soda', 'soft drink', 'candy', 'fast food', 'instant', 'processed'],
  refluxTriggers: ['spicy', 'chili', 'pepperoni', 'coffee', 'caffeine', 'tomato', 'citrus', 'orange', 'lemon', 'lime', 'chocolate', 'mint', 'fried'],
  lowFodmapCommon: ['garlic', 'onion', 'wheat', 'apple', 'pear', 'milk', 'honey', 'beans', 'lentil', 'chickpea'],
  histamineCommon: ['aged cheese', 'parmesan', 'salami', 'pepperoni', 'smoked', 'fermented', 'soy sauce', 'vinegar', 'wine', 'beer', 'tuna', 'sardine', 'tomato'],
  oxalateCommon: ['spinach', 'beet', 'almond', 'cashew', 'chocolate', 'rhubarb', 'sweet potato'],
  purineCommon: ['liver', 'organ', 'anchovy', 'sardine', 'mackerel', 'mussel', 'beer'],
  renalCommon: ['banana', 'potato', 'tomato', 'orange', 'avocado', 'spinach'],
  ruminant: ['beef', 'steak', 'lamb', 'mutton', 'bison', 'venison'],
  nonRuminantAnimal: ['chicken', 'turkey', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'egg'],
}

const addSuggestion = (suggestions: string[], value: string) => {
  const clean = value.trim()
  if (!clean) return
  if (!suggestions.includes(clean)) suggestions.push(clean)
}

export const checkDietCompatibility = (input: DietCheckInput): DietCheckResult => {
  const dietId = (input.dietId || '').toString().trim()
  const warnings: string[] = []
  const suggestions: string[] = []
  if (!dietId) return { warnings, suggestions }

  const option = getDietOption(dietId)
  const blob = normalizeTextBlob(input)
  const carbs = Number(input.totals?.carbs_g)
  const sugar = Number(input.totals?.sugar_g)
  const hasMeat = hasAny(blob, KEYWORDS.meat)
  const hasFish = hasAny(blob, KEYWORDS.fishSeafood)
  const hasDairy = hasAny(blob, KEYWORDS.dairy)
  const hasEggs = hasAny(blob, KEYWORDS.eggs)
  const hasGluten = hasAny(blob, KEYWORDS.gluten)
  const hasGrains = hasAny(blob, KEYWORDS.grains)

  const maybeWarn = (condition: boolean, text: string) => {
    if (!condition) return
    warnings.push(text)
  }

  const basicSwapForAnimalProduct = () => {
    addSuggestion(suggestions, 'Try tofu, tempeh, beans, or lentils as a swap.')
    addSuggestion(suggestions, 'Try a plant-based milk or yogurt instead of dairy.')
  }

  switch (dietId) {
    // Plant-based
    case 'vegan':
      maybeWarn(hasMeat || hasFish, 'This looks like it contains meat or seafood, which doesn’t fit a vegan diet.')
      maybeWarn(hasDairy, 'This looks like it contains dairy, which doesn’t fit a vegan diet.')
      maybeWarn(hasEggs, 'This looks like it contains eggs, which doesn’t fit a vegan diet.')
      maybeWarn(hasAny(blob, KEYWORDS.honey), 'This looks like it contains honey, which doesn’t fit a vegan diet.')
      if (warnings.length) basicSwapForAnimalProduct()
      break
    case 'vegetarian':
      maybeWarn(hasMeat || hasFish, 'This looks like it contains meat or seafood, which doesn’t fit a vegetarian diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try tofu, tempeh, beans, or lentils as a swap for meat.')
      break
    case 'lacto-vegetarian':
      maybeWarn(hasMeat || hasFish, 'This looks like it contains meat or seafood, which doesn’t fit a lacto-vegetarian diet.')
      maybeWarn(hasEggs, 'This looks like it contains eggs, which doesn’t fit a lacto-vegetarian diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try beans or lentils instead of meat, and skip eggs.')
      break
    case 'ovo-vegetarian':
      maybeWarn(hasMeat || hasFish, 'This looks like it contains meat or seafood, which doesn’t fit an ovo-vegetarian diet.')
      maybeWarn(hasDairy, 'This looks like it contains dairy, which doesn’t fit an ovo-vegetarian diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try a dairy-free version (or swap dairy for a plant-based option).')
      break
    case 'lacto-ovo-vegetarian':
      maybeWarn(hasMeat || hasFish, 'This looks like it contains meat or seafood, which doesn’t fit a lacto-ovo vegetarian diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try beans, lentils, or tofu as a swap for meat.')
      break
    case 'wfpb':
      maybeWarn(hasMeat || hasFish || hasDairy || hasEggs, 'This looks like it contains animal products, which doesn’t fit a whole-food plant-based diet.')
      maybeWarn(hasAny(blob, KEYWORDS.processed), 'This looks quite processed. Whole-food plant-based usually prefers less processed foods.')
      if (warnings.length) addSuggestion(suggestions, 'Try a whole-food option (beans, lentils, vegetables, whole grains) instead.')
      break
    case 'raw-vegan':
      maybeWarn(hasMeat || hasFish || hasDairy || hasEggs, 'This looks like it contains animal products, which doesn’t fit a raw vegan diet.')
      maybeWarn(/fried|roast|baked|grilled|cooked/.test(blob), 'This looks cooked. Raw vegan is usually uncooked foods.')
      if (warnings.length) addSuggestion(suggestions, 'Try raw options like salads, smoothies, or fresh fruit.')
      break

    // Animal-focused
    case 'carnivore':
      maybeWarn(hasAny(blob, KEYWORDS.plantsCommon) || hasGrains, 'This looks like it contains plant foods, which doesn’t fit a carnivore diet.')
      if (Number.isFinite(carbs) && carbs > 10) {
        warnings.push('This looks higher in carbs than most carnivore meals.')
      }
      if (Number.isFinite(sugar) && sugar > 5) {
        warnings.push('This looks higher in sugar than most carnivore meals.')
      }
      if (warnings.length) addSuggestion(suggestions, 'Try a simple meat-only meal (e.g. steak, eggs, fish).')
      break
    case 'lion':
      maybeWarn(hasAny(blob, KEYWORDS.nonRuminantAnimal) || hasAny(blob, KEYWORDS.plantsCommon) || hasDairy, 'Lion diet is usually ruminant meat only (plus salt/water). This meal may not fit.')
      if (Number.isFinite(carbs) && carbs > 10) {
        warnings.push('This looks higher in carbs than most lion diet meals.')
      }
      if (Number.isFinite(sugar) && sugar > 5) {
        warnings.push('This looks higher in sugar than most lion diet meals.')
      }
      if (warnings.length) addSuggestion(suggestions, 'Try beef or lamb (simple, unseasoned) as a swap.')
      break
    case 'keto-carnivore':
      maybeWarn(hasAny(blob, KEYWORDS.plantsCommon) || hasGrains, 'This looks like it contains plant foods, which may not fit keto carnivore.')
      if (Number.isFinite(carbs) && carbs > 20) {
        warnings.push('This looks higher in carbs than most keto carnivore meals.')
      }
      if (warnings.length) addSuggestion(suggestions, 'Try a fatty cut of meat with eggs or butter (if you allow dairy).')
      break
    case 'paleo-animal-leaning':
      maybeWarn(hasGrains, 'Paleo usually avoids grains. This meal may not fit.')
      maybeWarn(hasAny(blob, ['processed', 'soda', 'candy']), 'Paleo usually avoids processed foods. This meal may not fit.')
      if (warnings.length) addSuggestion(suggestions, 'Try meat/fish with vegetables instead of grains.')
      break
    case 'primal':
      maybeWarn(hasGrains, 'Primal usually avoids grains. This meal may not fit.')
      if (warnings.length) addSuggestion(suggestions, 'Try meat/fish with vegetables; some dairy is usually okay for primal.')
      break

    // Low-carb
    case 'keto':
      if (Number.isFinite(carbs) && carbs > 40) {
        warnings.push('This looks higher in carbs than most keto meals.')
        addSuggestion(suggestions, 'Try a lower-carb swap (more protein/veg, less bread/rice/pasta).')
      } else if (hasAny(blob, KEYWORDS.grains) || hasAny(blob, KEYWORDS.sugary)) {
        warnings.push('This looks like it contains bread, pasta, rice, or sweets, which often don’t fit keto.')
        addSuggestion(suggestions, 'Try a low-carb swap (salad, cauliflower rice, or extra veggies).')
      }
      break
    case 'low-carb':
      if (Number.isFinite(carbs) && carbs > 80) {
        warnings.push('This looks high in carbs for a low-carb diet.')
        addSuggestion(suggestions, 'Try smaller portions of bread/rice/pasta, and add more protein/veg.')
      }
      break
    case 'atkins':
      if (hasAny(blob, KEYWORDS.sugary) || hasAny(blob, KEYWORDS.grains)) {
        warnings.push('This looks like it contains bread/pasta/sweets, which may not fit Atkins (depending on your phase).')
        addSuggestion(suggestions, 'Try a lower-carb swap (salad, protein, vegetables).')
      }
      break
    case 'zero-carb':
      maybeWarn(Number.isFinite(carbs) ? carbs > 5 : hasAny(blob, KEYWORDS.grains) || hasAny(blob, KEYWORDS.sugary), 'This looks like it contains carbs, which may not fit zero-carb.')
      if (warnings.length) addSuggestion(suggestions, 'Try a meat/egg/fish-based meal with no bread, rice, or fruit.')
      break

    // Grain / gluten
    case 'gluten-free':
      maybeWarn(hasGluten, 'This looks like it may contain gluten, which doesn’t fit a gluten-free diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try a gluten-free version (gluten-free bread/pasta) or a rice/potato swap.')
      break
    case 'grain-free':
      maybeWarn(hasGrains, 'This looks like it contains grains, which doesn’t fit a grain-free diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try a grain-free swap (vegetables, potatoes, or salad).')
      break
    case 'wheat-free':
      maybeWarn(hasAny(blob, ['wheat', 'flour', 'bread', 'pasta', 'noodle']), 'This looks like it may contain wheat, which doesn’t fit a wheat-free diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try a wheat-free version (gluten-free bread/pasta) or rice.')
      break
    case 'low-fodmap':
      maybeWarn(hasAny(blob, KEYWORDS.lowFodmapCommon), 'This may include common high-FODMAP foods (like garlic, onion, wheat, beans, milk, or certain fruits).')
      if (warnings.length) addSuggestion(suggestions, 'Try a simpler version without garlic/onion, and use gluten-free grains if needed.')
      break

    // Timing-based (no food-specific conflicts)
    case 'intermittent-fasting':
    case 'omad':
    case 'time-restricted':
    case 'calorie-restriction':
      // No specific “against the diet” food keywords here.
      break

    // Medical / therapeutic
    case 'low-histamine':
      maybeWarn(hasAny(blob, KEYWORDS.histamineCommon), 'This may include common histamine triggers (like aged cheese, fermented foods, alcohol, or certain fish).')
      if (warnings.length) addSuggestion(suggestions, 'Try fresh, simple foods (fresh meat, rice, most vegetables).')
      break
    case 'low-oxalate':
      maybeWarn(hasAny(blob, KEYWORDS.oxalateCommon), 'This may include high-oxalate foods (like spinach, almonds, or chocolate).')
      if (warnings.length) addSuggestion(suggestions, 'Try a lower-oxalate swap (most meats, dairy, and many vegetables).')
      break
    case 'low-purine':
      maybeWarn(hasAny(blob, KEYWORDS.purineCommon), 'This may include high-purine foods (like organ meats, sardines, or beer).')
      if (warnings.length) addSuggestion(suggestions, 'Try lean proteins and plenty of water.')
      break
    case 'renal':
      maybeWarn(hasAny(blob, KEYWORDS.renalCommon), 'This may include foods that can be tricky on a renal diet (like banana, potato, tomato, or avocado).')
      if (warnings.length) addSuggestion(suggestions, 'Consider kidney-friendly swaps based on your plan (ask your clinician for the exact rules).')
      break
    case 'diabetic':
      if (Number.isFinite(sugar) && sugar > 25) {
        warnings.push('This looks high in sugar for a diabetic-friendly meal.')
        addSuggestion(suggestions, 'Try a lower-sugar swap (more protein/veg, fewer sweets).')
      } else if (Number.isFinite(carbs) && carbs > 80) {
        warnings.push('This looks high in carbs for a diabetic-friendly meal.')
        addSuggestion(suggestions, 'Try smaller portions of bread/rice/pasta and add more protein/veg.')
      }
      break
    case 'gerd':
      maybeWarn(hasAny(blob, KEYWORDS.refluxTriggers), 'This may include common reflux triggers (spicy foods, coffee, citrus, tomato, chocolate, or fried foods).')
      if (warnings.length) addSuggestion(suggestions, 'Try a milder version (less spicy, less fried, smaller portions).')
      break

    // Ethical / lifestyle
    case 'halal':
      maybeWarn(hasAny(blob, ['pork', 'bacon', 'ham']), 'This looks like it contains pork, which doesn’t fit halal.')
      maybeWarn(hasAny(blob, KEYWORDS.alcohol), 'This looks like it contains alcohol, which doesn’t fit halal.')
      if (warnings.length) addSuggestion(suggestions, 'Try a halal-certified option (chicken, beef, or lamb) and skip alcohol.')
      break
    case 'kosher': {
      const hasPork = hasAny(blob, ['pork', 'bacon', 'ham'])
      const hasShellfish = hasAny(blob, ['shrimp', 'prawn', 'crab', 'lobster', 'shellfish', 'mussel', 'oyster'])
      maybeWarn(hasPork, 'This looks like it contains pork, which doesn’t fit kosher.')
      maybeWarn(hasShellfish, 'This looks like it contains shellfish, which doesn’t fit kosher.')
      // Very simple meat + dairy mixing check
      const meatish = hasMeat || hasFish
      const dairyish = hasDairy
      maybeWarn(meatish && dairyish, 'This may mix meat and dairy, which doesn’t fit kosher rules.')
      if (warnings.length) addSuggestion(suggestions, 'Try a kosher-certified version (and avoid mixing meat and dairy).')
      break
    }
    case 'jain':
      maybeWarn(hasMeat || hasFish, 'This looks like it contains meat or seafood, which doesn’t fit a Jain diet.')
      maybeWarn(hasEggs, 'This looks like it contains eggs, which doesn’t fit a Jain diet.')
      maybeWarn(hasAny(blob, KEYWORDS.roots), 'This may include root vegetables (like onion, garlic, or potato), which often don’t fit a Jain diet.')
      if (warnings.length) addSuggestion(suggestions, 'Try Jain-friendly meals with non-root vegetables, legumes, and grains (as allowed).')
      break
    case 'buddhist-vegetarian':
      maybeWarn(hasMeat || hasFish, 'This looks like it contains meat or seafood, which may not fit Buddhist vegetarian choices.')
      maybeWarn(hasAny(blob, ['garlic', 'onion']), 'Some Buddhist vegetarian plans avoid garlic/onion. This meal may not fit.')
      if (warnings.length) addSuggestion(suggestions, 'Try a vegetarian version without garlic/onion if that matters for you.')
      break

    // Mixed / balanced + performance (no strict checks)
    default:
      // For all other diet IDs, keep it quiet unless we can offer something helpful.
      break
  }

  return { warnings, suggestions }
}

export type MultiDietCheckResult = {
  warningsByDiet: Array<{ dietId: string; dietLabel: string; warnings: string[] }>
  suggestions: string[]
}

export const checkMultipleDietCompatibility = (input: Omit<DietCheckInput, 'dietId'> & { dietIds: string[] }): MultiDietCheckResult => {
  const dietIds = normalizeDietTypes(input.dietIds)
  const warningsByDiet: Array<{ dietId: string; dietLabel: string; warnings: string[] }> = []
  const suggestions: string[] = []

  for (const dietId of dietIds) {
    const option = getDietOption(dietId)
    const single = checkDietCompatibility({
      dietId,
      itemNames: input.itemNames,
      analysisText: input.analysisText,
      totals: input.totals,
    })
    if (single.warnings.length) {
      warningsByDiet.push({
        dietId,
        dietLabel: option?.label || dietId,
        warnings: single.warnings,
      })
    }
    for (const s of single.suggestions) {
      if (!suggestions.includes(s)) suggestions.push(s)
    }
  }

  return { warningsByDiet, suggestions }
}
