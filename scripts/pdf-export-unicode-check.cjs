const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')
const pdf = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')

// Real export/font/PDF code; synthetic users, no app credentials or database.
const root = path.join(__dirname, '..')
const file = 'app/api/export/pdf/route.ts'
const source = fs.readFileSync(path.join(root, file), 'utf8')
const output = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'helfi-pdf-export-check-'))
const hashes = {
  'NotoSans-Regular.ttf': 'b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5',
  'DroidSansFallback.ttf': '21b96a0377f067833a93af3082eb28d4ffab7a8cd46bfd513286f1d64b7b0949',
}
for (const [name, expected] of Object.entries(hashes)) {
  const bytes = fs.readFileSync(path.join(root, 'assets/pdf-fonts', name))
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected)
}
const noto = fontkit.create(fs.readFileSync(path.join(root, 'assets/pdf-fonts/NotoSans-Regular.ttf')))
const cjk = fontkit.create(fs.readFileSync(path.join(root, 'assets/pdf-fonts/DroidSansFallback.ttf')))
for (const character of 'éềΩЖ') assert.ok(noto.hasGlyphForCodePoint(character.codePointAt(0)))
for (const character of '李漢カ한글김민수') assert.ok(cjk.hasGlyphForCodePoint(character.codePointAt(0)))

async function run(name, { query = '', authenticated = true, missingUser = false, long = false } = {}) {
  const user = {
    id: 'fixture-user', email: 'test@fixture.invalid', name,
    healthGoals: long ? [{ name: '長い記録'.repeat(500), category: null, currentRating: 5 }] : [],
    supplements: [{ name: 'Omega 3', dosage: '1000 mg', timing: [] }],
    medications: [], healthLogs: [], foodLogs: long ? [{ name: 'https://fixture.invalid/' + 'letter'.repeat(100), createdAt: new Date('2026-11-01'), nutrients: { calories: 123 } }] : [], waterLogs: [], exerciseLogs: [],
  }
  const original = structuredClone(user), exports = {}, errors = [], lookups = []
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    'next-auth/next': { getServerSession: async () => authenticated ? { user: { email: user.email } } : null },
    '@/lib/auth': { authOptions: {} },
    '@/lib/prisma': { prisma: { user: { findUnique: async query => { lookups.push(query); return missingUser ? null : structuredClone(user) } } } },
    'pdf-lib': pdf, '@pdf-lib/fontkit': fontkit, 'node:path': path,
    'node:fs/promises': { readFile: async file => {
      assert.ok(Object.keys(hashes).some(name => file === path.join(root, 'assets/pdf-fonts', name)))
      return fs.promises.readFile(file)
    } },
    '@/lib/hydration-goal': { computeHydrationGoal: () => ({ targetMl: 2000 }) },
  }
  const context = { exports, Date, URL, Buffer, Response, Intl, process: { cwd: () => root }, console: { error: (_message, error) => errors.push(error?.message) },
    require(module) { assert.ok(Object.hasOwn(dependencies, module), `Unexpected dependency ${module}`); return dependencies[module] } }
  new Function(...Object.keys(context), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(...Object.values(context))
  const response = await exports.GET({ url: 'https://fixture.invalid/api/export/pdf' + query })
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.deepEqual(user, original, 'export cannot mutate the saved user data')
  return { status: response.status, type: response.headers.get('Content-Type'), bytes, errors, lookups }
}
async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  async function inspect(result, required, name) {
    assert.equal(result.status, 200, result.errors.join('\n'))
    assert.equal(result.type, 'application/pdf')
    assert.equal(result.bytes.subarray(0, 4).toString(), '%PDF')
    assert.equal(result.lookups[0].where.email, 'test@fixture.invalid')
    const document = await pdfjs.getDocument({ data: new Uint8Array(result.bytes), isEvalSupported: false,
      useSystemFonts: false, standardFontDataUrl: path.join(root, 'node_modules/pdfjs-dist/standard_fonts/') }).promise
    const text = [], positions = []
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      for (const item of (await page.getTextContent()).items) {
        if (typeof item.str !== 'string') continue
        text.push(item.str)
        positions.push({ text: item.str, y: item.transform[5] })
        if (!item.str.trim()) continue
        assert.ok(item.transform[4] >= 39.5 && item.transform[4] + item.width <= page.view[2] - 39, `text outside horizontal margins: ${name}`)
        assert.ok(item.transform[5] >= 59 && item.transform[5] <= page.view[3] - 39, `text outside vertical margins: ${name}`)
      }
    }
    const compact = value => value.normalize('NFC').replace(/\s+/g, '')
    for (const phrase of required) assert.ok(compact(text.join('')).includes(compact(phrase)), `missing original text: ${phrase}`)
    if (name === 'whitespace') {
      const first = positions.find(item => item.text.includes('Zoë'))
      const second = positions.find(item => item.text.includes('李小龍'))
      const third = positions.find(item => item.text.includes('김민수'))
      assert.ok(first && second && third && first.y > second.y && second.y > third.y, 'ordinary and Unicode paragraph breaks must remain separate lines')
    }
    fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(path.join(output, `pdf-export-${name}.pdf`), result.bytes, { mode: 0o600 })
    const pages = document.numPages
    await document.destroy()
    return { name, status: result.status, pages, bytes: result.bytes.length }
  }
  const cases = []
  cases.push(await inspect(await run('Test User'), ['Helfi — Your Health Summary', 'Name: Test User', 'Daily hydration target: 2 L'], 'ascii'))
  cases.push(await inspect(await run('Test User', { query: '?from=2026-11-01&to=2026-11-27' }), ['Range:', '→'], 'range'))
  for (const [name, text] of [['accents', 'Zoë Nguyễn Łukasz e\u0301'], ['greek', 'Ελένη Παπαδοπούλου'], ['cyrillic', 'Александр Иванов'], ['cjk', '李小龍 山田太郎 한글 김민수']]) {
    cases.push(await inspect(await run(text), [text], name))
  }
  const whitespaceName = 'Zoë\tNguyễn\vŁukasz\fSmith\n李小龍\u2028김민수'
  cases.push(await inspect(await run(whitespaceName), [whitespaceName], 'whitespace'))
  const long = await inspect(await run('李小龍', { long: true }), ['長い記録'.repeat(500), 'https://fixture.invalid/' + 'letter'.repeat(100)], 'long')
  assert.ok(long.pages >= 2, 'long unspaced text should wrap across pages')
  cases.push(long)
  for (const name of ['🙂', 'علي', 'अनिता', '㐀']) {
    const result = await run(name)
    assert.equal(result.status, 422)
    assert.ok(JSON.parse(result.bytes.toString()).error.includes('saved data has not changed'))
    assert.equal(result.errors.length, 0, 'unsupported user text must not leak into logs')
  }
  const unauthenticated = await run('Test', { authenticated: false })
  assert.equal(unauthenticated.status, 401); assert.equal(unauthenticated.lookups.length, 0)
  assert.equal((await run('Test', { missingUser: true })).status, 404)
  const settingsFile = 'app/settings/page.tsx'
  const settingsSource = fs.readFileSync(path.join(root, settingsFile), 'utf8')
  const settingsAst = ts.createSourceFile(settingsFile, settingsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let exportClick
  function findClick(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(settingsAst) === 'onClick' && node.initializer &&
      ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(settingsAst).includes("fetch('/api/export/pdf')")) exportClick = node.initializer.expression.getText(settingsAst)
    ts.forEachChild(node, findClick)
  }
  findClick(settingsAst)
  assert.ok(exportClick, 'test must execute the actual Settings PDF button')
  async function click(response, preview = true) {
    const alerts = [], spinning = [], previews = [], timers = []
    let closed = 0
    const previewWindow = { opener: 'fixture-opener', location: { href: '' }, close() { closed++ } }
    const context = {
      window: { open: () => preview ? previewWindow : null, setTimeout: (_work, delay) => timers.push(delay) },
      fetch: async () => { if (response instanceof Error) throw response; return response },
      URL: { createObjectURL: () => 'blob:synthetic-pdf', revokeObjectURL() {} },
      setExporting: value => spinning.push(value), setPdfUrl: value => previews.push(value), setShowPdf: value => previews.push(value), alert: value => alerts.push(value),
    }
    await new Function(...Object.keys(context), 'return (' + exportClick + ')')(...Object.values(context))()
    return { alerts, spinning, previews, closed, previewWindow, timers }
  }
  const guidance = 'Some characters cannot be shown in this PDF yet. Your saved data has not changed. Please contact support for help.'
  const denied = await click(Response.json({ error: guidance }, { status: 422 }))
  assert.deepEqual(denied.alerts, [guidance]); assert.equal(denied.closed, 1); assert.deepEqual(denied.spinning, [true, false])
  for (const failure of [new Response('upstream unavailable', { status: 500 }), Response.json({ error: 7 }, { status: 500 }), new Error('synthetic connection failure')]) {
    const failed = await click(failure)
    assert.deepEqual(failed.alerts, ['Could not start export.']); assert.equal(failed.closed, 1); assert.deepEqual(failed.spinning, [true, false])
  }
  const opened = await click(new Response('synthetic-pdf', { status: 200 }))
  assert.deepEqual(opened.alerts, []); assert.equal(opened.previewWindow.opener, null); assert.equal(opened.previewWindow.location.href, 'blob:synthetic-pdf'); assert.deepEqual(opened.timers, [60000])
  const modal = await click(new Response('synthetic-pdf', { status: 200 }), false)
  assert.deepEqual(modal.previews, ['blob:synthetic-pdf', true]); assert.deepEqual(modal.alerts, [])
  const evidence = { sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), mode: 'Actual handler/fonts/PDF text extraction with synthetic user only; no network/database/AI', cases }
  fs.writeFileSync(path.join(output, 'pdf-export-unicode-check.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 })
  console.log('PASS: ASCII/date range/accented Latin/Greek/Cyrillic/Chinese/Japanese/Korean, tabs/control spaces/paragraphs, long unspaced wrapping/page margins, original text extraction, unsupported-script guidance, account access and actual Settings success/error paths; synthetic only.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
