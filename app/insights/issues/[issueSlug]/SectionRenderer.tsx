import type { IssueSectionResult } from '@/lib/insights/issue-engine'

interface SectionRendererProps {
  result: IssueSectionResult
}

export default function SectionRenderer({ result }: SectionRendererProps) {
  const { summary, highlights, dataPoints, recommendations, generatedAt } = result
  return (
    <div className="space-y-8">
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Section summary</h2>
        <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
        <p className="text-xs text-gray-500 mt-4">Generated {new Date(generatedAt).toLocaleString()} • Confidence {(result.confidence * 100).toFixed(0)}%</p>
      </section>

      {highlights.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Key signals</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {highlights.map((highlight, idx) => (
              <div
                key={`${highlight.title}-${idx}`}
                className={`rounded-xl border p-4 ${highlight.tone === 'warning' ? 'border-rose-200 bg-rose-50/60 text-rose-700' : highlight.tone === 'positive' ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700' : 'border-gray-200 bg-white text-gray-700'}`}
              >
                <h4 className="text-sm font-semibold mb-1">{highlight.title}</h4>
                <p className="text-sm leading-relaxed">{highlight.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {dataPoints.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Data points</h3>
          <dl className="grid gap-4 md:grid-cols-2">
            {dataPoints.map((datum, idx) => (
              <div key={`${datum.label}-${idx}`} className="bg-gray-50/70 rounded-lg p-4">
                <dt className="text-xs uppercase text-gray-500 tracking-wide">{datum.label}</dt>
                <dd className="text-base font-semibold text-gray-900">{datum.value}</dd>
                {datum.context && <p className="text-xs text-gray-500 mt-1">{datum.context}</p>}
              </div>
            ))}
          </dl>
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Recommendations</h3>
          <div className="space-y-4">
            {recommendations.map((recommendation, idx) => (
              <div key={`${recommendation.title}-${idx}`} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900">{recommendation.title}</h4>
                    <p className="text-sm text-gray-700 mt-1 leading-relaxed">{recommendation.description}</p>
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${priorityBadgeColor(recommendation.priority)}`}>
                    {recommendation.priority === 'now' ? 'High Priority' : recommendation.priority === 'soon' ? 'Next Focus' : 'Monitor'}
                  </span>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
                  {recommendation.actions.map((action, actionIdx) => (
                    <li key={actionIdx}>{action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function priorityBadgeColor(priority: 'now' | 'soon' | 'monitor') {
  switch (priority) {
    case 'now':
      return 'text-rose-600'
    case 'soon':
      return 'text-amber-600'
    default:
      return 'text-emerald-600'
  }
}

