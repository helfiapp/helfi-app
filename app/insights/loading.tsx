'use client'

export default function InsightsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-7xl mx-auto text-center">
          <div className="h-3 w-24 bg-gray-200 rounded mx-auto mb-3 animate-pulse" />
          <div className="h-8 w-64 bg-gray-200 rounded mx-auto animate-pulse" />
          <div className="h-4 w-80 bg-gray-200 rounded mx-auto mt-3 animate-pulse" />
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {[...Array(5)].map((_, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 px-5 py-4 border-b last:border-b-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
                <div className="min-w-0">
                  <div className="h-3 w-40 bg-gray-200 rounded animate-pulse" />
                  <div className="h-5 w-56 bg-gray-200 rounded mt-2 animate-pulse" />
                  <div className="h-4 w-32 bg-gray-200 rounded mt-2 animate-pulse" />
                </div>
              </div>
              <div className="h-6 w-6 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}


