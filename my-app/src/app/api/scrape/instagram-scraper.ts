import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { storeProfileData } from '@/lib/mongodb';

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

// Function to upload an image to S3
async function uploadImageToS3(imageUrl: string, username: string, postId: string, index: number) {
  try {
    // Download the image
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    
    // Determine the content type based on the URL
    let contentType = 'image/jpeg'; // Default
    if (imageUrl.endsWith('.png')) contentType = 'image/png';
    if (imageUrl.endsWith('.gif')) contentType = 'image/gif';
    if (imageUrl.endsWith('.webp')) contentType = 'image/webp';
    
    // Generate a key for S3
    const key = `images/${username}/${postId}/${index}.jpg`;
    
    // Upload to S3
    const bucketName = process.env.S3_BUCKET_NAME || 'instagram-scraper-data';
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    
    await s3Client.send(command);
    console.log(`Uploaded image to S3: s3://${bucketName}/${key}`);
    
    // Return the S3 URL
    return `https://${bucketName}.s3.amazonaws.com/${key}`;
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    // Return the original URL if there was an error
    return imageUrl;
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
    
    // Start the Instagram scraper on Apify with improved configuration
    const input = {
      usernames: [username],
      resultsLimit: 100,
      resultsType: 'both', // Important: use 'both' to get user details and posts
      searchType: 'user',
      search: username, // Add explicit search
      searchLimit: 1,
      proxy: {
        useApifyProxy: true
      },
      maxRequestRetries: 5,
      scrapeStories: false,
      directUrls: [`https://www.instagram.com/${username}/`] // Add direct URL
    };
    
    // Run the Instagram scraper actor
    const run = await apifyClient.actor("apify/instagram-scraper").call(input);
    
    // Get dataset items with timeout and retry mechanism
    let retries = 0;
    let items: any[] = [];
    
    while (retries < 5) { // Increased retries
      try {
        console.log(`Fetching dataset ${run.defaultDatasetId} (attempt ${retries + 1})`);
        const { items: datasetItems } = await apifyClient
          .dataset(run.defaultDatasetId)
          .listItems();
          
        items = datasetItems;
        console.log(`Retrieved ${items.length} items from dataset`);
        break;
      } catch (error) {
        retries++;
        console.log(`Retry ${retries}/5 for dataset fetch`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
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
        status: 'empty_or_private',
        error: 'No data returned from scraper'
      };
      
      // Store this in MongoDB
      await storeProfileData(emptyData);
      
      return emptyData;
    }
    
    // Find user profile item - be more lenient in matching
    const profile = items.find(item => 
      item.username?.toLowerCase() === username.toLowerCase() && 
      (item.type === 'user' || item.type === 'profile' || !item.shortCode)
    );
    
    if (!profile) {
      console.log('Profile not found in scraped data. Items:', items.map(i => ({type: i.type, username: i.username})));
      
      // Create default profile from first item if possible
      const fallbackProfile = items[0];
      
      // Create a default response with any available data
      const fallbackData = {
        user: {
          username: username,
          fullName: fallbackProfile?.fullName || '',
          biography: fallbackProfile?.biography || 'Profile data could not be completely retrieved.',
          followersCount: fallbackProfile?.followersCount || 0,
          followingCount: fallbackProfile?.followingCount || 0,
          profilePicUrl: fallbackProfile?.profilePicUrl || '',
          externalUrl: fallbackProfile?.externalUrl || '',
          verified: fallbackProfile?.verified || false,
        },
        posts: [],
        scrapedAt: new Date().toISOString(),
        status: 'partial_data',
        error: 'Profile data not found in scraper response'
      };
      
      // Store the fallback data
      await storeProfileData(fallbackData);
      
      return fallbackData;
    }
    
    // Extract user information
    const user = {
      username: profile.username || username,
      fullName: profile.fullName || '',
      biography: profile.biography || '',
      followersCount: profile.followersCount || 0,
      followingCount: profile.followingCount || 0,
      profilePicUrl: profile.profilePicUrl || '',
      externalUrl: profile.externalUrl || '',
      verified: profile.verified || false,
    };
    
    // Upload profile picture to S3 if it exists and S3 is configured
    if (profile.profilePicUrl && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      try {
        user.profilePicUrl = await uploadImageToS3(
          profile.profilePicUrl, 
          username, 
          'profile', 
          0
        );
      } catch (error) {
        console.error('Error uploading profile pic to S3:', error);
        // Keep original URL if S3 upload fails
      }
    }
    
    // Process and upload post images
    const posts = [];
    
    // Find all posts
    const postItems = items.filter(item => 
      (item.type === 'Post' || item.type === 'post' || item.shortCode) && 
      item.ownerUsername?.toLowerCase() === username.toLowerCase()
    );
    
    console.log(`Found ${postItems.length} posts for processing`);
    
    for (const post of postItems) {
      const postImages = [];
      
      // Process each image in the post
      if (Array.isArray(post.images) && post.images.length > 0) {
        for (let i = 0; i < post.images.length; i++) {
          const img = post.images[i];
          if (img && img.url) {
            let imageUrl = img.url;
            
            // Upload to S3 if configured
            if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
              try {
                imageUrl = await uploadImageToS3(
                  img.url,
                  username,
                  post.shortCode || `post-${Date.now()}`,
                  i
                );
              } catch (error) {
                console.error('Error uploading post image to S3:', error);
                // Keep original URL if S3 upload fails
              }
            }
            
            postImages.push({
              url: imageUrl,
              width: img.width || 0,
              height: img.height || 0,
            });
          }
        }
      }
      
      posts.push({
        id: post.id || `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: post.type || 'Post',
        shortCode: post.shortCode || '',
        caption: post.caption || '',
        url: post.url || `https://www.instagram.com/p/${post.shortCode || ''}`,
        commentsCount: post.commentsCount || 0,
        likesCount: post.likesCount || 0,
        timestamp: post.timestamp || new Date().toISOString(),
        images: postImages,
        videos: post.videoUrls || [],
        mentions: post.mentions || [],
        hashtags: post.hashtags || [],
      });
    }
    
    const formattedData = {
      user,
      posts,
      scrapedAt: new Date().toISOString(),
      status: 'success'
    };
    
    // Store in MongoDB
    await storeProfileData(formattedData);
    
    return formattedData;
  } catch (error: any) {
    console.error('Error in scraping:', error);
    
    // Create fallback data for error case
    const errorData = {
      user: {
        username: username,
        fullName: '',
        biography: 'Error retrieving data.',
        followersCount: 0,
        followingCount: 0,
        profilePicUrl: '',
        externalUrl: '',
        verified: false,
      },
      posts: [],
      scrapedAt: new Date().toISOString(),
      status: 'error',
      error: error.message || 'Unknown error during scraping'
    };
    
    // Try to store error data
    try {
      await storeProfileData(errorData);
    } catch (mongoError) {
      console.error('Error storing error data in MongoDB:', mongoError);
    }
    
    return errorData;
  }
}