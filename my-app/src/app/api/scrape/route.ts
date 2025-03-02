import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;
    
    if (!username) {
      return NextResponse.json(
        { message: 'Username is required' },
        { status: 400 }
      );
    }

    // Start the Instagram scraper on Apify
    const input = {
      usernames: [username],
      resultsLimit: 100,
    };

    console.log(`Starting scraper for username: ${username}`);
    
    // Run the Instagram scraper actor
    const run = await apifyClient.actor("apify/instagram-scraper").call(input);
    
    // Fetch dataset items
    const { items } = await apifyClient
      .dataset(run.defaultDatasetId)
      .listItems();
    
    console.log(`Scraped ${items.length} items for ${username}`);
    
    // Format the data as needed
    const formattedData = formatScrapedData(items);
    
    // Store the formatted data in S3
    await storeInS3(username, formattedData);
    
    // Store the data locally for development purposes
    // Note: In production, you'd likely only use S3
    const dir = path.join(process.cwd(), 'data');
    
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(dir, `${username}.json`),
        JSON.stringify(formattedData, null, 2)
      );
    } catch (fsError) {
      console.error('Error writing to local file:', fsError);
      // Continue even if local file storage fails
    }
    
    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error in scraping:', error);
    return NextResponse.json(
      { message: 'Scraping failed', error },
      { status: 500 }
    );
  }
}

// Format the scraped data into a structure that's easy to work with
function formatScrapedData(items: any[]) {
  // For a user profile, we generally get one main item with user info
  // and potentially child items for posts
  const profile = items.find(item => item.username);
  
  if (!profile) {
    return { user: null, posts: [] };
  }
  
  // Extract user information
  const user = {
    username: profile.username,
    fullName: profile.fullName,
    biography: profile.biography,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    profilePicUrl: profile.profilePicUrl,
    externalUrl: profile.externalUrl,
    verified: profile.verified,
  };
  
  // Extract posts if available
  const posts = items
    .filter(item => item.type === 'Post')
    .map(post => ({
      id: post.id,
      type: post.type,
      shortCode: post.shortCode,
      caption: post.caption,
      url: post.url,
      commentsCount: post.commentsCount,
      likesCount: post.likesCount,
      timestamp: post.timestamp,
      images: post.images?.map((img: any) => ({
        url: img.url,
        width: img.width,
        height: img.height,
      })) || [],
      videos: post.videoUrls || [],
      mentions: post.mentions || [],
      hashtags: post.hashtags || [],
    }));
  
  return {
    user,
    posts,
    scrapedAt: new Date().toISOString(),
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