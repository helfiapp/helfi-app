'use client'

import React from 'react'

function mouthPath(level: number) {
  // 1..7 where 1 is very low and 7 is very high
  if (level <= 2) return 'M10 19c2.5-2 5.5-2 8 0' // frown
  if (level === 3) return 'M10 18c2-1.2 6-1.2 8 0' // slight frown
  if (level === 4) return 'M10 17.5h8' // neutral
  if (level === 5) return 'M10 17c2 1.2 6 1.2 8 0' // slight smile
  return 'M10 16c2.5 2 5.5 2 8 0' // smile
}

export default function MoodFaceIcon({
  level,
  selected,
}: {
  level: number
  selected?: boolean
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className="w-9 h-9"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="currentColor"
        opacity={selected ? 0.18 : 0.12}
      />
      <circle cx="12.5" cy="13.5" r="1.2" fill="currentColor" opacity={selected ? 0.9 : 0.7} />
      <circle cx="19.5" cy="13.5" r="1.2" fill="currentColor" opacity={selected ? 0.9 : 0.7} />
      <path
        d={mouthPath(level)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity={selected ? 0.95 : 0.8}
      />
    </svg>
  )
}

