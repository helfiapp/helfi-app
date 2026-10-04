type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar'
type NutrientValues = Partial<Record<NutrientKey, number | null>>

const CARDS = [
  { key: 'calories', label: 'Calories', bg: 'from-orange-50 to-orange-100', border: 'border-orange-200', color: 'text-orange-500' },
  { key: 'protein', label: 'Protein', bg: 'from-blue-50 to-blue-100', border: 'border-blue-200', color: 'text-blue-500' },
  { key: 'carbs', label: 'Carbs', bg: 'from-green-50 to-green-100', border: 'border-green-200', color: 'text-green-500' },
  { key: 'fat', label: 'Fat', bg: 'from-purple-50 to-purple-100', border: 'border-purple-200', color: 'text-purple-500' },
  { key: 'fiber', label: 'Fibre', bg: 'from-yellow-50 to-yellow-100', border: 'border-yellow-200', color: 'text-yellow-500' },
  { key: 'sugar', label: 'Sugar', bg: 'from-pink-50 to-pink-100', border: 'border-pink-200', color: 'text-pink-500' },
] as const

export default function NutrientCards({ values, energyUnit = 'kcal' }: { values: NutrientValues; energyUnit?: 'kcal' | 'kJ' }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {CARDS.map((card) => {
        const value = values[card.key]
        const known = typeof value === 'number' && Number.isFinite(value)
        const label = card.key === 'calories' && energyUnit === 'kJ' ? 'Kilojoules' : card.label
        const display = !known ? '—' : card.key === 'calories'
          ? `${Math.round(value * (energyUnit === 'kJ' ? 4.184 : 1))} ${energyUnit}`
          : `${Math.round(value * 10) / 10} g`
        return (
          <div key={card.key} aria-label={`${label}: ${display}`} className={`rounded-2xl border bg-gradient-to-br p-4 ${card.bg} ${card.border}`}>
            <div className={`text-xl font-bold ${card.color}`}>{display}</div>
            <div className="mt-1.5 text-xs font-semibold uppercase text-gray-600">{label}</div>
          </div>
        )
      })}
    </div>
  )
}
