'use client'

import { useMemo } from 'react'

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
  title,
  options,
  selectedIndex,
  onSelect,
}: {
  title: string
  options: string[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const offsets = [-2, -1, 0, 1, 2]
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 text-center">{title}</div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => onSelect(cycleIndex(selectedIndex - 1, options.length))}
          className="w-full h-7 text-gray-500 hover:bg-gray-50"
          aria-label={`${title} up`}
        >
          ^
        </button>
        <div className="border-y border-gray-100 bg-gradient-to-b from-gray-50 to-white px-1 py-1">
          {offsets.map((offset) => {
            const index = cycleIndex(selectedIndex + offset, options.length)
            const selected = offset === 0
            const faded = Math.abs(offset) === 2
            return (
              <button
                key={`${title}-${offset}-${index}`}
                type="button"
                onClick={() => onSelect(index)}
                className={`w-full h-8 rounded-md text-sm transition ${
                  selected
                    ? 'bg-emerald-500 text-white font-semibold shadow-sm'
                    : faded
                    ? 'text-gray-300'
                    : 'text-gray-700 hover:bg-emerald-50'
                }`}
              >
                {options[index]}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => onSelect(cycleIndex(selectedIndex + 1, options.length))}
          className="w-full h-7 text-gray-500 hover:bg-gray-50"
          aria-label={`${title} down`}
        >
          v
        </button>
      </div>
    </div>
  )
}

export default function RollerTimePicker({ value, onChange, className }: RollerTimePickerProps) {
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

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-3 sm:p-4${classValue}`}>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <WheelColumn title="Hour" options={hours} selectedIndex={hourIndex} onSelect={applyHourIndex} />
        <WheelColumn title="Minute" options={minutes} selectedIndex={minuteIndex} onSelect={applyMinuteIndex} />
        <WheelColumn title="AM/PM" options={[...meridiems]} selectedIndex={meridiemIndex} onSelect={applyMeridiemIndex} />
      </div>
      <div className="mt-2 text-center text-xs text-gray-500">Selected time: {display}</div>
    </div>
  )
}

