import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { isAiProcessingRequest } from '../lib/ai-consent-text'

function render() {
  let granted = false
  let saveFails = false
  const sent: string[] = []
  let effect!: () => () => void
  const state: any[] = []
  const originalFetch = async (input: any, _init?: RequestInit) => { sent.push(String(input)); return new Response('{"ok":true}', { status: 200 }) }
  const window = { fetch: originalFetch, location: { href: 'https://helfi.ai/food', origin: 'https://helfi.ai' } }
  const source = ts.createSourceFile('provider.tsx', fs.readFileSync('components/providers/AiConsentProvider.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const code = source.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(source)).join('\n')
  const jsx = (type: any, props: any) => ({ type, props })
  let slot = 0
  const box: any = { exports: {}, URL, Request, Response, Promise, window, console, isAiProcessingRequest,
    useSession: () => ({ data: { user: { id: 'synthetic-a' } } }),
    useEffect: (callback: any) => { effect = callback },
    useRef: (value: any) => ({ current: value }),
    useState: (value: any) => { const index = slot++; state[index] = value; return [value, (next: any) => { state[index] = next }] },
    hasSavedAiConsent: async () => granted,
    saveAiConsent: async () => { if (saveFails) throw Error('Save failed'); granted = true },
    AiConsentModal: 'AiConsentModal',
    require: () => ({ jsx, jsxs: jsx, Fragment: 'Fragment' }),
  }
  vm.createContext(box)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, box)
  const tree = box.exports.AiConsentProvider({ children: null })
  const dialog = tree.props.children[1].props
  const cleanup = effect()
  return { window, sent, state, dialog, cleanup, setGranted: (value: boolean) => { granted = value }, setSaveFails: (value: boolean) => { saveFails = value } }
}
const tick = () => new Promise(done => setImmediate(done))
async function main() {
  const a = render()
  const denied = a.window.fetch('/api/analyze-food', { method: 'POST', body: 'photo' })
  await tick()
  assert.equal(a.state[0], true, 'photo request opens the actual permission modal')
  assert.equal(a.sent.length, 0, 'nothing is sent before a decision')
  a.dialog.onCancel()
  assert.equal((await denied).status, 403)
  assert.equal(a.sent.length, 0)
  assert.equal((await a.window.fetch('/api/food-log', { method: 'POST' })).status, 200)
  assert.equal(a.sent.length, 1, 'ordinary tracking still saves')

  const b = render()
  const first = b.window.fetch('/api/analyze-food', { method: 'POST' })
  const second = b.window.fetch('/api/analyze-symptoms', { method: 'POST' })
  await tick()
  assert.equal(b.sent.length, 0)
  await b.dialog.onAgree()
  assert.equal((await first).status, 200)
  assert.equal((await second).status, 200)
  assert.equal(b.sent.length, 2, 'concurrent AI requests wait for the same approval')
  b.setGranted(false)
  const withdrawn = b.window.fetch('/api/analyze-food', { method: 'POST' })
  await tick(); b.dialog.onCancel()
  assert.equal((await withdrawn).status, 403)
  assert.equal(b.sent.length, 2, 'withdrawal cannot be bypassed by an earlier grant')

  const c = render()
  c.setSaveFails(true)
  const failed = c.window.fetch('/api/analyze-food', { method: 'POST' })
  await tick(); await c.dialog.onAgree()
  assert.equal(c.sent.length, 0, 'failed grant does not send the photo')
  assert.equal(c.state[1], 'Save failed')
  c.dialog.onCancel(); assert.equal((await failed).status, 403)

  const d = render()
  const changed = d.window.fetch('/api/analyze-food', { method: 'POST' })
  await tick(); d.cleanup()
  assert.equal((await changed).status, 403, 'account changes cancel pending transmissions')
  assert.equal(d.sent.length, 0)
  a.cleanup(); b.cleanup(); c.cleanup()
  console.log('PASS: actual web permission interception, decline/no send, manual tracking, concurrent approval, withdrawal, failed grant and account-change cancellation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
