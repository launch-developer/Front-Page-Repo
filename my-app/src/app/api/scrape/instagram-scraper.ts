/**************************************************************
 *
 *                     instagram-scraper.jsx
 *
 *        Authors: Peter Morganelli, William Goldman, Harry Lynch
 *           Date: 03/15/2025
 *
 *     Summary: Implement the functionality for Apify instagram scraping, which 
 *              involves downloading the images, uploading them to our S3 
 *              bucket on AWS, and pulling those images to render on the page
 * 
 **************************************************************/

import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

//create an S3 client with credentials and region
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

//init the ApifyClient with API token per documentation
const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN || '',
});

async function uploadImageToS3(imageUrl: string, username: string, postId: string, index: number) {
  try {
    //download the actual image
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    
    // Determine the content type based on the URL
    let contentType = 'image/jpeg'; // Default
    if (imageUrl.endsWith('.png')) contentType = 'image/png';
    if (imageUrl.endsWith('.gif')) contentType = 'image/gif';
    if (imageUrl.endsWith('.webp')) contentType = 'image/webp';
    
    //genarate a key for S3 bucket
    const key = `images/${username}/${postId}/${index}.jpg`;
    
    //upload to S3 with public-read ACL so it's accessible in the browser
    const bucketName = process.env.S3_BUCKET_NAME || 'instagramimagesbucket';
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    });
    
    await s3Client.send(command);
    console.log(`Uploaded image to S3: s3://${bucketName}/${key}`);
    
    // Return the public S3 URL
    return `https://${bucketName}.s3.amazonaws.com/${key}`;
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    //if there was an error, return the original URL
    return imageUrl;
  }
}

export async function scrapeInstagram(username: string) {
  console.log('HERE');
  try {
    console.log(`Starting scraper for username: ${username}`);
    const url = "https://instagram.com/" + username;
    console.log("URL: ", url);

    if (!process.env.APIFY_API_TOKEN) {
      console.error('APIFY_API_TOKEN is not set in environment variables');
      throw new Error('API token not configured');
    }
    
    //initate apify scraper
    const input = {
      "directUrls": [url],
      "resultsLimit": 100,
      "resultsType": 'posts', //include posts
      "searchType": 'user',   // make srure we're searching for users
      "searchLimit": 1,       // limit the search to just the one user we're looking for
    };
    
    //run the apify actor
    const run = await apifyClient.actor("apify/instagram-scraper").call(input);
    console.log("printing type of run: ");
    console.log(typeof(run));
    
    //get dataset items with timeout and retry mechanism
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
        await new Promise(resolve => setTimeout(resolve, 2000)); //wait 2 seconds before retry
      }
    }
    //verify correct scraping
    console.log(`Scraped ${items.length} items for ${username}`);
    
    if (items.length === 0) {
      //error check if we shit the bed
      console.log('No items returned. This could mean the account is private or does not exist.');
      
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
      
      return emptyData;
    }
    
    console.log("DATA:", items);
    
    //first item here for profile details
    const profile = items[0];
    const user = {
      username: profile.ownerUsername || '',
      fullName: profile.ownerFullName || '',
    };
    
    //process and upload images to S3
    //each scraped item will be uploaded and each image gets its S3 URL
    const postsArray = await Promise.all(
      items.map(async (item) => {
        if (!item.images || item.images.length === 0) return [];
        const uploadedImages = await Promise.all(
          item.images.map(async (image, index) => {
            // Assume image is either a string URL or an object with a url property
            const imageUrl = typeof image === 'string' ? image : image.url;
            return await uploadImageToS3(
              imageUrl,
              username,
              item.shortCode || `post-${Date.now()}`,
              index
            );
          })
        );
        return uploadedImages;
      })
    );
    
    //update the postsArray to a single array of image URLs ?
    const posts = postsArray.flat();
    
    const formattedData = {
      user,
      posts,
      scrapedAt: new Date().toISOString(),
      status: 'success'
    };
    
    return formattedData;
  } catch (error: any) {
    console.error('Error in scraping:', error);
    
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
    
    return errorData;
  }
}

//this will be implemented by backend team
async function storeInMongoDB(data: any) {
  console.log('Storing data in MongoDB:', data.user.username);
  //our MongoDB storage logic here
}
