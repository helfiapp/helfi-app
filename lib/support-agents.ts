type SupportAgent = {
  name: string
  role: string
  avatar: string
}

const SUPPORT_AGENT_ROLE = 'Helfi Support'

const SUPPORT_AGENTS: SupportAgent[] = [
  { name: 'Zoe', role: SUPPORT_AGENT_ROLE, avatar: '/support/zoe.jpg' },
  { name: 'Nora', role: SUPPORT_AGENT_ROLE, avatar: '/support/nora.jpg' },
  { name: 'Aria', role: SUPPORT_AGENT_ROLE, avatar: '/support/aria.jpg' },
]

const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000

function shiftIndexForTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp)) return 0
  return Math.floor(timestamp / SHIFT_DURATION_MS) % SUPPORT_AGENTS.length
}

export function getSupportAgentForTimestamp(date: Date): SupportAgent {
  const index = shiftIndexForTimestamp(date.getTime())
  return SUPPORT_AGENTS[index]
}

export function getCurrentSupportAgent(): SupportAgent {
  return getSupportAgentForTimestamp(new Date())
}
