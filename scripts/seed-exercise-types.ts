import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type SeedExerciseType = {
  name: string
  category: string
  met: number
  intensity?: 'light' | 'moderate' | 'vigorous'
}

const EXERCISE_TYPES: SeedExerciseType[] = [
  // Cardio
  { category: 'Cardio', name: 'Walking, 5 km/h', met: 3.3, intensity: 'light' },
  { category: 'Cardio', name: 'Walking, brisk, 6.5 km/h', met: 4.3, intensity: 'moderate' },
  { category: 'Cardio', name: 'Jogging, 8 km/h', met: 8.3, intensity: 'vigorous' },
  { category: 'Cardio', name: 'Running, 10 km/h', met: 9.8, intensity: 'vigorous' },
  { category: 'Cardio', name: 'Stair climbing', met: 8.8, intensity: 'vigorous' },
  { category: 'Cardio', name: 'Rowing machine, moderate', met: 7.0, intensity: 'vigorous' },
  { category: 'Cardio', name: 'Elliptical trainer, moderate', met: 5.0, intensity: 'moderate' },

  // Outdoor Activity
  { category: 'Outdoor Activity', name: 'Hiking', met: 6.0, intensity: 'vigorous' },
  { category: 'Outdoor Activity', name: 'Gardening', met: 4.0, intensity: 'moderate' },

  // Transportation
  { category: 'Transportation', name: 'Cycling, leisure, 19–22 km/h', met: 8.0, intensity: 'vigorous' },
  { category: 'Transportation', name: 'Cycling, easy', met: 4.0, intensity: 'moderate' },

  // Gym
  { category: 'Gym', name: 'Stationary bike, moderate', met: 7.0, intensity: 'vigorous' },
  { category: 'Gym', name: 'Spin class', met: 8.5, intensity: 'vigorous' },

  // Strength And Mobility
  { category: 'Strength And Mobility', name: 'Weight training, general', met: 3.5, intensity: 'moderate' },
  { category: 'Strength And Mobility', name: 'Circuit training', met: 8.0, intensity: 'vigorous' },
  { category: 'Strength And Mobility', name: 'HIIT', met: 8.5, intensity: 'vigorous' },
  { category: 'Strength And Mobility', name: 'Yoga', met: 2.5, intensity: 'light' },
  { category: 'Strength And Mobility', name: 'Pilates', met: 3.0, intensity: 'moderate' },
  { category: 'Strength And Mobility', name: 'Stretching / mobility', met: 2.3, intensity: 'light' },

  // Individual Sport
  { category: 'Individual Sport', name: 'Swimming, moderate', met: 6.0, intensity: 'vigorous' },
  { category: 'Individual Sport', name: 'Tennis, singles', met: 8.0, intensity: 'vigorous' },

  // Team Sport
  { category: 'Team Sport', name: 'Soccer', met: 7.0, intensity: 'vigorous' },
  { category: 'Team Sport', name: 'Basketball', met: 6.5, intensity: 'vigorous' },

  // Household Activity
  { category: 'Household Activity', name: 'House cleaning', met: 3.0, intensity: 'light' },
  { category: 'Household Activity', name: 'Carrying groceries', met: 3.5, intensity: 'moderate' },

  // Occupational Activity
  { category: 'Occupational Activity', name: 'Standing, light work', met: 2.3, intensity: 'light' },
]

async function main() {
  const unique = new Map<string, SeedExerciseType>()
  for (const type of EXERCISE_TYPES) {
    unique.set(`${type.category}::${type.name}`, type)
  }

  await prisma.exerciseType.createMany({
    data: Array.from(unique.values()).map((t) => ({
      name: t.name,
      category: t.category,
      met: t.met,
      intensity: t.intensity ?? null,
      isCustom: false,
    })),
    skipDuplicates: true,
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })

