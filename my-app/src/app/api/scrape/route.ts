import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

// Create S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Initialize the ApifyClient with API token
const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN || '',
});

export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    
    if (!username) {
      return NextResponse.json({ message: 'Username is required' }, { status: 400 });
    }
    
    const data = await scrapeInstagram(username);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in POST request:', error);
    return NextResponse.json(
      { message: 'Request failed', error: error.message },
      { status: 500 }
    );
  }
}

export async function scrapeInstagram(username: string) {
  try {
    console.log(`Starting scraper for username: ${username}`);
    
    // Check if Apify token is set
    if (!process.env.APIFY_API_TOKEN) {
      console.error('APIFY_API_TOKEN is not set in environment variables');
      throw new Error('API token not configured');
    }
    
    // Start the Instagram scraper on Apify with more options
    const input = {
      usernames: [username],
      resultsLimit: 50,
      resultsType: 'posts', // Include both posts and user details
      searchType: 'user', // Ensure we're searching for users
      searchLimit: 1, // Limit to just the one user we're looking for
    };
    
    console.log(`Using Apify token: ${process.env.APIFY_API_TOKEN ? "Set" : "Not set"}`);
    
    // Run the Instagram scraper actor - use correct actor ID
    const run = await apifyClient.actor("apify/instagram-scraper").call(input);
    
    // Get dataset items with timeout and retry mechanism
    let retries = 0;
    let items = [];
    
    while (retries < 3) {
      try {
        const { items: datasetItems } = await apifyClient
          .dataset(run.defaultDatasetId)
          .listItems();
          
        items = datasetItems;
        break;
      } catch (error) {
        retries++;
        console.log(`Retry ${retries}/3 for dataset fetch`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      }
    }
    
    console.log(`Scraped ${items.length} items for ${username}`);
    
    if (items.length === 0) {
      console.log('No items returned. This could mean the account is private or does not exist.');
      
      // Create a default empty response
      const emptyData = {
        user: {
          username: username,
          fullName: '',
          biography: 'No data available. This account may be private or not exist.',
          followersCount: 0,
          followingCount: 0,
          profilePicUrl: '',
          externalUrl: '',
          verified: false,
        },
        posts: [],
        scrapedAt: new Date().toISOString(),
        status: 'empty_or_private'
      };
      
      // Store this default response
      await storeInS3(username, emptyData);
      await storeLocally(username, emptyData);
      
      return emptyData;
    }
    
    // Log partial data to help debug
    if (items[0]) {
      console.log(`Scraped raw data sample:`, JSON.stringify(items[0], null, 2).substring(0, 500) + "...");
    }
    
    // Format the data
    const formattedData = formatScrapedData(items);
    
    // Store the data
    await storeInS3(username, formattedData);
    await storeLocally(username, formattedData);
    
    return formattedData;
  } catch (error: any) {
    console.error('Error in scraping:', error);
    
    // Create fallback data for error case
    const errorData = {
      user: {
        username: username,
        fullName: '',
        biography: `Error retrieving data: ${error.message}`,
        followersCount: 0,
        followingCount: 0,
        profilePicUrl: '',
        externalUrl: '',
        verified: false,
      },
      posts: [],
      scrapedAt: new Date().toISOString(),
      status: 'error',
      error: error.message
    };
    
    try {
      await storeLocally(username, errorData);
    } catch (e) {
      console.error('Failed to store error data locally:', e);
    }
    
    return errorData;
  }
}

// Store data locally
async function storeLocally(username: string, data: any) {
  const dir = path.join(process.cwd(), 'data');
  
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(dir, `${username}.json`),
      JSON.stringify(data, null, 2)
    );
    
    console.log(`Data stored locally for ${username}`);
  } catch (fsError) {
    console.error('Error writing to local file:', fsError);
  }
}

// Format the scraped data into a structure that's easy to work with
function formatScrapedData(items: any[]) {
  // Find profile and post items
  const profile = items.find(item => item.username);
  
  if (!profile) {
    return { 
      user: null, 
      posts: [],
      scrapedAt: new Date().toISOString(),
      status: 'no_profile_found'
    };
  }
  
  // Extract user information
  const user = {
    username: profile.username || '',
    fullName: profile.fullName || '',
    biography: profile.biography || '',
    followersCount: profile.followersCount || 0,
    followingCount: profile.followingCount || 0,
    profilePicUrl: profile.profilePicUrl || '',
    externalUrl: profile.externalUrl || '',
    verified: profile.verified || false,
  };
  
  // Extract posts if available
  const posts = items
    .filter(item => item.type === 'Post')
    .map(post => ({
      id: post.id || `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: post.type || 'Post',
      shortCode: post.shortCode || '',
      caption: post.caption || '',
      url: post.url || `https://www.instagram.com/p/${post.shortCode || ''}`,
      commentsCount: post.commentsCount || 0,
      likesCount: post.likesCount || 0,
      timestamp: post.timestamp || new Date().toISOString(),
      images: (post.images || []).map((img: any) => ({
        url: img.url || '',
        width: img.width || 0,
        height: img.height || 0,
      })),
      videos: post.videoUrls || [],
      mentions: post.mentions || [],
      hashtags: post.hashtags || [],
    }));
  
  return {
    user,
    posts,
    scrapedAt: new Date().toISOString(),
    status: 'success'
  };
}

// Store the formatted data in S3
async function storeInS3(username: string, data: any) {
  const bucketName = process.env.S3_BUCKET_NAME || 'instagram-scraper-data';
  const key = `profiles/${username}/${new Date().toISOString()}.json`;
  
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  };
  
  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    console.log(`Data stored in S3: s3://${bucketName}/${key}`);
    return { bucket: bucketName, key };
  } catch (error) {
    console.error('Error storing data in S3:', error);
    throw error;
  }
}