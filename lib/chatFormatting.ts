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

  // Normalize single-asterisk emphasis to bold so the renderer doesn't show stray asterisks.
  text = text.replace(/(^|[^*])\*([^\s*][^*\n]{0,80}?[^\s*])\*(?!\*)/g, (_match, prefix, inner) => {
    return `${prefix}**${inner}**`
  })

  // Force key headings onto their own line when provided.
  if (options?.headings?.length) {
    for (const heading of options.headings) {
      const pattern = new RegExp(escapeForRegExp(heading), 'g')
      text = text.replace(pattern, `\n${heading}\n`)
    }
  }

  // Add missing line breaks before numbered / bulleted lists (model sometimes streams them without breaks).
  text = text.replace(/([^\n])(\d+\.\s)/g, '$1\n$2')
  text = text.replace(/([^\n])([-*•]\s)/g, '$1\n$2')

  // If a list starts immediately after a colon/semicolon, give it breathing room.
  text = text.replace(/([:;])\s*(\d+\.\s)/g, '$1\n\n$2')

  // Drop lines that are only list markers so they don't render as empty bullets.
  text = text.replace(/^\s*[-*•]\s*$/gm, '')

  // Collapse any excessive blank lines so spacing stays neat.
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}
