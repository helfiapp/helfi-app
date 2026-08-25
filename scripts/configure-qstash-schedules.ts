async function main() {
const token = process.env.QSTASH_TOKEN
const baseUrl = (process.env.SCHEDULE_BASE_URL || 'https://helfi.ai').replace(/\/$/, '')
const action = (process.env.SCHEDULE_ACTION || 'pause').trim().toLowerCase()

if (!token) throw new Error('QSTASH_TOKEN is required.')
if (!['pause', 'resume'].includes(action)) throw new Error('SCHEDULE_ACTION must be pause or resume.')

const schedules = [
  ['helfi-affiliate-payout-run', '/api/cron/affiliate-payout-run', '0 3 1 * *'],
  ['helfi-food-photo-cleanup', '/api/cron/food-photo-cleanup', '0 4 * * *'],
  ['helfi-mood-media-cleanup', '/api/cron/mood-media-cleanup', '30 4 * * *'],
  ['helfi-weekly-health-report', '/api/cron/weekly-health-report', '0 * * * *'],
  ['helfi-practitioner-trial-check', '/api/cron/practitioner-trial-check', '0 5 * * *'],
  ['helfi-practitioner-contact-summary', '/api/cron/practitioner-contact-summary', '0 6 * * 1'],
  ['helfi-barcode-health', '/api/cron/barcode-health', '0 7 * * 1'],
  ['helfi-fast-food-menu-sync', '/api/cron/fast-food-menu-sync', '30 2 * * *'],
  ['helfi-push-scheduler', '/api/push/scheduler', '*/15 * * * *'],
] as const

const request = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init)
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`QStash request failed with status ${response.status}: ${detail}`)
  }
  return response
}

for (const [scheduleId, path, cron] of schedules) {
  const destination = `${baseUrl}${path}`
  await request(`https://qstash.upstash.io/v2/schedules/${destination}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Cron': cron,
      'Upstash-Schedule-Id': scheduleId,
      'Upstash-Method': 'GET',
      'Upstash-Retries': '2',
      'Upstash-Forward-X-Vercel-Cron': '1',
    },
    body: '{}',
  })

  await request(`https://qstash.upstash.io/v2/schedules/${scheduleId}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

const listResponse = await request('https://qstash.upstash.io/v2/schedules', {
  method: 'GET',
  headers: { Authorization: `Bearer ${token}` },
})
const current = await listResponse.json() as Array<{
  scheduleId: string
  cron: string
  destination: string
  isPaused: boolean
}>

console.log(JSON.stringify(current
  .filter((item) => item.scheduleId.startsWith('helfi-'))
  .map(({ scheduleId, cron, destination, isPaused }) => ({ scheduleId, cron, destination, isPaused }))
  .sort((a, b) => a.scheduleId.localeCompare(b.scheduleId)), null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
