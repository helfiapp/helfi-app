import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'

async function check() {
  const source = ts.createSourceFile('route.ts', fs.readFileSync('app/api/barcode/label/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const code = source.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(source)).join('\n')
  let authenticated = true
  const saved: any[] = []
  const context: any = { exports: {}, process: { env: {} }, console, foodNumberOrNull,
    authOptions: {}, getServerSession: async () => authenticated ? { user: { email: 'test@example.test' } } : null,
    getToken: async () => null,
    prisma: { user: { findUnique: async () => ({ id: 'test-user' }) } },
    savePrivateBarcodeCorrection: async (...args: any[]) => { saved.push(args); return { barcode: args[1], ...args[2], version: 1 } },
    NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) },
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context)
  const submit = (item: any) => context.exports.POST({ json: async () => ({ barcode: '012345678905', item }) })
  const core = { name: 'Label', serving_size: '30 g', protein_g: 0, carbs_g: 0, fat_g: 0 }
  assert.equal((await submit({ ...core, calories: 0 })).status, 200)
  assert.equal(saved[0][2].calories, 0)
  assert.equal((await submit({ ...core, energy_kj: 0 })).status, 200)
  assert.equal(saved[1][2].calories, 0)
  assert.equal((await submit({ ...core, calories: null })).status, 422, 'missing label energy must not become a macro-derived zero')
  assert.equal((await submit({ ...core, calories: 120, protein_g: null })).status, 422)
  assert.equal((await submit({ ...core, calories: 120, energy_kj: 502.08 })).body.scope, 'private')
  authenticated = false
  assert.equal((await submit({ ...core, calories: 120 })).status, 401)
  assert.equal(saved.length, 3, 'rejected requests must not write any correction')
  console.log('PASS: actual label route preserves zero kcal/kJ, refuses missing core nutrients, isolates saves and rejects unauthenticated writes.')
}
check().catch(e => { console.error(e); process.exitCode = 1 })
