export const dynamic = 'force-dynamic'

export default function PwaStart() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 p-6">
      <div className="max-w-md w-full space-y-6 text-center bg-white shadow-lg rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-helfi-black">Helfi PWA Launcher</h1>
        <p className="text-gray-700">
          This helper page is only for installing the app to your Home Screen. After adding it, opening the
          icon will take you straight to the app.
        </p>
        <a
          href="/healthapp"
          className="inline-flex items-center justify-center rounded-lg bg-helfi-green text-white px-4 py-3 font-semibold shadow-sm"
        >
          Open the app (healthapp)
        </a>
        <p className="text-sm text-gray-600">
          If you reached this page while installing, tap the Share button and choose “Add to Home Screen”.
        </p>
      </div>
    </div>
  )
}
