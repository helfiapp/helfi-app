'use client'

import React from 'react'
import { formatChatContent } from '@/lib/chatFormatting'

type ChatRichTextProps = {
  content: string
  headings?: string[]
  className?: string
  paragraphClassName?: string
  lineClassName?: string
  headingClassName?: string
  listRowClassName?: string
  useMacroColors?: boolean
}

const MACRO_COLOR_MAP: Record<string, string> = {
  protein: '#ef4444',
  carbs: '#22c55e',
  fat: '#6366f1',
  fiber: '#12adc9',
  fibre: '#12adc9',
  sugar: '#f97316',
}

const HEADING_LABELS = ['Macros', 'After eating', 'Current totals', 'Consumed', 'Targets', 'Remaining']
const HEADING_REGEX = new RegExp(`^(${HEADING_LABELS.join('|')}):\\s*`, 'i')
const OPTION_REGEX = /^Option\s+\d+:\s*/i

function normalizeForDisplay(raw: string, headings?: string[]): string {
  let text = formatChatContent(raw || '', { headings }).replace(/\r\n/g, '\n')
  text = text.replace(/\*\*([^*\n]+)\*/g, '**$1**')
  text = text.replace(/\*([^*\n]+)\*\*/g, '**$1**')
  text = text.replace(/\u2022/g, '•')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

function shouldNormalizeMacros(value: string): boolean {
  const text = String(value || '')
  return (
    /(?:kcal|calories|protein|carbs|fat|fiber|fibre|sugar)/i.test(text) &&
    /(?:\d|kcal|\bg\b|unknown|approximate|n\/a)/i.test(text)
  )
}

function normalizeMacroSeparators(value: string, useMacroColors: boolean): string {
  if (!useMacroColors) return String(value || '')
  if (!shouldNormalizeMacros(value)) return String(value || '')
  return String(value || '')
    .replace(/,\s+/g, ' - ')
    .replace(/\s+-\s+/g, ' - ')
    .trim()
}

function resolveMacroColor(part: string, useMacroColors: boolean): string | undefined {
  if (!useMacroColors || !shouldNormalizeMacros(part)) return undefined
  const lower = part.toLowerCase()
  const key = Object.keys(MACRO_COLOR_MAP).find((macro) => lower.includes(macro))
  return key ? MACRO_COLOR_MAP[key] : undefined
}

function renderInlineSegments(
  text: string,
  options?: { boldAll?: boolean; useMacroColors?: boolean }
): React.ReactNode[] {
  const normalized = normalizeMacroSeparators(String(text || ''), Boolean(options?.useMacroColors))
  const parts = normalized.split(/(\*\*.*?\*\*)/g)
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={`seg-${index}`} className="font-semibold">
            {part.slice(2, -2).replace(/\*/g, '')}
          </strong>
        )
      }
      const cleaned = part.replace(/\*/g, '')
      const macroColor = resolveMacroColor(cleaned, Boolean(options?.useMacroColors))
      return (
        <span
          key={`seg-${index}`}
          style={macroColor ? { color: macroColor } : undefined}
          className={macroColor || options?.boldAll ? 'font-semibold' : undefined}
        >
          {cleaned}
        </span>
      )
    })
}

export default function ChatRichText({
  content,
  headings,
  className = 'text-[19px] md:text-[17px] leading-[1.7] text-gray-900',
  paragraphClassName = 'mt-4 first:mt-0',
  lineClassName = 'mt-2 first:mt-0',
  headingClassName = 'mt-3 first:mt-0 text-[21px] md:text-[18px] leading-[1.5] font-semibold text-gray-900',
  listRowClassName = 'ml-4 mb-1.5',
  useMacroColors = false,
}: ChatRichTextProps) {
  const formatted = normalizeForDisplay(content, headings)
  const paragraphs = formatted.split(/\n\n+/).filter((entry) => entry.trim().length > 0)

  return (
    <div className={className}>
      {paragraphs.map((paragraph, paragraphIndex) => {
        const lines = paragraph.split('\n')
        return (
          <div key={`para-${paragraphIndex}`} className={paragraphClassName}>
            {lines.map((line, lineIndex) => {
              const trimmed = line.trim()
              if (!trimmed) return <div key={`line-${lineIndex}`} className="h-2" />

              const boldLine = trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4
              const lineContent = boldLine ? trimmed.slice(2, -2).trim() : trimmed
              const headingSource = lineContent.replace(/^\*\*([^*]+)\*\*/, '$1')
              const optionSource = headingSource.replace(/^\*\*(Option\s+\d+:)\*\*/i, '$1')

              const macroHeadingMatch = headingSource.match(/^Macros(?:\s*\([^)]+\))?:?\s*(.*)$/i)
              if (macroHeadingMatch) {
                const label = headingSource.split(':')[0].trim() || 'Macros'
                const rest = macroHeadingMatch[1] || ''
                return (
                  <div key={`line-${lineIndex}`} className={lineClassName}>
                    <strong className="font-semibold text-gray-900">{label}: </strong>
                    {renderInlineSegments(rest)}
                  </div>
                )
              }

              const headingMatch = headingSource.match(HEADING_REGEX)
              if (headingMatch) {
                const label = headingMatch[1]
                const rest = headingSource.replace(HEADING_REGEX, '')
                return (
                  <div key={`line-${lineIndex}`} className={lineClassName}>
                    <strong className="font-semibold text-gray-900">{label}: </strong>
                    {renderInlineSegments(rest)}
                  </div>
                )
              }

              const optionMatch = optionSource.match(OPTION_REGEX)
              if (optionMatch) {
                const label = optionMatch[0].trim()
                const rest = optionSource.replace(OPTION_REGEX, '')
                return (
                  <div key={`line-${lineIndex}`} className={lineClassName}>
                    <strong className="font-semibold text-gray-900">{label} </strong>
                    {renderInlineSegments(rest)}
                  </div>
                )
              }

              const numberedMatch = lineContent.match(/^(\d+)\.\s+(.+)$/)
              if (numberedMatch) {
                return (
                  <div key={`line-${lineIndex}`} className={listRowClassName}>
                    <span className="font-medium">{numberedMatch[1]}.</span>{' '}
                    {renderInlineSegments(numberedMatch[2], { boldAll: boldLine, useMacroColors })}
                  </div>
                )
              }

              const bulletMatch = lineContent.match(/^[-•*]\s+(.+)$/)
              if (bulletMatch) {
                return (
                  <div key={`line-${lineIndex}`} className={listRowClassName}>
                    <span className="mr-2">•</span>
                    {renderInlineSegments(bulletMatch[1], { boldAll: boldLine, useMacroColors })}
                  </div>
                )
              }

              if (boldLine && lineContent.length <= 90 && !lineContent.includes(':')) {
                return (
                  <div key={`line-${lineIndex}`} className={headingClassName}>
                    {renderInlineSegments(lineContent, { boldAll: true, useMacroColors })}
                  </div>
                )
              }

              return (
                <div key={`line-${lineIndex}`} className={lineClassName}>
                  {renderInlineSegments(lineContent, { boldAll: boldLine, useMacroColors })}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

