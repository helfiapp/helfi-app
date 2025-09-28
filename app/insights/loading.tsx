export default function InsightsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-6 animate-pulse">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="h-3 w-24 rounded-full bg-gray-200" />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="h-7 w-52 rounded-full bg-gray-200" />
              <div className="h-4 w-72 rounded-full bg-gray-200" />
            </div>
            <div className="h-3 w-40 rounded-full bg-gray-200" />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        {[0, 1, 2].map((row) => (
          <section key={row} className="space-y-3">
            <div className="h-4 w-40 rounded-full bg-gray-200" />
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 animate-pulse">
              <div className="h-4 w-full rounded-full bg-gray-200" />
              <div className="h-4 w-5/6 rounded-full bg-gray-200" />
              <div className="h-4 w-2/3 rounded-full bg-gray-200" />
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
