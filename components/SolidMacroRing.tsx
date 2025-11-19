'use client'
import React from 'react'

type SolidRingProps = {
  label: string
  value: string | number
  unit?: string
  color: string
  size?: 'normal' | 'large'
}

export function SolidMacroRing({ label, value, unit, color, size = 'normal' }: SolidRingProps) {
  // Dimensions based on the screenshot and user description
  // "normal" size (similar to screenshot) -> ~90px? 
  // Let's stick to a fixed svg size for consistency.
  const svgSize = size === 'large' ? 120 : 100
  const radius = size === 'large' ? 52 : 42
  const strokeWidth = size === 'large' ? 10 : 8
  const center = svgSize / 2
  
  // Circumference for full circle
  const circumference = 2 * Math.PI * radius

  // We want a SOLID line all around (full circle).
  // Background inside is transparent.
  // Value in middle, label under value.
  
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center">
        <svg width={svgSize} height={svgSize} className="transform -rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
            stroke={color}
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        
        {/* Centered Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-gray-900 leading-none">
            {value}
          </div>
          {unit ? (
            <div className="text-sm font-medium text-gray-500 mt-0.5 leading-none">
              {unit}
            </div>
          ) : (
            <div className="text-sm font-medium text-gray-500 mt-0.5 leading-none">
              kcal
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

