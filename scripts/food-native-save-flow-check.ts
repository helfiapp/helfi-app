import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { convertFoodAmount, parseFoodServing } from '../native/src/lib/foodUnits'

// Run the real screen handlers with isolated network/navigation adapters.
const source = ts.createSourceFile('ingredient.tsx', fs.readFileSync('native/src/screens/AddIngredientScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const helpers = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name && !/^[A-Z]/.test(node.name.text)).map(node => node.getText(source)).join('\n')
const handlers: string[] = []
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['addAdjustedItem', 'addByPhoto'].includes(node.name.text)) handlers.push(`var ${node.getText(source)}`)
  ts.forEachChild(node, visit)
}
visit(source)
assert.equal(handlers.length, 2)
async function run(overrides: Record<string, any> = {}, handler = 'addAdjustedItem') {
  const calls: any[] = []
  const context: any = {
    convertFoodAmount, parseFoodServing, LIQUID_UNIT_ML: {}, STATIC_UNIT_GRAMS: {},
    adjustItem: { name: 'Bananas', serving_size: '100 g', calories: 89, protein_g: 1.09, carbs_g: 22.84, fat_g: 0.33, fiber_g: null, sugar_g: 0 },
    adjustAmountInput: '200', safeAdjustUnit: 'g', adjustBase: { amount: 100, unit: 'g' }, mergedAdjustUnitGrams: {},
    authHeaders: {}, adjustSaving: false, session: { token: 'test-fixture' }, selectedDate: '2026-10-04', targetMeal: 'lunch', selectedServingLabel: '100 g', API_BASE_URL: 'https://fixture.invalid',
    buildNativeAuthHeaders: () => ({}),
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return { ok: true, json: async () => ({ items: [{ name: 'Banana', calories: 89, protein_g: 1.09, carbs_g: 22.84, fat_g: 0.33 }] }) } },
    DeviceEventEmitter: { emit: (name: string, payload: any) => calls.push({ event: name, payload }) },
    navigation: { goBack: () => calls.push({ back: true }) }, Alert: { alert: (...args: any[]) => calls.push({ alert: args }) },
    requestAiDataSharingPermission: async () => true,
    prepareFoodPhotoForUpload: async (asset: any) => ({ uri: asset.uri, type: 'image/jpeg', name: 'fixture.jpg' }),
    ImagePicker: { requestMediaLibraryPermissionsAsync: async () => ({ granted: true }), launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///fixture.jpg' }] }) },
    FormData: class { values: any[] = []; append(...args: any[]) { this.values.push(args) } },
    setAdjustSaving: () => {}, setAdjustServingOptions: () => {}, setAdjustServingId: () => {}, setAdjustItem: () => {}, setAdjustPickerMode: () => {}, setPhotoPreviewUri: () => {}, setPhotoLoading: () => {}, ...overrides,
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(`${helpers}\n${handlers.join('\n')}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)
  await context[handler]()
  return calls
}
async function main() {
  const success = await run()
  const payload = JSON.parse(success[0].options.body)
  assert.equal(payload.nutrition.calories, 178)
  assert.equal(payload.items[0].servings, 2)
  assert.equal(payload.nutrition.fiber, null, 'unknown fibre remains unknown')
  assert.equal(payload.items[0].fiber_g, null)
  assert.equal(payload.nutrition.sugar, 0, 'declared zero is preserved')
  assert.equal(success[1].event, 'helfi:food-log-changed')
  assert.equal(success[2].back, true, 'refresh event precedes returning to diary')
  const failed = await run({ fetch: async () => ({ ok: false }) })
  assert.ok(failed.some(call => call.alert))
  assert.ok(!failed.some(call => call.event || call.back))
  const invalid = await run({ safeAdjustUnit: 'g', adjustBase: { amount: 100, unit: 'ml' } })
  assert.ok(invalid.some(call => call.alert))
  assert.ok(!invalid.some(call => call.url || call.event || call.back))
  const photo = await run({}, 'addByPhoto')
  assert.equal(photo.filter(call => call.url).length, 1)
  assert.ok(photo[0].url.endsWith('/api/analyze-food'))
  assert.equal(photo[1].event, 'helfi:food-photo-review')
  assert.equal(photo[1].payload.items[0].calories, 89)
  assert.equal(photo[2].back, true)
  const denied = await run({ requestAiDataSharingPermission: async () => false }, 'addByPhoto')
  assert.equal(denied.length, 0, 'declined AI consent sends nothing and saves nothing')
  console.log('PASS: actual native save, failure, unknown conversion, refresh, photo review and consent handlers.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
