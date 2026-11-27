export const SUPPORT_CHAT_ENDED_MARKER = '[SYSTEM] Chat ended'

// Ending a conversation does not mean its underlying fault has been repaired.
export function isSupportChatClosed(ticket?: {
  status?: string | null
  responses?: Array<{ message?: string | null; isAdminResponse?: boolean }>
} | null): boolean {
  return Boolean(ticket && (
    ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ||
    ticket.responses?.some(response => response.isAdminResponse === true && response.message === SUPPORT_CHAT_ENDED_MARKER)
  ))
}
