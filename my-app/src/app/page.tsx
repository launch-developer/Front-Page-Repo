'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username) return;
    
    setIsLoading(true);
    
    try {
      // Call API route to start scraping
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Scraping failed');
      }
      
      // Redirect to results page
      router.push(`/profile/${username}`);
    } catch (error) {
      console.error('Error scraping profile:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to scrape profile'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-md mx-auto pt-16 px-4">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-center mb-6 text-black">Instagram Profile Scraper</h1>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Instagram Username
              </label>
              <input
                type="text"
                id="username"
                className="w-full px-3 py-2 border border-gray-300 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. instagram"
                required
              />
            </div>
            
            <button
              type="submit"
              className={`w-full py-2 px-4 rounded-md text-white font-medium ${
                isLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              }`}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Scrape Profile'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}