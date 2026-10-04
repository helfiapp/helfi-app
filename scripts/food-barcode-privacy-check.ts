import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

async function check() {
  const corrections = new Map<string, any>()
  const shared: any[] = [{ id: 'global', barcode: '11111111', name: 'Trusted', calories: 100, createdById: null, updatedById: null }, { id: 'old', barcode: '22222222', name: 'Old correction', calories: 900, createdById: 'alice', updatedById: 'alice' }]
  const prisma: any = {
    barcodeUserCorrection: {
      async upsert({ where, create, update }: any) {
        const { userId, barcode } = where.userId_barcode
        assert.equal(create.userId, userId)
        assert.equal(create.barcode, barcode)
        const key = `${userId}:${barcode}`
        const previous = corrections.get(key)
        const result = previous ? { ...previous, ...update, version: previous.version + update.version.increment } : { ...create, id: key, version: 1 }
        corrections.set(key, result)
        return result
      },
      async findUnique({ where }: any) {
        const { userId, barcode } = where.userId_barcode
        return corrections.get(`${userId}:${barcode}`) || null
      },
    },
    barcodeProduct: {
      async findFirst({ where }: any) {
        assert.equal(where.OR.length, 2, 'trusted or same owner only')
        return shared.find(row => row.barcode === where.barcode && where.OR.some((clause: any) => Object.entries(clause).every(([key, value]) => row[key] === value))) || null
      },
      upsert() { throw new Error('ordinary correction must never write shared nutrition') },
    },
  }
  const context: any = { prisma, exports: {}, console, parseServingWeight: () => null, isServingNutritionPlausible: () => true }
  vm.createContext(context)
  const helper = ts.createSourceFile('helper.ts', fs.readFileSync('lib/food/barcode-corrections.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const helperCode = helper.statements.filter(n => ts.isFunctionDeclaration(n)).map(n => n.getText(helper)).join('\n')
  vm.runInContext(ts.transpileModule(helperCode, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const route = ts.createSourceFile('route.ts', fs.readFileSync('app/api/barcode/lookup/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const lookup = route.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'fetchFoodFromHelfiBarcode')!
  vm.runInContext(ts.transpileModule(lookup.getText(route), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  await context.exports.savePrivateBarcodeCorrection('alice', '11111111', { name: 'My label', calories: 200 }, 'user-label')
  assert.equal((await context.fetchFoodFromHelfiBarcode('11111111', 'alice')).calories, 200)
  assert.equal((await context.fetchFoodFromHelfiBarcode('11111111', 'bob')).calories, 100)
  assert.equal(shared[0].calories, 100)
  assert.equal(await context.fetchFoodFromHelfiBarcode('22222222', 'bob'), null)
  assert.equal((await context.fetchFoodFromHelfiBarcode('22222222', 'alice')).calories, 900)
  await context.exports.savePrivateBarcodeCorrection('alice', '11111111', { name: 'Updated label', calories: 250 }, 'user-diary')
  const updated = await context.fetchFoodFromHelfiBarcode('11111111', 'alice')
  assert.equal(updated.calories, 250)
  assert.equal(updated.nutritionProvenance.version, 2)
  assert.equal(updated.basis, 'per_serving')
  assert.equal(updated.energyUnit, 'kcal')
  console.log('PASS: actual barcode read/write functions isolate users, preserve shared records, restrict old corrections and version private changes.')
}
check().catch(error => { console.error(error); process.exitCode = 1 })
