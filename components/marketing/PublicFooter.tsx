import Link from 'next/link'

export default function PublicFooter() {
  return (
    <footer className="bg-helfi-black text-white px-4 py-12 mt-14">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="md:col-span-2">
            <div className="text-2xl font-bold mb-4">
              <span className="text-helfi-green">Helfi</span>
            </div>
            <p className="text-gray-400 mb-4">
              Your personal health intelligence platform. Track, analyze, and optimize your wellbeing with
              AI-powered insights.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link href="/" className="hover:text-white">Home</Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-white">Features</Link>
              </li>
              <li>
                <Link href="/news" className="hover:text-white">News</Link>
              </li>
              <li>
                <Link href="/practitioners" className="hover:text-white">Find a practitioner</Link>
              </li>
              <li>
                <Link href="/#pricing" className="hover:text-white">Pricing</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Affiliates</h4>
            <p className="text-gray-400 mb-3 text-sm">Earn by sharing Helfi.</p>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>
                <Link href="/affiliate/apply" className="hover:text-white">
                  Apply to the affiliate program
                </Link>
              </li>
              <li>
                <Link href="/affiliate/terms" className="hover:text-white">
                  Affiliate terms
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-gray-400">
              <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
              <li><Link href="/support" className="hover:text-white">Contact</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
          <p>&copy; 2026 Helfi. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
