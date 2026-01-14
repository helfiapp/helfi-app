import { prisma } from '@/lib/prisma'
import { PRACTITIONER_CATEGORIES, PractitionerCategorySeed } from '@/data/practitioner-categories'

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function buildCategorySlug(parentSlug: string | null, seedSlug: string): string {
  const base = normalizeSlug(seedSlug)
  return parentSlug ? `${parentSlug}-${base}` : base
}

async function createCategoryTree(parent: { id: string; slug: string } | null, seed: PractitionerCategorySeed, sortOrder: number) {
  const slug = buildCategorySlug(parent?.slug || null, seed.slug)
  const created = await prisma.practitionerCategory.create({
    data: {
      name: seed.name,
      slug,
      parentId: parent?.id || null,
      synonyms: seed.synonyms || [],
      sortOrder,
    },
  })

  if (seed.children?.length) {
    let childOrder = 0
    for (const child of seed.children) {
      await createCategoryTree(created, child, childOrder++)
    }
  }

  return created
}

export async function ensurePractitionerCategories() {
  const existing = await prisma.practitionerCategory.count()
  if (existing > 0) return

  let order = 0
  for (const category of PRACTITIONER_CATEGORIES) {
    await createCategoryTree(null, category, order++)
  }
}

export async function getPractitionerCategories() {
  await ensurePractitionerCategories()

  return prisma.practitionerCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}
