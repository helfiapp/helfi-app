import { NextResponse } from 'next/server'
import { getPractitionerCategories } from '@/lib/practitioner-categories'

function buildTree(categories: Array<{ id: string; name: string; slug: string; parentId: string | null; synonyms: string[]; sortOrder: number }>) {
  const byId = new Map<string, any>()
  const roots: any[] = []

  for (const category of categories) {
    byId.set(category.id, { ...category, children: [] })
  }

  for (const category of categories) {
    const node = byId.get(category.id)
    if (category.parentId) {
      const parent = byId.get(category.parentId)
      if (parent) parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes: any[]) => {
    nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
    nodes.forEach((node) => sortNodes(node.children))
  }

  sortNodes(roots)
  return roots
}

export async function GET() {
  const categories = await getPractitionerCategories()
  const tree = buildTree(categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    synonyms: category.synonyms || [],
    sortOrder: category.sortOrder,
  })))

  return NextResponse.json({ categories: tree })
}
