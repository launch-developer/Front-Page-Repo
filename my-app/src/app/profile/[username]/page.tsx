'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';

// Define types for our data structure
interface InstagramImage {
  url: string;
  width: number;
  height: number;
}

interface InstagramPost {
  id: string;
  type: string;
  shortCode: string;
  caption: string;
  url: string;
  commentsCount: number;
  likesCount: number;
  timestamp: string;
  images: InstagramImage[];
  videos: string[];
  mentions: string[];
  hashtags: string[];
}

interface InstagramUser {
  username: string;
  fullName: string;
  biography: string;
  followersCount: number;
  followingCount: number;
  profilePicUrl: string;
  externalUrl: string;
  verified: boolean;
}

interface InstagramData {
  user: InstagramUser;
  posts: InstagramPost[];
  scrapedAt: string;
  status?: string;
  error?: string;
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params?.username as string;
  
  const [profileData, setProfileData] = useState<InstagramData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!username) return;
    
    const fetchData = async () => {
      try {
        console.log(`Fetching profile data for: ${username}`);
        const response = await fetch(`/api/profile/${username}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Error ${response.status}: Failed to fetch profile data`);
        }
        
        const data = await response.json();
        console.log('Received profile data:', data);
        
        if (!data || !data.user) {
          console.error('Incomplete data received:', data);
          setError('Received incomplete profile data');
          setProfileData(null);
        } else {
          setProfileData(data);
          // Set error if there's a status or error message in the data
          if (data.status === 'error' || data.status === 'empty_or_private') {
            setError(data.error || 'This account may be private or does not exist');
          }
        }
      } catch (err: any) {
        console.error('Error fetching profile:', err);
        setError(`Failed to load profile data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [username]);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-700">Loading profile data for @{username}...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  if (!profileData || !profileData.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-xl font-bold text-yellow-600 mb-2">No Profile Data</h2>
          <p className="text-gray-700">Could not retrieve profile data for @{username}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  const { user, posts = [], scrapedAt = new Date().toISOString() } = profileData;
  
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center">
            <div className="w-24 h-24 relative rounded-full overflow-hidden mb-4 sm:mb-0 sm:mr-6">
              {user?.profilePicUrl ? (
                <Image
                  src={user.profilePicUrl}
                  alt={`${user?.username || 'User'}'s profile picture`}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                  <span className="text-gray-500 text-2xl">?</span>
                </div>
              )}
            </div>
            
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold">{user?.fullName || user?.username || 'Unknown User'}</h1>
              <p className="text-gray-600 mb-2">@{user?.username || 'unknown'} {user?.verified && '✓'}</p>

              <div className="flex space-x-4 justify-center sm:justify-start">
                <div>
                  <span className="font-bold">{user?.followersCount?.toLocaleString() || '0'}</span>
                  <span className="text-gray-600 text-sm ml-1">followers</span>
                </div>
                <div>
                  <span className="font-bold">{user?.followingCount?.toLocaleString() || '0'}</span>
                  <span className="text-gray-600 text-sm ml-1">following</span>
                </div>
              </div>
            </div>
          </div>
          
          {user?.biography && (
            <div className="mt-4 text-gray-700">
              <p>{user.biography}</p>
            </div>
          )}

          {user?.externalUrl && (
            <div className="mt-2">
              <a 
                href={user.externalUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {user.externalUrl}
              </a>
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-500">
            Data scraped at: {new Date(scrapedAt).toLocaleString()}
          </div>
          
          {profileData.status && profileData.status !== 'success' && (
            <div className="mt-2 text-xs text-yellow-600 bg-yellow-100 p-2 rounded">
              Note: {profileData.status === 'empty_or_private' 
                ? 'This account may be private or does not have any public posts.' 
                : 'There was an issue retrieving complete data for this account.'}
            </div>
          )}
        </div>
        
        {/* Posts Grid */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Posts ({posts.length})</h2>
          
          {posts.length === 0 ? (
            <p className="text-gray-600">No posts found. This account may be private or has no public posts.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {posts.map((post) => (
                <div key={post.id} className="border rounded-lg overflow-hidden">
                  <div className="relative pt-[100%]">
                    {post.images.length > 0 ? (
                      <Image
                        src={post.images[0].url}
                        alt={post.caption || `Post by ${user.username}`}
                        fill
                        className="object-cover"
                      />
                    ) : post.videos.length > 0 ? (
                      <div className="absolute inset-0 bg-black flex items-center justify-center">
                        <span className="text-white">Video</span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-500">No media</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>❤️ {post.likesCount.toLocaleString()}</span>
                      <span>💬 {post.commentsCount.toLocaleString()}</span>
                    </div>
                    
                    {post.caption && (
                      <p className="text-sm line-clamp-3">{post.caption}</p>
                    )}
                    
                    <div className="mt-2">
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View on Instagram
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}