export default function InsightsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-sm text-gray-500">Loading Insights...</div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center gap-4 text-gray-600">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-helfi-green border-t-transparent" />
          <p className="text-sm font-medium">Getting things ready. This should only take a moment.</p>
        </div>
      </main>
    </div>
  )
}
