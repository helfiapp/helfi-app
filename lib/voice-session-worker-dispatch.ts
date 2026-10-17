import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'

// Non-secret app infrastructure identity. Credentials come from the existing
// Amplify compute role. No provider credential belongs in a queue or function
// configuration; a scoped app control token authorizes one short-lived job.
const REGION = 'ap-southeast-2'
const WORKER = 'arn:aws:lambda:ap-southeast-2:437045580994:function:helfi-voice-session-worker'
const QUEUE = 'https://sqs.ap-southeast-2.amazonaws.com/437045580994/helfi-voice-watchdog'
const ORIGIN = 'https://helfi.ai'
const lambda = new LambdaClient({ region: REGION })
const sqs = new SQSClient({ region: REGION })

export type VoiceWorkerJob = { sessionId: string; controlToken: string; expiresAtMs: number }
function payload(job: VoiceWorkerJob) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(job.sessionId) || !job.controlToken || job.controlToken.length > 4096 || !Number.isSafeInteger(job.expiresAtMs) || job.expiresAtMs <= Date.now() || job.expiresAtMs > Date.now() + 13 * 60_000) throw new Error('The voice worker authorization is invalid.')
  return { ...job, appOrigin: ORIGIN }
}
export async function sendVoiceWatchdog(job: VoiceWorkerJob, delaySeconds = 30) {
  const body = payload(job)
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 60) throw new Error('The voice watchdog delay is invalid.')
  const result = await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE, DelaySeconds: delaySeconds, MessageBody: JSON.stringify({ type: 'watchdog', ...body }) }))
  if (!result.MessageId) throw new Error('The voice spending watchdog was not scheduled.')
  return result.MessageId
}
export async function dispatchVoiceSessionWorker(job: VoiceWorkerJob) {
  const result = await lambda.send(new InvokeCommand({ FunctionName: WORKER, InvocationType: 'Event', Payload: Buffer.from(JSON.stringify({ type: 'monitor', ...payload(job) })) }))
  if (result.StatusCode !== 202) throw new Error('The voice spending monitor could not start.')
}
