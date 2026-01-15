import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const categories = await prisma.practitionerCategory.findMany({
    where: {
      parentId: null,
    },
    include: {
      children: {
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: {
      sortOrder: 'asc',
    },
  })

  const results = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    children: category.children.map((child) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
    })),
  }))

  return NextResponse.json({ results })
}
