'use client'

import { useState } from 'react'

export default function TestEmail() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const testEmail = async () => {
    if (!email) return
    
    setLoading(true)
    setResult('')
    
    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      
      const data = await response.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Email Test Page</h1>
        
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Direct Email Sending</h2>
          <div className="flex gap-4 mb-4">
            <input
              type="email"
              placeholder="Enter email to test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-helfi-green"
            />
            <button
              onClick={testEmail}
              disabled={loading || !email}
              className="px-6 py-2 bg-helfi-green text-white rounded-lg hover:bg-helfi-green-dark disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Test Email'}
            </button>
          </div>
          
          {result && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Result:</h3>
              <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto">
                {result}
              </pre>
            </div>
          )}
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Enter your email address above</li>
            <li>Click "Test Email" to send a direct test email</li>
            <li>Check the result below for any errors</li>
            <li>Check your email inbox for the test message</li>
            <li>If this works, the issue is with NextAuth configuration</li>
            <li>If this doesn't work, the issue is with Resend/domain setup</li>
          </ol>
        </div>
      </div>
    </div>
  )
} 