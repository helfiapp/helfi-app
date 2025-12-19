'use client'

import React from 'react'

type DietIconProps = {
  dietId: string
  size?: number
}

const pickPalette = (dietId: string) => {
  const id = (dietId || '').toLowerCase()
  if (id.includes('vegan') || id.includes('plant') || id.includes('vegetarian') || id.includes('wfpb')) {
    return { bg: '#E8F7EE', stroke: '#19A463', fg: '#0B6B42' }
  }
  if (id.includes('keto') || id.includes('low-carb') || id.includes('atkins') || id.includes('zero-carb')) {
    return { bg: '#F1EDFF', stroke: '#6D4CFF', fg: '#3B2AA8' }
  }
  if (id.includes('gluten') || id.includes('grain') || id.includes('wheat')) {
    return { bg: '#FFF3E6', stroke: '#FF8A00', fg: '#B85E00' }
  }
  if (id.includes('fast') || id.includes('omad') || id.includes('time')) {
    return { bg: '#E9F4FF', stroke: '#2E7CF6', fg: '#1A4EA6' }
  }
  if (id.includes('medical') || id.includes('renal') || id.includes('gerd') || id.includes('diabetic') || id.includes('histamine')) {
    return { bg: '#FFE8EE', stroke: '#E63973', fg: '#8E1D44' }
  }
  if (id.includes('halal') || id.includes('kosher') || id.includes('jain') || id.includes('buddhist')) {
    return { bg: '#EAF3FF', stroke: '#3366FF', fg: '#1F3FA6' }
  }
  if (id.includes('carnivore') || id.includes('lion') || id.includes('paleo') || id.includes('primal')) {
    return { bg: '#FFEFEA', stroke: '#FF5A1F', fg: '#A82E07' }
  }
  return { bg: '#F3F4F6', stroke: '#6B7280', fg: '#374151' }
}

const initialsForDiet = (dietId: string) => {
  const id = (dietId || '').toString().trim()
  if (!id) return '?'
  const parts = id
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '')
  return (initials.join('') || id.slice(0, 2).toUpperCase()).slice(0, 2)
}

const pickGlyph = (dietId: string) => {
  const id = (dietId || '').toLowerCase()
  if (id.includes('vegan') || id.includes('plant') || id.includes('vegetarian') || id.includes('wfpb')) return 'leaf'
  if (id.includes('carnivore') || id.includes('lion') || id.includes('paleo') || id.includes('primal')) return 'steak'
  if (id.includes('keto') || id.includes('low-carb') || id.includes('atkins') || id.includes('zero-carb')) return 'bolt'
  if (id.includes('gluten') || id.includes('wheat') || id.includes('grain')) return 'wheat'
  if (id.includes('fast') || id.includes('omad') || id.includes('time')) return 'clock'
  if (id.includes('halal') || id.includes('kosher') || id.includes('jain') || id.includes('buddhist')) return 'star'
  if (id.includes('renal') || id.includes('diabetic') || id.includes('gerd') || id.includes('histamine') || id.includes('oxalate') || id.includes('purine')) return 'shield'
  if (id.includes('mediterranean') || id.includes('nordic')) return 'fish'
  return 'plate'
}

export default function DietIcon({ dietId, size = 44 }: DietIconProps) {
  const palette = pickPalette(dietId)
  const glyph = pickGlyph(dietId)
  const initials = initialsForDiet(dietId)
  const s = Math.max(28, size)
  const strokeWidth = 2

  const common = {
    fill: 'none',
    stroke: palette.fg,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <svg width={s} height={s} viewBox="0 0 64 64" role="img" aria-label="" className="select-none">
      <rect x="4" y="4" width="56" height="56" rx="16" fill={palette.bg} stroke={palette.stroke} strokeWidth={2.5} />

      {glyph === 'leaf' && (
        <>
          <path {...common} d="M40 20c-10 2-18 10-20 20c10-2 18-10 20-20Z" />
          <path {...common} d="M22 40c6-4 12-8 18-12" />
        </>
      )}
      {glyph === 'steak' && (
        <>
          <path
            {...common}
            d="M21 26c4-6 14-8 21-3c7 5 6 16-2 20c-8 4-18 1-21-6c-2-4-1-8 2-11Z"
          />
          <circle cx="38" cy="34" r="4" fill={palette.fg} opacity="0.15" />
        </>
      )}
      {glyph === 'bolt' && <path {...common} d="M34 18l-10 18h10l-4 10l14-20H34l4-8Z" />}
      {glyph === 'wheat' && (
        <>
          <path {...common} d="M32 18v28" />
          <path {...common} d="M32 22c-5 2-8 6-8 10c5-2 8-6 8-10Z" />
          <path {...common} d="M32 22c5 2 8 6 8 10c-5-2-8-6-8-10Z" />
          <path {...common} d="M32 32c-5 2-8 6-8 10c5-2 8-6 8-10Z" />
          <path {...common} d="M32 32c5 2 8 6 8 10c-5-2-8-6-8-10Z" />
        </>
      )}
      {glyph === 'clock' && (
        <>
          <circle cx="32" cy="32" r="14" fill="none" stroke={palette.fg} strokeWidth={strokeWidth} />
          <path {...common} d="M32 24v9l6 4" />
        </>
      )}
      {glyph === 'star' && (
        <path
          {...common}
          d="M32 20l3 7l8 1l-6 5l2 8l-7-4l-7 4l2-8l-6-5l8-1l3-7Z"
        />
      )}
      {glyph === 'shield' && (
        <>
          <path {...common} d="M32 18l12 6v10c0 10-6 16-12 18c-6-2-12-8-12-18V24l12-6Z" />
          <path {...common} d="M28 34l3 3l6-8" />
        </>
      )}
      {glyph === 'fish' && (
        <>
          <path {...common} d="M22 34c6-8 14-10 22-6c2 1 4 3 6 6c-2 3-4 5-6 6c-8 4-16 2-22-6Z" />
          <circle cx="40" cy="33" r="1.5" fill={palette.fg} />
          <path {...common} d="M22 34l-6-4v8l6-4Z" />
        </>
      )}
      {glyph === 'plate' && (
        <>
          <circle cx="32" cy="32" r="14" fill="none" stroke={palette.fg} strokeWidth={strokeWidth} />
          <circle cx="32" cy="32" r="6" fill={palette.fg} opacity="0.08" />
        </>
      )}

      <g>
        <rect x="12" y="44" width="40" height="12" rx="6" fill="white" opacity="0.85" />
        <text x="32" y="53" textAnchor="middle" fontSize="9.5" fontWeight="700" fill={palette.fg} style={{ letterSpacing: 1 }}>
          {initials}
        </text>
      </g>
    </svg>
  )
}

