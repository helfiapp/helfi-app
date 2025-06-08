import React from 'react';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Terms and Conditions</h1>
      <div className="prose">
        {/* Paste the content from the Google Doc here, or provide a link if too long */}
        <p>View our full <a href="https://docs.google.com/document/d/1NaJCHaQWnaIglunrxzfw78fGtzZgnOCTjF4a-sEKCrM/edit?usp=sharing" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>.</p>
      </div>
    </div>
  );
} 