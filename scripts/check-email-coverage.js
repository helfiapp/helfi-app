const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const sourceRoots = ['app', 'lib']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const adapterPath = path.join(projectRoot, 'lib', 'email-client.ts')

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(fullPath)
    return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : []
  })
}

const sourceFiles = sourceRoots.flatMap((root) => collectSourceFiles(path.join(projectRoot, root)))
const directProviderPattern = /(?:from\s+['"]resend['"]|require\(\s*['"]resend['"]\s*\)|api\.resend\.com)/
const sendPattern = /\.emails\.send\s*\(/g
const failures = []
let sendCallCount = 0
let sendingFileCount = 0

for (const filePath of sourceFiles) {
  const source = fs.readFileSync(filePath, 'utf8')
  const relativePath = path.relative(projectRoot, filePath)

  if (filePath !== adapterPath && directProviderPattern.test(source)) {
    failures.push(`${relativePath} bypasses the shared email provider.`)
  }

  const sendCalls = source.match(sendPattern)?.length || 0
  if (!sendCalls || filePath === adapterPath) continue

  sendCallCount += sendCalls
  sendingFileCount += 1

  if (!source.includes('@/lib/email-client')) {
    failures.push(`${relativePath} sends email without the shared email provider.`)
  }
}

if (!sendCallCount) {
  failures.push('No app email send calls were found, so coverage could not be confirmed.')
}

if (failures.length) {
  console.error('❌ Email coverage check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`✅ Email coverage check passed for ${sendCallCount} send calls across ${sendingFileCount} files.`)
