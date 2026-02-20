'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type RollerTimePickerProps = {
  value: string
  onChange: (next: string) => void
  className?: string
}

const ITEM_HEIGHT = 36
const VISIBLE_ROWS = 5
const VIEWPORT_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS
const CENTER_OFFSET = (VIEWPORT_HEIGHT - ITEM_HEIGHT) / 2
const INFINITE_REPEAT_BLOCKS = 12

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

function InfiniteWheelColumn({
  label,
  options,
  selectedIndex,
  onSelect,
  enabled,
}: {
  label: string
  options: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  enabled: boolean
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const wheelRemainderRef = useRef(0)
  const lastWheelDirectionRef = useRef<1 | -1 | 0>(0)
  const lastWheelTsRef = useRef(0)
  const itemCount = options.length * INFINITE_REPEAT_BLOCKS
  const displayValues = useMemo(() => Array.from({ length: itemCount }, (_, i) => options[i % options.length]), [itemCount, options])

  const scrollToIndex = useCallback(
    (targetIndex: number, behavior: ScrollBehavior = 'auto') => {
      const el = scrollRef.current
      if (!el) return
      const raw = Math.floor(INFINITE_REPEAT_BLOCKS / 2) * options.length + targetIndex
      el.scrollTo({ top: raw * ITEM_HEIGHT - CENTER_OFFSET, behavior })
    },
    [options.length],
  )

  useEffect(() => {
    if (!enabled) return
    scrollToIndex(selectedIndex, 'auto')
  }, [enabled, selectedIndex, scrollToIndex])

  const step = (delta: number) => {
    const next = (selectedIndex + delta + options.length) % options.length
    onSelect(next)
    scrollToIndex(next, 'auto')
  }

  const handleWheelStep = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rawDelta = Number(event.deltaY)
    if (!Number.isFinite(rawDelta) || rawDelta === 0) return

    const scale = event.deltaMode === 1 ? ITEM_HEIGHT / 3 : event.deltaMode === 2 ? ITEM_HEIGHT : 1
    const delta = rawDelta * scale
    if (Math.abs(delta) < 3) return

    const direction: 1 | -1 = delta > 0 ? 1 : -1
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = now - lastWheelTsRef.current

    if (elapsed > 180 || direction !== lastWheelDirectionRef.current) {
      wheelRemainderRef.current = 0
    }

    lastWheelDirectionRef.current = direction
    lastWheelTsRef.current = now
    wheelRemainderRef.current += delta

    const threshold = 26
    if (wheelRemainderRef.current >= threshold) {
      step(1)
      wheelRemainderRef.current -= threshold
    } else if (wheelRemainderRef.current <= -threshold) {
      step(-1)
      wheelRemainderRef.current += threshold
    }
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return

    const raw = Math.round((el.scrollTop + CENTER_OFFSET) / ITEM_HEIGHT)
    const normalized = ((raw % options.length) + options.length) % options.length

    if (normalized !== selectedIndex) onSelect(normalized)

    const minRaw = options.length * 2
    const maxRaw = itemCount - options.length * 2
    if (raw < minRaw || raw > maxRaw) {
      const centeredRaw = Math.floor(INFINITE_REPEAT_BLOCKS / 2) * options.length + normalized
      el.scrollTop = centeredRaw * ITEM_HEIGHT - CENTER_OFFSET
    }
  }

  return (
    <div className="w-20">
      <div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mb-1 hidden justify-center md:flex">
        <button
          type="button"
          onClick={() => step(-1)}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          aria-label={`${label} up`}
        >
          ^
        </button>
      </div>
      <div className="relative h-[180px] rounded-xl border border-gray-200 bg-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-white to-transparent" />

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onWheel={handleWheelStep}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              step(-1)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              step(1)
            }
          }}
          tabIndex={0}
          className="scrollbar-hide relative z-10 h-full overflow-y-auto overscroll-contain snap-y snap-mandatory touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {displayValues.map((value, i) => {
            const isSelected = options[((i % options.length) + options.length) % options.length] === options[selectedIndex]
            return (
              <button
                key={`${label}-${i}-${value}`}
                type="button"
                onClick={() => {
                  const next = i % options.length
                  onSelect(next)
                  scrollToIndex(next, 'auto')
                }}
                className={`flex h-9 w-full snap-center items-center justify-center text-base transition ${
                  isSelected ? 'mx-1 rounded-md bg-emerald-500 font-semibold text-white shadow-sm' : 'text-gray-600'
                }`}
              >
                {value}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-1 hidden justify-center md:flex">
        <button
          type="button"
          onClick={() => step(1)}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          aria-label={`${label} down`}
        >
          v
        </button>
      </div>
    </div>
  )
}

function FiniteWheelColumn({
  label,
  options,
  selectedIndex,
  onSelect,
  enabled,
}: {
  label: string
  options: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  enabled: boolean
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const wheelRemainderRef = useRef(0)
  const lastWheelDirectionRef = useRef<1 | -1 | 0>(0)
  const lastWheelTsRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: selectedIndex * ITEM_HEIGHT, behavior: 'auto' })
  }, [enabled, selectedIndex])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const raw = Math.round(el.scrollTop / ITEM_HEIGHT)
    const clamped = Math.min(options.length - 1, Math.max(0, raw))
    if (clamped !== selectedIndex) onSelect(clamped)
  }

  const step = (delta: number) => {
    const next = Math.min(options.length - 1, Math.max(0, selectedIndex + delta))
    if (next !== selectedIndex) onSelect(next)
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: next * ITEM_HEIGHT, behavior: 'auto' })
    }
  }

  const handleWheelStep = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rawDelta = Number(event.deltaY)
    if (!Number.isFinite(rawDelta) || rawDelta === 0) return

    const scale = event.deltaMode === 1 ? ITEM_HEIGHT / 3 : event.deltaMode === 2 ? ITEM_HEIGHT : 1
    const delta = rawDelta * scale
    if (Math.abs(delta) < 3) return

    const direction: 1 | -1 = delta > 0 ? 1 : -1
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = now - lastWheelTsRef.current

    if (elapsed > 180 || direction !== lastWheelDirectionRef.current) {
      wheelRemainderRef.current = 0
    }

    lastWheelDirectionRef.current = direction
    lastWheelTsRef.current = now
    wheelRemainderRef.current += delta

    const threshold = 26
    if (wheelRemainderRef.current >= threshold) {
      step(1)
      wheelRemainderRef.current -= threshold
    } else if (wheelRemainderRef.current <= -threshold) {
      step(-1)
      wheelRemainderRef.current += threshold
    }
  }

  return (
    <div className="w-20">
      <div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mb-1 hidden justify-center md:flex">
        <button
          type="button"
          onClick={() => step(-1)}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          aria-label={`${label} up`}
        >
          ^
        </button>
      </div>
      <div className="relative h-[180px] rounded-xl border border-gray-200 bg-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-white to-transparent" />

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onWheel={handleWheelStep}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              step(-1)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              step(1)
            }
          }}
          tabIndex={0}
          className="scrollbar-hide relative z-10 h-full overflow-y-auto overscroll-contain snap-y snap-mandatory touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div style={{ height: CENTER_OFFSET }} />
          {options.map((value, i) => {
            const isSelected = i === selectedIndex
            return (
              <button
                key={`${label}-${value}`}
                type="button"
                onClick={() => onSelect(i)}
                className={`flex h-9 w-full snap-center items-center justify-center text-base transition ${
                  isSelected ? 'mx-1 rounded-md bg-emerald-500 font-semibold text-white shadow-sm' : 'text-gray-600'
                }`}
              >
                {value}
              </button>
            )
          })}
          <div style={{ height: CENTER_OFFSET }} />
        </div>
      </div>
      <div className="mt-1 hidden justify-center md:flex">
        <button
          type="button"
          onClick={() => step(1)}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          aria-label={`${label} down`}
        >
          v
        </button>
      </div>
    </div>
  )
}

export default function RollerTimePicker({ value, onChange, className }: RollerTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [openAbove, setOpenAbove] = useState(false)
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
    onChange(toTime24(nextIndex + 1, minute, meridiem))
  }

  const applyMinuteIndex = (nextIndex: number) => {
    onChange(toTime24(hour12, nextIndex, meridiem))
  }

  const applyMeridiemIndex = (nextIndex: number) => {
    onChange(toTime24(hour12, minute, meridiems[nextIndex] || 'AM'))
  }

  const classValue = className ? ` ${className}` : ''
  const display = `${pad2(hour12)}:${pad2(minute)} ${meridiem.toLowerCase()}`

  const updatePlacement = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    const estimatedPopoverHeight = 300
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    setOpenAbove(spaceBelow < estimatedPopoverHeight && spaceAbove > spaceBelow)
  }

  useEffect(() => {
    if (!open) return
    updatePlacement()

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
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [open])

  const togglePicker = () => {
    if (open) {
      setOpen(false)
      return
    }
    updatePlacement()
    setOpen(true)
  }

  return (
    <div ref={rootRef} className={`relative${classValue}`}>
      <button
        type="button"
        onClick={togglePicker}
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
        <div
          className={`absolute left-0 z-50 w-[min(96vw,340px)] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl ${
            openAbove ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
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

          <div className="flex items-start justify-between gap-2">
            <InfiniteWheelColumn label="Hour" options={hours} selectedIndex={hourIndex} onSelect={applyHourIndex} enabled={open} />
            <InfiniteWheelColumn label="Minute" options={minutes} selectedIndex={minuteIndex} onSelect={applyMinuteIndex} enabled={open} />
            <FiniteWheelColumn
              label="AM/PM"
              options={[...meridiems]}
              selectedIndex={meridiemIndex}
              onSelect={applyMeridiemIndex}
              enabled={open}
            />
          </div>
        </div>
      )}

      {open && !openAbove && <div className="h-16" aria-hidden="true" />}
    </div>
  )
}
