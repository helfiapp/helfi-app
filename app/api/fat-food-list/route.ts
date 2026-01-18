import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

type FatFoodList = {
  good: string[]
  bad: string[]
  none: string[]
}

const parseCsvLine = (line: string) => {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  values.push(current.trim())
  return values
}

const parseFatFoodCsv = (csv: string): FatFoodList => {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) {
    return { good: [], bad: [], none: [] }
  }
  const headers = parseCsvLine(lines[0]).map((value) => value.toLowerCase())
  const foodIndex = headers.indexOf('food')
  const categoryIndex = headers.indexOf('fat_category')
  if (foodIndex === -1 || categoryIndex === -1) {
    return { good: [], bad: [], none: [] }
  }
  const good: string[] = []
  const bad: string[] = []
  const none: string[] = []
  lines.slice(1).forEach((line) => {
    const cols = parseCsvLine(line)
    const food = (cols[foodIndex] || '').trim()
    const category = (cols[categoryIndex] || '').trim().toLowerCase()
    if (!food || !category) return
    if (category === 'good') {
      good.push(food)
      return
    }
    if (category === 'bad') {
      bad.push(food)
      return
    }
    if (category === 'none') {
      none.push(food)
    }
  })
  return { good, bad, none }
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'fat_food_database.csv')
    const csv = await fs.readFile(filePath, 'utf8')
    const list = parseFatFoodCsv(csv)
    return NextResponse.json(list, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { good: [], bad: [], none: [] },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}
