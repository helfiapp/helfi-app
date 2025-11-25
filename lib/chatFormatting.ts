function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function formatChatContent(
  raw: string,
  options?: {
    headings?: string[]
  }
): string {
  let text = (raw || '').replace(/\r\n/g, '\n').replace(/\u2022/g, '- ')

  // Force key headings onto their own line when provided.
  if (options?.headings?.length) {
    for (const heading of options.headings) {
      const pattern = new RegExp(escapeForRegExp(heading), 'g')
      text = text.replace(pattern, `\n${heading}\n`)
    }
  }

  // Push any remaining **bold heading** patterns onto their own lines.
  text = text.replace(/(\*\*[A-Za-z][^*\n]{2,80}\*\*)/g, '\n$1\n')

  // Add missing line breaks before numbered / bulleted lists (model sometimes streams them without breaks).
  text = text.replace(/([^\n])(\d+\.\s)/g, '$1\n$2')
  text = text.replace(/([^\n])([-*•]\s)/g, '$1\n$2')

  // If a list starts immediately after a colon/semicolon, give it breathing room.
  text = text.replace(/([:;])\s*(\d+\.\s)/g, '$1\n\n$2')

  // Collapse any excessive blank lines so spacing stays neat.
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}
