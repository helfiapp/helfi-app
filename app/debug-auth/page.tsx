'use client'

export default function DebugAuth() {
  const handleTestAuth = async () => {
    try {
      const response = await fetch('/api/debug-auth');
      const data = await response.json();
      console.log('Auth config:', data);
      alert(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error:', error);
      alert('Error: ' + error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Auth Debug</h1>
        <button 
          onClick={handleTestAuth}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Test Auth Config
        </button>
      </div>
    </div>
  );
} 