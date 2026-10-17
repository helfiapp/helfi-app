#!/usr/bin/env node
/** Explicit root-run deployment tool. No AWS/provider call happens on import,
 * --help or --plan. This tool never reads/copies provider keys or env files. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..')
const ACCOUNT = '437045580994', REGION = 'ap-southeast-2', PROFILE = 'helfi-agent'
const PREFIX = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:`
const QUEUE = 'helfi-voice-watchdog', DLQ = `${QUEUE}-dlq`, AMPLIFY_ROLE = 'helfi-amplify-backend-role'
const SOURCE_FILES = ['index.mjs', 'package.json', 'package-lock.json']
const FUNCTIONS = [{ name: 'helfi-voice-session-worker', timeout: 600 }, { name: 'helfi-voice-session-watchdog', timeout: 30 }]
const ROLE_POLICY = 'HelfiVoiceExecution', DISPATCH_POLICY = 'HelfiVoiceSessionDispatch'
const queueArn = name => `arn:aws:sqs:${REGION}:${ACCOUNT}:${name}`
const roleName = name => `${name}-role`
const logArn = name => `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${name}:log-stream:*`
const trust = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] }
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
const requireValue = (condition, message) => { if (!condition) throw new Error(message) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function command(binary, args, options = {}) {
  try { return execFileSync(binary, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }) }
  catch (error) {
    // Commands contain only fixed resource names/artifact paths, never secrets.
    const raw = String(error.stderr || error.message || '').trim()
    const structured = raw.match(/An error occurred \(([A-Za-z0-9_.-]+)\) when calling the ([A-Za-z0-9]+) operation:([\s\S]*)/)
    const detail = binary === 'aws'
      ? structured ? `${structured[1]} calling ${structured[2]}:${structured[3]}`.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted AWS access identifier]').slice(0, 1800) : 'AWS CLI failed without a safe structured error; credential-helper output was not printed.'
      : raw.slice(0, 1800)
    throw new Error(`${binary} ${args.slice(0, 2).join(' ')} failed: ${detail}`)
  }
}
function aws(service, operation, args = [], query) {
  const result = command('aws', ['--profile', PROFILE, '--region', REGION, '--no-cli-pager', service, operation, ...args, '--output', 'json', ...(query ? ['--query', query] : [])])
  return result.trim() ? JSON.parse(result) : null
}
function optional(service, operation, args, missing, query) {
  try { return aws(service, operation, args, query) } catch (error) { if (missing.test(error.message)) return null; throw error }
}
function outsideCheckout(directory) {
  const real = fs.realpathSync(directory), relative = path.relative(ROOT, real)
  requireValue(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Artifacts must be outside the app checkout.')
  return real
}
function gitSource(commit, file) { return command('git', ['show', `${commit}:services/voice-session-worker/${file}`], { cwd: ROOT, encoding: 'buffer' }) }
function commitId(value) {
  requireValue(typeof value === 'string' && /^[a-f0-9]{40}$/.test(value), 'Supply the exact frozen 40-character source commit.')
  const actual = command('git', ['rev-parse', '--verify', `${value}^{commit}`], { cwd: ROOT }).trim()
  requireValue(actual === value, 'The frozen source commit did not resolve exactly.')
  return actual
}
export function executionPolicy(name) {
  return { Version: '2012-10-17', Statement: [
    { Sid: 'OwnFunctionLogs', Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: logArn(name) },
    ...(name === 'helfi-voice-session-watchdog' ? [{ Sid: 'OwnWatchdogQueue', Effect: 'Allow', Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'], Resource: queueArn(QUEUE) }] : []),
  ] }
}
export function dispatchPolicy() { return { Version: '2012-10-17', Statement: [
  { Sid: 'InvokeVoiceWorker', Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: PREFIX + FUNCTIONS[0].name },
  { Sid: 'ScheduleVoiceWatchdog', Effect: 'Allow', Action: 'sqs:SendMessage', Resource: queueArn(QUEUE) },
] } }
export function deploymentPlan() {
  return { account: ACCOUNT, region: REGION, profile: PROFILE,
    functions: FUNCTIONS.map(fn => ({ ...fn, runtime: 'nodejs22.x', handler: 'index.handler', memory: 256, architecture: 'x86_64', roleName: roleName(fn.name), executionPolicy: executionPolicy(fn.name), logRetentionDays: 14 })),
    queue: { name: QUEUE, encryption: 'SQS-managed SSE', visibilitySeconds: 180, retentionSeconds: 86400, batchSize: 1, maxReceiveCount: 3, deadLetterQueue: DLQ, deadLetterRetentionSeconds: 1209600 },
    existingAmplifyRole: AMPLIFY_ROLE, additionalAmplifyPolicy: dispatchPolicy(), providerKeysInArtifactOrEnvironment: false, providerInvocations: 0 }
}
async function prepare(options) {
  const commit = commitId(options.commit)
  const directory = options.output ? (fs.mkdirSync(options.output, { recursive: true }), outsideCheckout(options.output)) : fs.mkdtempSync(path.join(os.tmpdir(), 'helfi-voice-worker-'))
  const staging = path.join(directory, 'package')
  requireValue(!fs.existsSync(staging), 'The output already contains a package. Use a fresh outside-checkout directory.')
  fs.mkdirSync(staging)
  const sourceHashes = {}
  for (const file of SOURCE_FILES) { const bytes = gitSource(commit, file); fs.writeFileSync(path.join(staging, file), bytes); sourceHashes[file] = sha(bytes) }
  const pkg = JSON.parse(fs.readFileSync(path.join(staging, 'package.json'), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(path.join(staging, 'package-lock.json'), 'utf8'))
  requireValue(pkg.type === 'module' && pkg.engines?.node === '22.x' && same(pkg.dependencies, { ws: '8.22.0' }) && lock.packages?.['node_modules/ws']?.version === '8.22.0', 'Only the reviewed Node22/ws8.22 package is supported.')
  const epoch = Number(command('git', ['show', '-s', '--format=%ct', commit], { cwd: ROOT }).trim())
  const provenance = { component: 'helfi-voice-session-worker', sourceCommit: commit, sourceHashes, nodeRuntime: 'nodejs22.x', dependency: { ws: '8.22.0', integrity: lock.packages['node_modules/ws'].integrity }, sourceTimestamp: epoch }
  fs.writeFileSync(path.join(staging, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n')
  console.log('Installing only the pinned worker dependency in the temporary package; app locks are untouched.')
  command('npm', ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: staging })
  const installed = JSON.parse(fs.readFileSync(path.join(staging, 'node_modules/ws/package.json'), 'utf8'))
  requireValue(installed.version === '8.22.0', 'Pinned ws version verification failed.')
  const entries = []
  function walk(directoryPath) {
    for (const name of fs.readdirSync(directoryPath).sort()) {
      const absolute = path.join(directoryPath, name), stat = fs.lstatSync(absolute), relative = path.relative(staging, absolute).split(path.sep).join('/')
      requireValue(!stat.isSymbolicLink() && !relative.includes('\n') && !relative.includes('\r'), 'Unsupported package entry.')
      if (stat.isDirectory()) { fs.chmodSync(absolute, 0o755); walk(absolute) } else { requireValue(stat.isFile(), 'Unsupported package entry.'); fs.chmodSync(absolute, 0o644); fs.utimesSync(absolute, epoch, epoch); entries.push(relative) }
    }
  }
  walk(staging)
  const zip = path.join(directory, 'helfi-voice-session-worker.zip')
  requireValue(!fs.existsSync(zip), 'The output ZIP already exists. Use a fresh outside-checkout directory.')
  // -X omits platform metadata. Sorted paths and committed timestamps retain
  // reviewable package provenance; the actual ZIP hash is the final identity.
  command('zip', ['-X', '-q', zip, '-@'], { cwd: staging, input: entries.sort().join('\n') + '\n', env: { PATH: process.env.PATH, TZ: 'UTC', LANG: 'C' } })
  const bytes = fs.readFileSync(zip), manifest = { ...provenance, zipPath: zip, zipSha256: sha(bytes), zipCodeSha256: crypto.createHash('sha256').update(bytes).digest('base64') }
  const manifestPath = path.join(directory, 'deployment-manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ prepared: true, sourceCommit: commit, zipSha256: manifest.zipSha256, manifestPath, zipPath: zip, awsMutations: 0 }, null, 2))
}
export function validateArtifact(options) {
  const commit = commitId(options.commit)
  requireValue(options.artifact && /^[a-f0-9]{64}$/.test(options['zip-sha256'] || ''), 'Supply the prepared manifest and independently reviewed ZIP SHA256.')
  const manifestPath = fs.realpathSync(options.artifact), manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  outsideCheckout(path.dirname(manifestPath)); outsideCheckout(path.dirname(manifest.zipPath))
  const bytes = fs.readFileSync(manifest.zipPath)
  requireValue(manifest.sourceCommit === commit && manifest.zipSha256 === options['zip-sha256'] && sha(bytes) === options['zip-sha256'] && crypto.createHash('sha256').update(bytes).digest('base64') === manifest.zipCodeSha256, 'Source/ZIP provenance does not match the explicit reviewed identity.')
  const entries = command('unzip', ['-Z1', manifest.zipPath]).trim().split('\n')
  requireValue(entries.length === new Set(entries).size && entries.every(name => !name.startsWith('/') && !name.split('/').includes('..') && !/[\r\0]/.test(name) && (SOURCE_FILES.includes(name) || name === 'provenance.json' || name === 'node_modules/.package-lock.json' || name.startsWith('node_modules/ws/'))), 'The ZIP contains unsupported or duplicate paths.')
  for (const file of SOURCE_FILES) requireValue(sha(command('unzip', ['-p', manifest.zipPath, file], { encoding: 'buffer' })) === sha(gitSource(commit, file)) && manifest.sourceHashes[file] === sha(gitSource(commit, file)), `ZIP source mismatch: ${file}`)
  const bundled = JSON.parse(command('unzip', ['-p', manifest.zipPath, 'provenance.json']))
  requireValue(bundled.sourceCommit === commit && same(bundled.sourceHashes, manifest.sourceHashes), 'Bundled source provenance mismatch.')
  requireValue(JSON.parse(command('unzip', ['-p', manifest.zipPath, 'node_modules/ws/package.json'])).version === '8.22.0', 'Bundled dependency version mismatch.')
  return manifest
}
function roles() {
  // GetRole is deliberately not required: the current identity may ListRoles
  // while AWS denies GetRole. Never substitute another existing broad role.
  return aws('iam', 'list-roles', [], 'Roles[].{RoleName:RoleName,Arn:Arn,AssumeRolePolicyDocument:AssumeRolePolicyDocument}')
}
function roleDocument(value) { return typeof value === 'string' ? JSON.parse(decodeURIComponent(value)) : value }
function rolePolicy(name, policy) { return aws('iam', 'get-role-policy', ['--role-name', name, '--policy-name', policy], 'PolicyDocument') }
function assertExecutionRole(role, name) {
  requireValue(role && role.RoleName === name && same(roleDocument(role.AssumeRolePolicyDocument), trust), `Unexpected trust on ${name}; manual review is required.`)
  const attached = aws('iam', 'list-attached-role-policies', ['--role-name', name], 'AttachedPolicies')
  const inline = aws('iam', 'list-role-policies', ['--role-name', name], 'PolicyNames')
  requireValue(!attached.length && inline.every(policy => policy === ROLE_POLICY), `Unexpected additional execution permissions on ${name}; nothing was detached or expanded.`)
}
function lambdaConfiguration(name) {
  return optional('lambda', 'get-function-configuration', ['--function-name', name], /ResourceNotFoundException/, '{FunctionName:FunctionName,Role:Role,Runtime:Runtime,Handler:Handler,Timeout:Timeout,MemorySize:MemorySize,Architectures:Architectures,State:State,LastUpdateStatus:LastUpdateStatus,CodeSha256:CodeSha256,EnvironmentKeys:keys(not_null(Environment.Variables, `{}`)),LayerArns:Layers[].Arn,SubnetIds:VpcConfig.SubnetIds,FileSystems:FileSystemConfigs[].Arn,DeadLetterTarget:DeadLetterConfig.TargetArn,PackageType:PackageType,Tracing:TracingConfig.Mode}')
}
function assertPlainFunction(actual, name) {
  requireValue(actual.EnvironmentKeys.length === 0 && !(actual.LayerArns?.length) && !(actual.SubnetIds?.length) && !(actual.FileSystems?.length) && !actual.DeadLetterTarget && actual.PackageType === 'Zip' && actual.Tracing !== 'Active', `${name} has unexpected environment names, layers, VPC/filesystem, dead-letter target or tracing. No values were read/cleared; review separately.`)
}
function queueAttributes(url) { return aws('sqs', 'get-queue-attributes', ['--queue-url', url, '--attribute-names', 'QueueArn', 'VisibilityTimeout', 'MessageRetentionPeriod', 'SqsManagedSseEnabled', 'RedrivePolicy', 'RedriveAllowPolicy', 'KmsMasterKeyId', 'Policy'], 'Attributes') }
const queueUrl = name => `https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/${name}`
function queueSettings(name) {
  return { VisibilityTimeout: '180', MessageRetentionPeriod: name === DLQ ? '1209600' : '86400', SqsManagedSseEnabled: 'true', ...(name === DLQ ? { RedriveAllowPolicy: JSON.stringify({ redrivePermission: 'byQueue', sourceQueueArns: [queueArn(QUEUE)] }) } : { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: queueArn(DLQ), maxReceiveCount: 3 }) }) }
}
function verifyQueue(name) {
  const actual = queueAttributes(queueUrl(name)), expected = queueSettings(name)
  requireValue(actual.QueueArn === queueArn(name) && !actual.KmsMasterKeyId && !actual.Policy, `Unexpected queue identity/encryption/resource policy: ${name}`)
  for (const [key, value] of Object.entries(expected)) requireValue(key.endsWith('Policy') ? same(JSON.parse(actual[key] || '{}'), JSON.parse(value)) : actual[key] === value, `Queue setting mismatch: ${name}/${key}`)
}
function mappings() { return aws('lambda', 'list-event-source-mappings', ['--function-name', FUNCTIONS[1].name, '--event-source-arn', queueArn(QUEUE)], 'EventSourceMappings[].{UUID:UUID,State:State,BatchSize:BatchSize,MaximumBatchingWindowInSeconds:MaximumBatchingWindowInSeconds,EventSourceArn:EventSourceArn,FunctionArn:FunctionArn}') }
async function apply(manifest) {
  const available = roles()
  requireValue(available.some(role => role.RoleName === AMPLIFY_ROLE), `Existing ${AMPLIFY_ROLE} was not found. No replacement role will be created.`)
  for (const fn of FUNCTIONS) {
    const group = `/aws/lambda/${fn.name}`
    const groups = aws('logs', 'describe-log-groups', ['--log-group-name-prefix', group], 'logGroups[].logGroupName')
    if (!groups.includes(group)) aws('logs', 'create-log-group', ['--log-group-name', group])
    aws('logs', 'put-retention-policy', ['--log-group-name', group, '--retention-in-days', '14'])
    let role = available.find(item => item.RoleName === roleName(fn.name))
    if (!role) { role = aws('iam', 'create-role', ['--role-name', roleName(fn.name), '--path', '/service-role/', '--assume-role-policy-document', JSON.stringify(trust)], 'Role.{RoleName:RoleName,Arn:Arn,AssumeRolePolicyDocument:AssumeRolePolicyDocument}'); available.push(role) }
    assertExecutionRole(role, roleName(fn.name))
    aws('iam', 'put-role-policy', ['--role-name', roleName(fn.name), '--policy-name', ROLE_POLICY, '--policy-document', JSON.stringify(executionPolicy(fn.name))])
  }
  for (const name of [DLQ, QUEUE]) {
    const exists = optional('sqs', 'get-queue-url', ['--queue-name', name], /QueueDoesNotExist|NonExistentQueue/, 'QueueUrl')
    const attributes = queueSettings(name)
    if (!exists) aws('sqs', 'create-queue', ['--queue-name', name, '--attributes', JSON.stringify(attributes)], 'QueueUrl')
    else { requireValue(exists === queueUrl(name), 'Unexpected queue URL.'); const current = queueAttributes(exists); requireValue(!current.Policy && !current.KmsMasterKeyId, 'Unexpected existing queue policy/KMS configuration; review separately.'); aws('sqs', 'set-queue-attributes', ['--queue-url', exists, '--attributes', JSON.stringify(attributes)]) }
  }
  aws('iam', 'put-role-policy', ['--role-name', AMPLIFY_ROLE, '--policy-name', DISPATCH_POLICY, '--policy-document', JSON.stringify(dispatchPolicy())])
  for (const fn of FUNCTIONS) {
    const role = available.find(item => item.RoleName === roleName(fn.name)), old = lambdaConfiguration(fn.name)
    if (old) {
      assertPlainFunction(old, fn.name)
      aws('lambda', 'update-function-code', ['--function-name', fn.name, '--architectures', 'x86_64', '--zip-file', `fileb://${manifest.zipPath}`], '{FunctionName:FunctionName,CodeSha256:CodeSha256}')
      aws('lambda', 'wait', ['function-updated-v2', '--function-name', fn.name])
      aws('lambda', 'update-function-configuration', ['--function-name', fn.name, '--role', role.Arn, '--runtime', 'nodejs22.x', '--handler', 'index.handler', '--timeout', String(fn.timeout), '--memory-size', '256'], '{FunctionName:FunctionName,LastUpdateStatus:LastUpdateStatus}')
      aws('lambda', 'wait', ['function-updated-v2', '--function-name', fn.name])
    } else {
      for (let attempt = 0; ; attempt++) {
        try { aws('lambda', 'create-function', ['--function-name', fn.name, '--role', role.Arn, '--runtime', 'nodejs22.x', '--handler', 'index.handler', '--timeout', String(fn.timeout), '--memory-size', '256', '--architectures', 'x86_64', '--zip-file', `fileb://${manifest.zipPath}`], '{FunctionName:FunctionName,CodeSha256:CodeSha256}'); break }
        catch (error) { if (attempt >= 4 || !/role.*cannot be assumed|role defined.*cannot/i.test(error.message)) throw error; await sleep(2000) }
      }
      aws('lambda', 'wait', ['function-active-v2', '--function-name', fn.name])
    }
    aws('lambda', 'tag-resource', ['--resource', PREFIX + fn.name, '--tags', JSON.stringify({ 'helfi:source-commit': manifest.sourceCommit, 'helfi:zip-sha256': manifest.zipSha256, 'helfi:component': 'voice-session' })])
  }
  // The independent queue owns cleanup retries. Do not automatically retry
  // the long-lived monitor as a second asynchronous session invocation.
  const invocation = optional('lambda', 'get-function-event-invoke-config', ['--function-name', FUNCTIONS[0].name], /ResourceNotFoundException/, '{MaximumRetryAttempts:MaximumRetryAttempts,MaximumEventAgeInSeconds:MaximumEventAgeInSeconds,DestinationConfig:DestinationConfig}')
  requireValue(!invocation?.DestinationConfig?.OnFailure?.Destination && !invocation?.DestinationConfig?.OnSuccess?.Destination, 'Unexpected existing asynchronous destinations; review separately.')
  aws('lambda', 'put-function-event-invoke-config', ['--function-name', FUNCTIONS[0].name, '--maximum-retry-attempts', '0', '--maximum-event-age-in-seconds', '60'], '{MaximumRetryAttempts:MaximumRetryAttempts,MaximumEventAgeInSeconds:MaximumEventAgeInSeconds}')
  const existing = mappings(); requireValue(existing.length <= 1, 'More than one watchdog queue mapping exists; no mappings were deleted.')
  const mapping = existing[0] ? aws('lambda', 'update-event-source-mapping', ['--uuid', existing[0].UUID, '--batch-size', '1', '--maximum-batching-window-in-seconds', '0', '--enabled'], '{UUID:UUID}') : aws('lambda', 'create-event-source-mapping', ['--function-name', FUNCTIONS[1].name, '--event-source-arn', queueArn(QUEUE), '--batch-size', '1', '--maximum-batching-window-in-seconds', '0', '--enabled'], '{UUID:UUID}')
  for (let attempt = 0; attempt < 30; attempt++) { const item = aws('lambda', 'get-event-source-mapping', ['--uuid', mapping.UUID], '{State:State,StateTransitionReason:StateTransitionReason}'); if (item.State === 'Enabled') break; if (attempt === 29 || ['Disabled', 'Failed'].includes(item.State)) throw new Error(`Watchdog mapping did not enable: ${item.State}`); await sleep(2000) }
}
function verify(manifest) {
  const available = roles()
  for (const fn of FUNCTIONS) {
    const role = available.find(item => item.RoleName === roleName(fn.name)); assertExecutionRole(role, roleName(fn.name))
    requireValue(same(roleDocument(rolePolicy(role.RoleName, ROLE_POLICY)), executionPolicy(fn.name)), `Execution policy mismatch: ${fn.name}`)
    const actual = lambdaConfiguration(fn.name)
    if (actual) assertPlainFunction(actual, fn.name)
    requireValue(actual && actual.Role === role.Arn && actual.Runtime === 'nodejs22.x' && actual.Handler === 'index.handler' && actual.Timeout === fn.timeout && actual.MemorySize === 256 && same(actual.Architectures, ['x86_64']) && actual.EnvironmentKeys.length === 0 && actual.State === 'Active' && ['Successful', null, undefined].includes(actual.LastUpdateStatus) && actual.CodeSha256 === manifest.zipCodeSha256, `Function/code/configuration mismatch: ${fn.name}`)
    const tags = aws('lambda', 'list-tags', ['--resource', PREFIX + fn.name], 'Tags')
    requireValue(tags['helfi:source-commit'] === manifest.sourceCommit && tags['helfi:zip-sha256'] === manifest.zipSha256, `Function source tag mismatch: ${fn.name}`)
    const groups = aws('logs', 'describe-log-groups', ['--log-group-name-prefix', `/aws/lambda/${fn.name}`], 'logGroups[].{name:logGroupName,retention:retentionInDays}')
    requireValue(groups.some(group => group.name === `/aws/lambda/${fn.name}` && group.retention === 14), `Log retention mismatch: ${fn.name}`)
  }
  verifyQueue(QUEUE); verifyQueue(DLQ)
  requireValue(same(roleDocument(rolePolicy(AMPLIFY_ROLE, DISPATCH_POLICY)), dispatchPolicy()), 'Exact Amplify dispatch policy mismatch.')
  const map = mappings()
  requireValue(map.length === 1 && map[0].State === 'Enabled' && map[0].BatchSize === 1 && map[0].MaximumBatchingWindowInSeconds === 0 && map[0].EventSourceArn === queueArn(QUEUE) && map[0].FunctionArn === PREFIX + FUNCTIONS[1].name, 'Exact watchdog queue mapping mismatch.')
  const invoke = aws('lambda', 'get-function-event-invoke-config', ['--function-name', FUNCTIONS[0].name], '{MaximumRetryAttempts:MaximumRetryAttempts,MaximumEventAgeInSeconds:MaximumEventAgeInSeconds}')
  requireValue(invoke.MaximumRetryAttempts === 0 && invoke.MaximumEventAgeInSeconds === 60, 'Monitor asynchronous retry configuration mismatch.')
  console.log(JSON.stringify({ infrastructureVerified: true, sourceCommit: manifest.sourceCommit, zipSha256: manifest.zipSha256, functions: FUNCTIONS.map(fn => PREFIX + fn.name), queueArn: queueArn(QUEUE), providerInvocations: 0, liveVoiceAcceptance: false }, null, 2))
}
function argumentsFor(args) {
  const options = {}, modes = []
  for (let index = 0; index < args.length; index++) {
    const name = args[index]
    if (['--plan', '--prepare', '--apply', '--verify', '--help'].includes(name)) modes.push(name.slice(2))
    else { requireValue(['--commit', '--artifact', '--zip-sha256', '--confirm-account', '--output'].includes(name) && args[index + 1] && !args[index + 1].startsWith('--'), `Unsupported or missing argument: ${name}`); requireValue(!Object.hasOwn(options, name.slice(2)), `Duplicate argument: ${name}`); options[name.slice(2)] = args[++index] }
  }
  requireValue(modes.length === 1, 'Choose exactly one explicit mode: --plan, --prepare, --apply, --verify or --help.')
  return { mode: modes[0], options }
}
export async function main(args = process.argv.slice(2)) {
  const { mode, options } = argumentsFor(args)
  if (mode === 'help') { console.log('Read README.md. Modes: --plan; --prepare --commit SHA [--output OUTSIDE_DIR]; --apply|--verify --artifact MANIFEST --commit SHA --zip-sha256 SHA256 --confirm-account 437045580994. Apply is the only mode that changes AWS.'); return }
  if (mode === 'plan') { console.log(JSON.stringify(deploymentPlan(), null, 2)); return }
  command(process.execPath, [path.join(ROOT, 'scripts/assert-no-local-openai-key.js')], { cwd: ROOT })
  if (mode === 'prepare') { await prepare(options); return }
  requireValue(options['confirm-account'] === ACCOUNT, `Explicit --confirm-account ${ACCOUNT} is required.`)
  const manifest = validateArtifact(options)
  const identity = aws('sts', 'get-caller-identity', [], '{Account:Account,Arn:Arn}')
  requireValue(identity.Account === ACCOUNT, 'AWS identity is in the wrong account. Nothing was changed.')
  console.log(`Verified deployment account ${ACCOUNT}, region ${REGION}, source ${manifest.sourceCommit}, ZIP ${manifest.zipSha256}.`)
  if (mode === 'apply') { console.log('Applying only the fixed voice worker/watchdog resources.'); await apply(manifest) }
  verify(manifest)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Voice worker infrastructure preparation/deployment failed: ${error.message}`); process.exitCode = 1 })
