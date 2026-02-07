import { syncFastFoodMenus } from '../lib/food/fast-food-sync'

const main = async () => {
  const args = process.argv.slice(2)
  const getArg = (name: string) => {
    const idx = args.findIndex((v) => v === name)
    if (idx === -1) return null
    return args[idx + 1] ?? null
  }

  const country = getArg('--country')
  const chain = getArg('--chain')

  const result = await syncFastFoodMenus({ country, chain })
  console.log(JSON.stringify(result, null, 2))
  if (result.errors > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Fast-food sync failed:', error)
  process.exit(1)
})
