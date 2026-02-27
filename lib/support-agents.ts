type SupportAgent = {
  name: string
  role: string
  avatar: string
}

const SUPPORT_AGENT_ROLE = 'Helfi Support'

const SUPPORT_AGENTS: SupportAgent[] = [
  { name: 'Amelia', role: SUPPORT_AGENT_ROLE, avatar: '/support/amelia-brooks.jpg' },
  { name: 'Luca', role: SUPPORT_AGENT_ROLE, avatar: '/support/luca-bennett.jpg' },
  { name: 'Priya', role: SUPPORT_AGENT_ROLE, avatar: '/support/priya-shah.jpg' },
  { name: 'Mateo', role: SUPPORT_AGENT_ROLE, avatar: '/support/mateo-reed.jpg' },
  { name: 'Chloe', role: SUPPORT_AGENT_ROLE, avatar: '/support/chloe-nguyen.jpg' },
]

const MINUTES_PER_DAY = 24 * 60
const SHIFT_DURATION_MINUTES = MINUTES_PER_DAY / SUPPORT_AGENTS.length

function shiftIndexForTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp)) return 0
  const date = new Date(timestamp)
  const minutesSinceUtcMidnight = date.getUTCHours() * 60 + date.getUTCMinutes()
  return Math.floor(minutesSinceUtcMidnight / SHIFT_DURATION_MINUTES) % SUPPORT_AGENTS.length
}

export function getSupportAgentForTimestamp(date: Date): SupportAgent {
  const index = shiftIndexForTimestamp(date.getTime())
  return SUPPORT_AGENTS[index]
}

export function getCurrentSupportAgent(): SupportAgent {
  return getSupportAgentForTimestamp(new Date())
}
