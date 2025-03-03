import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

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
    const bucketName = process.env.S3_BUCKET_NAME || 'instagramimagesbucket';
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
    console.log('HERE');
  try {
    console.log(`Starting scraper for username: ${username}`);
    const url = "https://instagram.com/" + username
    console.log("URL: ", url)
    // Check if Apify token is set
    if (!process.env.APIFY_API_TOKEN) {
      console.error('APIFY_API_TOKEN is not set in environment variables');
      throw new Error('API token not configured');
    }
    
    // Start the Instagram scraper on Apify
    const input = {
      "directUrls": [url],
      "resultsLimit": 100,
      "resultsType": 'posts', // Include both posts and user details
      "searchType": 'user', // Ensure we're searching for users
      "searchLimit": 1, // Limit to just the one user we're looking for
    };
    
    // Run the Instagram scraper actor
    const run = await apifyClient.actor("apify/instagram-scraper").call(input);
    console.log("printing type of run: ");
    console.log(typeof(run));
    
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
    // console.log('Scraped items:', JSON.stringify(items, null, 2));
    
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
      
      // Store this in MongoDB instead of S3
      // await storeInMongoDB(emptyData);
      
      return emptyData;
    }
    
    // Find profile and post items
    console.log("DATA:", items)
    
    // Extract user information
    const profile = items[0]
    const user = {
      username: profile.ownerUsername || '',
      fullName: profile.ownerFullName || '',
    };
    
    // Process and upload post images
    const posts = [];
    items.map((item) => {
      item.images.map(image => posts.push(image))
    })
    
    const formattedData = {
      user,
      posts,
      scrapedAt: new Date().toISOString(),
      status: 'success'
    };
    
    // Store in MongoDB instead of S3 JSON files
    // console.log("STORING IN MONGO");
    // await storeInMongoDB(formattedData);
    
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
    
    console.log("ERROR STORING IN MONGO");
    return errorData;
  }
} 

// Function to store data in MongoDB (placeholder - you'll need to implement this)
async function storeInMongoDB(data: any) {
  // Implement your MongoDB storage logic here
  console.log('Storing data in MongoDB:', data.user.username);
  
  // Example MongoDB connection and storage:
  // const { MongoClient } = require('mongodb');
  // const client = new MongoClient(process.env.MONGODB_URI);
  // await client.connect();
  // const db = client.db('instagram-scraper');
  // const collection = db.collection('profiles');
  // await collection.updateOne(
  //   { 'user.username': data.user.username },
  //   { $set: data },
  //   { upsert: true }
  // );
  // await client.close();
}