const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const OUTPUT_PATH = path.join(ROOT, 'data', 'support-code-index.json')
const INCLUDE_DIRS = ['app', 'lib', 'components', 'data', 'prisma']
const INCLUDE_FILES = ['middleware.ts', 'next.config.js', 'package.json']
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'public',
  'testsprite_tests',
  'database-backup',
  'openai-usage',
])
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.json', '.prisma'])
const MAX_BYTES = 200 * 1024
const MAX_LINES_HEAD = 200
const MAX_LINES_TAIL = 120

function shouldIncludeFile(filePath) {
  if (filePath.includes(`${path.sep}prisma${path.sep}migrations${path.sep}`)) return false
  const ext = path.extname(filePath)
  return EXTENSIONS.has(ext)
}

function walkDir(dirPath, entries) {
  if (!fs.existsSync(dirPath)) return
  const items = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const item of items) {
    if (EXCLUDE_DIRS.has(item.name)) continue
    const fullPath = path.join(dirPath, item.name)
    if (item.isDirectory()) {
      walkDir(fullPath, entries)
      continue
    }
    if (shouldIncludeFile(fullPath)) {
      entries.push(fullPath)
    }
  }
}

function readFileContent(filePath) {
  const stats = fs.statSync(filePath)
  let content = fs.readFileSync(filePath, 'utf8')
  let truncated = false
  if (stats.size > MAX_BYTES) {
    const lines = content.split(/\r?\n/)
    const head = lines.slice(0, MAX_LINES_HEAD)
    const tail = lines.slice(-MAX_LINES_TAIL)
    content = [...head, '', '... [truncated] ...', '', ...tail].join('\n')
    truncated = true
  }
  return {
    content,
    truncated,
    size: stats.size,
  }
}

function buildIndex() {
  const filePaths = []
  INCLUDE_DIRS.forEach((dir) => walkDir(path.join(ROOT, dir), filePaths))
  INCLUDE_FILES.forEach((fileName) => {
    const fullPath = path.join(ROOT, fileName)
    if (fs.existsSync(fullPath)) {
      filePaths.push(fullPath)
    }
  })

  const entries = filePaths
    .map((fullPath) => {
      const relativePath = path.relative(ROOT, fullPath).replace(/\\/g, '/')
      const data = readFileContent(fullPath)
      return {
        path: relativePath,
        content: data.content,
        truncated: data.truncated,
        size: data.size,
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))

  return {
    generatedAt: new Date().toISOString(),
    maxBytes: MAX_BYTES,
    entries,
  }
}

function writeIndex() {
  const index = buildIndex()
  const dir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index))
  console.log(`✅ Support code index written to ${OUTPUT_PATH}`)
}

writeIndex()
