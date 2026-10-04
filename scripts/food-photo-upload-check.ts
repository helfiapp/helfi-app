import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
async function main() {
  const code = fs.readFileSync('native/src/lib/foodPhoto.ts', 'utf8').replace(/^import.*$/gm, '').replace('export async function', 'async function')
  let request: any[] = []
  const context: any = { ImageManipulator: { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async (...args: any[]) => { request = args; return { uri: 'file:///prepared.jpg' } } } }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const photo = await context.prepareFoodPhotoForUpload({ uri: 'file:///camera.heic', width: 4032, fileName: 'camera.HEIC', mimeType: 'image/heic' })
  assert.equal(photo.type, 'image/jpeg'); assert.equal(photo.name, 'camera.jpg')
  assert.equal(request[1][0].resize.width, 1800); assert.equal(request[2].compress, 0.82)
  await context.prepareFoodPhotoForUpload({ uri: 'file:///small.png', width: 640, fileName: 'small.png' })
  assert.equal(request[1].length, 0, 'small photos are not enlarged')
  context.ImageManipulator.manipulateAsync = async () => { throw Error('fixture') }
  const fallback = await context.prepareFoodPhotoForUpload({ uri: 'file:///small.png', fileName: 'small.png', mimeType: 'image/png' })
  assert.equal(fallback.type, 'image/png'); assert.equal(fallback.uri, 'file:///small.png')
  console.log('PASS: actual native photo preparation converts HEIC to JPEG, limits dimensions, and retains correct fallback MIME.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
