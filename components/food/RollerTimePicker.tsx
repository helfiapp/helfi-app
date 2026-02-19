'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type RollerTimePickerProps = {
  value: string
  onChange: (next: string) => void
  className?: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const parseTime24 = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) {
    const now = new Date()
    return { hour24: now.getHours(), minute: now.getMinutes() }
  }
  const [hRaw, mRaw] = value.split(':').map((v) => parseInt(v, 10))
  const hour24 = Number.isFinite(hRaw) ? Math.min(23, Math.max(0, hRaw)) : 0
  const minute = Number.isFinite(mRaw) ? Math.min(59, Math.max(0, mRaw)) : 0
  return { hour24, minute }
}

const toTime24 = (hour12: number, minute: number, meridiem: 'AM' | 'PM') => {
  const normalizedHour12 = Math.min(12, Math.max(1, hour12))
  const base = normalizedHour12 % 12
  const hour24 = meridiem === 'PM' ? base + 12 : base
  return `${pad2(hour24)}:${pad2(Math.min(59, Math.max(0, minute)))}`
}

const cycleIndex = (index: number, total: number) => {
  if (total <= 0) return 0
  return ((index % total) + total) % total
}

function WheelColumn({
  options,
  selectedIndex,
  onSelect,
  ariaLabel,
}: {
  options: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  ariaLabel: string
}) {
  const offsets = [-2, -1, 0, 1, 2]
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => onSelect(cycleIndex(selectedIndex - 1, options.length))}
        className="h-5 w-14 rounded-md text-gray-500 hover:bg-gray-100"
        aria-label={`${ariaLabel} up`}
      >
        ^
      </button>

      <div className="relative h-28 w-14 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 h-7 -translate-y-1/2 rounded-md border border-emerald-200 bg-emerald-50" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
        <div className="relative z-10 flex h-full flex-col justify-center">
          {offsets.map((offset) => {
            const index = cycleIndex(selectedIndex + offset, options.length)
            const selected = offset === 0
            const faded = Math.abs(offset) === 2
            return (
              <button
                key={`${ariaLabel}-${offset}-${index}`}
                type="button"
                onClick={() => onSelect(index)}
                className={`h-7 w-full text-sm transition ${
                  selected ? 'font-semibold text-emerald-700' : faded ? 'text-gray-300' : 'text-gray-600 hover:text-gray-900'
                }`}
                aria-label={`${ariaLabel} ${options[index]}`}
              >
                {options[index]}
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSelect(cycleIndex(selectedIndex + 1, options.length))}
        className="h-5 w-14 rounded-md text-gray-500 hover:bg-gray-100"
        aria-label={`${ariaLabel} down`}
      >
        v
      </button>
    </div>
  )
}

export default function RollerTimePicker({ value, onChange, className }: RollerTimePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const { hour24, minute } = useMemo(() => parseTime24(value), [value])
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const meridiem: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM'

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => pad2(i + 1)), [])
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => pad2(i)), [])
  const meridiems = ['AM', 'PM'] as const

  const hourIndex = hour12 - 1
  const minuteIndex = minute
  const meridiemIndex = meridiems.indexOf(meridiem)

  const applyHourIndex = (nextIndex: number) => {
    const nextHour12 = nextIndex + 1
    onChange(toTime24(nextHour12, minute, meridiem))
  }

  const applyMinuteIndex = (nextIndex: number) => {
    onChange(toTime24(hour12, nextIndex, meridiem))
  }

  const applyMeridiemIndex = (nextIndex: number) => {
    const nextMeridiem = meridiems[cycleIndex(nextIndex, meridiems.length)]
    onChange(toTime24(hour12, minute, nextMeridiem))
  }

  const classValue = className ? ` ${className}` : ''
  const display = `${pad2(hour12)}:${pad2(minute)} ${meridiem.toLowerCase()}`

  useEffect(() => {
    if (!open) return

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative${classValue}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-900 shadow-sm hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        aria-label="Change entry time"
        aria-expanded={open}
      >
        <span className="flex items-center justify-between">
          <span>{display}</span>
          <span className="text-xs text-gray-500">{open ? 'Hide' : 'Edit'}</span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-[min(92vw,280px)] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Select time</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Done
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <WheelColumn ariaLabel="Hour" options={hours} selectedIndex={hourIndex} onSelect={applyHourIndex} />
            <WheelColumn ariaLabel="Minute" options={minutes} selectedIndex={minuteIndex} onSelect={applyMinuteIndex} />
            <WheelColumn ariaLabel="AM/PM" options={[...meridiems]} selectedIndex={meridiemIndex} onSelect={applyMeridiemIndex} />
          </div>
        </div>
      )}
    </div>
  )
}
