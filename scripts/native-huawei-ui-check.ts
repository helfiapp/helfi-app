import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const jsx = (type: any, props: any) => ({ type, props: props || {} })
function all(node: any): any[] {
  if (node === null || node === undefined || node === false) return []
  if (Array.isArray(node)) return node.flatMap(all)
  if (typeof node !== 'object') return [node]
  return [node, ...all(node.props?.children)]
}
function compile(file: string) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
}

async function checkCard() {
  const guide = { exports: {} as any }
  vm.runInNewContext(compile('lib/huawei-health-guide.ts'), guide)
  const watch = { sourceId: 'org.fixture.wearable', sourceName: 'Fixture wearable app' }
  const phone = { sourceId: 'org.fixture.phone', sourceName: 'Fixture phone' }
  for (const platform of [{ OS: 'ios', isPad: false }, { OS: 'ios', isPad: true }, { OS: 'android', isPad: false }]) {
    let cursor = 0, reads = 0, navigation = 0, choices = 0
    const states: any[] = []
    const ref = { current: 'fixture-account' }
    const dates: Array<string | undefined> = []
    const health: any = {
      source: null, busy: false, result: null, error: null,
      readSources: async (date?: string) => { reads++; dates.push(date); return date ? [watch] : [watch, phone] },
      setSource: async (source: any) => { choices++; health.source = source },
    }
    const context = { exports: {} as any, Date, Map, Number, String, require(name: string): any {
      if (name === 'react') return {
        useState: (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
        useRef: () => ref, useEffect: () => {},
      }
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react-native') return { Platform: platform, Alert: { alert: () => {} }, Pressable: 'Pressable', Text: 'Text', View: 'View' }
      if (name === '../health/AppleHealthSyncProvider') return { useAppleHealthSync: () => health }
      if (name === '../state/AppModeContext') return { useAppMode: () => ({ mode: 'signedIn', session: { user: { id: 'fixture-account' } } }) }
      if (name.includes('huawei-health-guide')) return guide.exports
      if (name === './theme') return { theme: { colors: {}, radius: { md: 12 } } }
      throw new Error(`Unexpected dependency ${name}`)
    } }
    vm.runInNewContext(compile('native/src/ui/HuaweiHealthSetupCard.tsx'), context)
    const render = () => { cursor = 0; return all(context.exports.HuaweiHealthSetupCard({ onAppleHealthSetup: () => navigation++ })) }
    const find = (tree: any[], label: string) => tree.find(node => node?.props?.accessibilityLabel === label)
    let tree = render()
    assert.equal(reads + choices + navigation, 0)
    find(tree, 'Set up Huawei Health').props.onPress()
    tree = render()
    assert.equal(reads + choices + navigation, 0, 'Expanding instructions must not read or import activity')
    const sourceAction = find(tree, 'Find activity sources in Apple Health')
    if (platform.OS !== 'ios' || platform.isPad) {
      assert.equal(sourceAction, undefined, 'Unsupported route must not expose an iPhone source read')
      assert.equal(find(tree, 'Open Helfi Dashboard'), undefined)
      continue
    }
    await sourceAction.props.onPress()
    tree = render()
    assert.equal(reads, 2, 'Explicit discovery checks today and yesterday only')
    assert.equal(dates[0], undefined)
    assert.match(dates[1]!, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(choices, 0, 'Source discovery must not silently change the preference')
    const option = find(tree, 'Use Fixture wearable app readings')
    assert.equal(tree.filter(node => node?.props?.accessibilityLabel === option.props.accessibilityLabel).length, 1, 'Same source across dates is deduplicated')
    await option.props.onPress()
    assert.deepEqual(health.source, watch, 'The exact discovered identifier is selected')
    assert.equal(choices, 1)
    tree = render()
    assert.equal(find(tree, 'Use Fixture wearable app readings').props.disabled, true)
    await find(tree, 'Use Apple Health totals').props.onPress()
    assert.equal(health.source, null, 'The existing aggregate option remains available')
    health.busy = true
    assert.equal(find(render(), 'Find activity sources in Apple Health').props.disabled, true)
    health.busy = false
    health.result = { summary: { localDate: '2026-10-12', selectedSource: watch, steps: null, distanceKm: null, activeEnergyKcal: null } }
    const text = render().filter(node => typeof node === 'string').join(' ')
    assert.ok(text.includes('Latest reading:') && text.includes('Fixture wearable app'))
    assert.ok(text.includes('—'), 'Unavailable source readings are shown as missing')
    find(render(), 'Open Helfi Dashboard').props.onPress()
    assert.equal(navigation, 1)
    assert.equal(reads, 2, 'Navigation itself must not perform another source read')
  }
}

function checkFoodRows() {
  const file = 'native/src/screens/TrackCaloriesScreen.tsx'
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const nodes: string[] = []
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Text') {
      const text = node.getText(source)
      if (text.includes('entry.rawPayload?.steps')) {
        assert.ok(ts.isConditionalExpression(node.parent), 'Keep the actual Apple-only metric visibility condition')
        nodes.push(`{${node.parent.getText(source)}}`)
      } else if (text.includes('entry.source') && (text.includes('Daily total') || text.includes("entry.label || 'Apple Health activity'"))) nodes.push(text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(nodes.length, 3, 'Check the three actual imported activity text nodes')
  const context: any = { exports: {}, Text: 'Text', require: (name: string) => {
    assert.equal(name, 'react/jsx-runtime'); return { jsx, jsxs: jsx }
  }, Number, Math, theme: { colors: {} }, formatCalories: (value: number, unit: string) => `${Math.round(unit === 'kj' ? value * 4.184 : value)} ${unit}`,
    numberOrZero: (value: any) => Number(value) || 0, formatClockTime: () => '12:00' }
  vm.runInNewContext(ts.transpileModule(`exports.render = (entry, energyUnit) => <>${nodes.join('\n')}</>`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context)
  const text = (entry: any, unit = 'kcal') => all(context.exports.render(entry, unit)).filter(node => typeof node === 'string' || typeof node === 'number').join(' ')
  const row = { source: 'APPLE_HEALTH', label: 'Fixture wearable app via Apple Health', calories: 120.25, durationMinutes: 1, distanceKm: 1.2345, rawPayload: { steps: 2100 } }
  const result = text(row)
  assert.ok(result.includes(row.label) && result.includes('Daily total') && result.includes('2100') && result.includes('1.23 km'))
  assert.ok(!result.includes('min'), 'Imported daily activity must not claim a fabricated duration')
  assert.ok(text({ ...row, rawPayload: { steps: null }, distanceKm: null }).includes('—'))
  assert.ok(text({ ...row, rawPayload: { steps: 0 }, distanceKm: 0 }).includes('0.00 km'), 'A known zero remains zero')
  const manual = text({ ...row, source: 'FITBIT', exerciseType: { name: 'Walking' }, durationMinutes: 30 })
  assert.ok(manual.includes('Walking') && manual.includes('30 min') && !manual.includes('Steps:'), 'Other provider display is retained')
}

async function main() {
  await checkCard()
  checkFoodRows()
  console.log('PASS: actual Huawei card requires explicit discovery/selection, preserves aggregate option and missing metrics, and Food shows saved source/steps/distance without duplicate or invented activity.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
