// Shared transport only: the existing result parser, nutrition and save flows
// consume the final ordinary Response exactly as before.
const requestIds = new WeakMap<object, string>()
const newRequestId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  // This is an idempotency label, not an authentication credential.
  return `food-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
export class FoodAnalysisRequestError extends Error {
  constructor(message: string, public jobId?: string) { super(message); this.name = 'FoodAnalysisRequestError' }
}
function aborted(signal?: AbortSignal | null) {
  if (signal?.aborted) { const error = new Error('Analysis request cancelled.'); error.name = 'AbortError'; throw error }
}
async function pause(ms: number, signal?: AbortSignal | null) {
  aborted(signal)
  await new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); const error = new Error('Analysis request cancelled.'); error.name = 'AbortError'; reject(error) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve() }, ms)
    signal?.addEventListener('abort', stop, { once: true })
  })
}
export function foodAnalysisPollUrl(url: string, jobId: unknown): string {
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(jobId)) throw new FoodAnalysisRequestError('Could not identify the food analysis result.')
  // Build the endpoint ourselves: a response cannot redirect native credentials
  // to another host or path through an arbitrary pollUrl.
  const suffix = '/api/analyze-food'
  if (!url.endsWith(suffix)) throw new FoodAnalysisRequestError('Invalid food analysis address.')
  return `${url.slice(0, -suffix.length)}${suffix}/jobs/${encodeURIComponent(jobId)}`
}
export async function requestFoodAnalysis(url: string, init: RequestInit): Promise<Response> {
  const body = init.body as any
  const isForm = body && typeof body === 'object' && typeof body.append === 'function'
  if (isForm && !requestIds.has(body)) {
    const id = newRequestId()
    requestIds.set(body, id)
    // React Native FormData has append but does not always expose get/set.
    body.append('analysisRequestId', id)
  }
  aborted(init.signal)
  let response: Response
  try { response = await fetch(url, init) }
  catch (error) {
    aborted(init.signal)
    // The same multipart body/request ID recovers an already-created job.
    // Never retry ordinary text/legacy requests automatically.
    if (!isForm) throw error
    await pause(1000, init.signal)
    response = await fetch(url, init)
  }
  if (isForm && response.status === 503) {
    const temporary = await response.clone().json().catch(() => null)
    if (temporary?.code === 'food_job_check_unavailable') {
      await pause(1000, init.signal)
      response = await fetch(url, init)
    }
  }
  if (response.status !== 202) return response
  const started = Date.now()
  let jobId: string | undefined
  while (response.status === 202 || (jobId && response.status === 503)) {
    aborted(init.signal)
    const pending: any = await response.json()
    const temporary = response.status === 503 && pending?.code === 'food_job_check_unavailable'
    if (!temporary && pending?.status !== 'pending') {
      if (response.status === 503) return new Response(JSON.stringify(pending), { status: response.status, headers: response.headers })
      throw new FoodAnalysisRequestError('Could not read the food analysis progress.', jobId)
    }
    const nextId = temporary ? jobId : pending.jobId
    const pollUrl = foodAnalysisPollUrl(url, nextId)
    if (jobId && nextId !== jobId) throw new FoodAnalysisRequestError('Food analysis identity changed unexpectedly.', jobId)
    jobId = nextId
    if (Date.now() - started >= 5 * 60 * 1000) throw new FoodAnalysisRequestError('This analysis is taking too long. Please try again.', jobId)
    const requestedDelay = Number(pending.retryAfterMs)
    const delay = Number.isFinite(requestedDelay) ? Math.min(3000, Math.max(1000, requestedDelay)) : 1500
    await pause(delay, init.signal)
    const headers = new Headers(init.headers)
    headers.delete('content-type')
    // Keep normal web cookies/native auth, without carrying an upload body.
    const pollInit: RequestInit = { method: 'GET', headers, credentials: init.credentials, signal: init.signal, cache: 'no-store' }
    try { response = await fetch(pollUrl, pollInit) }
    catch {
      aborted(init.signal)
      await pause(1000, init.signal)
      response = await fetch(pollUrl, pollInit)
    }
  }
  return response
}
