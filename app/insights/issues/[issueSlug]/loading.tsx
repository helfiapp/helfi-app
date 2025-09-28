export default function IssueWorkspaceLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-6 animate-pulse">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="h-4 w-24 rounded-full bg-gray-200" />
          <div className="h-8 w-2/5 rounded-full bg-gray-200" />
          <div className="h-4 w-1/3 rounded-full bg-gray-200" />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div className="space-y-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3 animate-pulse">
              <div className="h-4 w-36 rounded-full bg-gray-200" />
              <div className="h-4 w-3/4 rounded-full bg-gray-200" />
              <div className="h-4 w-2/3 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
