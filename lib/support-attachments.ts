import { buildSignedBlobUrl, extractScopedBlobPath } from '@/lib/blob-access'

const ATTACHMENTS_MARKER = '[[ATTACHMENTS]]'

export type SupportAttachmentPayload = {
  id?: string
  name: string
  url: string
  path?: string
  type?: string
  size?: number
}

export function rehydrateSupportMessage(
  message: string,
  expiresInSeconds = 60 * 60,
): string {
  const markerIndex = message.indexOf(ATTACHMENTS_MARKER)
  if (markerIndex === -1) return message

  const text = message.slice(0, markerIndex).trim()
  const raw = message.slice(markerIndex + ATTACHMENTS_MARKER.length).trim()
  if (!raw) return message

  try {
    const parsed = JSON.parse(raw)
    const attachments: SupportAttachmentPayload[] = Array.isArray(parsed)
      ? parsed
          .map((item) => ({
            id: item?.id ? String(item.id) : undefined,
            name: String(item?.name || ''),
            url: String(item?.url || ''),
            path: item?.path ? String(item.path) : undefined,
            type: item?.type ? String(item.type) : undefined,
            size: typeof item?.size === 'number' ? item.size : undefined,
          }))
          .filter((item) => item.name && item.url)
      : []

    if (attachments.length === 0) return message

    const updated = attachments.map((attachment) => {
      const path =
        attachment.path || extractScopedBlobPath(attachment.url, 'support') || undefined
      if (!path) return attachment
      const signedUrl = buildSignedBlobUrl(path, 'support', expiresInSeconds)
      return {
        ...attachment,
        path,
        url: signedUrl || attachment.url,
      }
    })

    return `${text}\n\n${ATTACHMENTS_MARKER}\n${JSON.stringify(updated)}`
  } catch {
    return message
  }
}

export function rehydrateSupportTicket<T extends { message?: string; responses?: Array<{ message?: string }> }>(
  ticket: T,
  expiresInSeconds = 60 * 60,
): T {
  if (!ticket) return ticket
  const hydratedMessage = ticket.message ? rehydrateSupportMessage(ticket.message, expiresInSeconds) : ticket.message
  const hydratedResponses = Array.isArray(ticket.responses)
    ? ticket.responses.map((response) => ({
        ...response,
        message: response.message ? rehydrateSupportMessage(response.message, expiresInSeconds) : response.message,
      }))
    : ticket.responses

  return {
    ...ticket,
    message: hydratedMessage,
    responses: hydratedResponses,
  }
}
