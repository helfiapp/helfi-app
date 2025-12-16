'use client'

import { useMemo, useState } from 'react'

type MacroTotals = {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
}

const safeNumber = (value: any) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const kcalToKj = (kcal: number) => kcal * 4.184

export default function DailyMacroSummary({ targets, used }: { targets: MacroTotals; used: MacroTotals }) {
  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kJ'>('kcal')

  const rows = useMemo(() => {
    const macroRows = [
      { key: 'protein', label: 'Protein', consumed: safeNumber(used.protein_g), target: safeNumber(targets.protein_g), unit: 'g', color: '#ef4444', cap: false },
      { key: 'carbs', label: 'Carbs', consumed: safeNumber(used.carbs_g), target: safeNumber(targets.carbs_g), unit: 'g', color: '#22c55e', cap: false },
      { key: 'fat', label: 'Fat', consumed: safeNumber(used.fat_g), target: safeNumber(targets.fat_g), unit: 'g', color: '#6366f1', cap: false },
      { key: 'fibre', label: 'Fibre', consumed: safeNumber(used.fiber_g), target: safeNumber(targets.fiber_g), unit: 'g', color: '#12adc9', cap: false },
      { key: 'sugar', label: 'Sugar (max)', consumed: safeNumber(used.sugar_g), target: safeNumber(targets.sugar_g), unit: 'g', color: '#f97316', cap: true },
    ].filter((row) => row.target > 0)

    return macroRows
  }, [targets, used])

  const energy = useMemo(() => {
    const consumedKcal = safeNumber(used.calories)
    const targetKcal = safeNumber(targets.calories)
    if (targetKcal <= 0) return null
    const consumed = energyUnit === 'kJ' ? kcalToKj(consumedKcal) : consumedKcal
    const target = energyUnit === 'kJ' ? kcalToKj(targetKcal) : targetKcal
    const remaining = Math.max(0, target - consumed)
    const pctRaw = target > 0 ? consumed / target : 0
    const percentDisplay = target > 0 ? Math.round(pctRaw * 100) : 0
    const over = percentDisplay > 100
    return {
      label: 'Calories',
      consumed,
      target,
      remaining,
      percentDisplay,
      over,
      unit: energyUnit,
      color: '#10b981',
    }
  }, [energyUnit, targets.calories, used.calories])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-900">Today’s macro summary</div>
        <div className="inline-flex items-center text-[11px] sm:text-xs bg-gray-100 rounded-full p-0.5 border border-gray-200">
          <button
            type="button"
            onClick={() => setEnergyUnit('kcal')}
            className={`px-2 py-0.5 rounded-full ${energyUnit === 'kcal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            kcal
          </button>
          <button
            type="button"
            onClick={() => setEnergyUnit('kJ')}
            className={`px-2 py-0.5 rounded-full ${energyUnit === 'kJ' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            kJ
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {energy && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-900 font-semibold flex items-center gap-2">
                <span>{energy.label}</span>
                <span className="text-gray-700 font-normal">
                  {Math.round(energy.consumed)} / {Math.round(energy.target)} {energy.unit}
                </span>
                <span className="font-semibold" style={{ color: energy.over ? '#ef4444' : energy.color }}>
                  {Math.round(energy.remaining)} {energy.unit} left
                </span>
              </div>
              <div className={`text-xs font-semibold ${energy.over ? 'text-red-600' : 'text-gray-900'}`}>
                {energy.percentDisplay > 0 ? `${energy.percentDisplay}%` : '0%'}
              </div>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, energy.target > 0 ? (energy.consumed / energy.target) * 100 : 0))}%`, backgroundColor: energy.over ? '#ef4444' : energy.color }}
              />
            </div>
          </div>
        )}

        {rows.map((row) => {
          const pctRaw = row.target > 0 ? row.consumed / row.target : 0
          const pct = Math.max(0, pctRaw)
          const percentDisplay = row.target > 0 ? Math.round(pctRaw * 100) : 0
          const over = percentDisplay > 100
          const remaining = Math.max(0, row.target - row.consumed)
          return (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-900 font-semibold flex items-center gap-2">
                  <span>{row.label}</span>
                  <span className="text-gray-700 font-normal">
                    {Math.round(row.consumed)} / {Math.round(row.target)} {row.unit}
                    {row.cap ? ' cap' : ''}
                  </span>
                  <span className="font-semibold" style={{ color: over ? '#ef4444' : row.color }}>
                    {Math.round(remaining)} {row.unit} left
                  </span>
                </div>
                <div className={`text-xs font-semibold ${over ? 'text-red-600' : 'text-gray-900'}`}>
                  {percentDisplay > 0 ? `${percentDisplay}%` : '0%'}
                </div>
              </div>
              <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: over ? '#ef4444' : row.color }}
                />
              </div>
            </div>
          )
        })}

        {rows.length === 0 && (
          <div className="text-xs text-gray-500">Set daily targets in Health Setup to see macro progress.</div>
        )}
      </div>
    </div>
  )
}

