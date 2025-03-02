import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { scrapeInstagram } from '../../scrape/route';

// Create S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Helper function to get latest file from S3
async function getLatestProfileFromS3(username: string) {
    const bucketName = process.env.S3_BUCKET_NAME || 'instagram-scraper-data';
    const prefix = `profiles/${username}/`;
    
    try {
      // List objects to find the most recent file
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
      });
      
      const listResponse = await s3Client.send(listCommand);
      
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log(`No files found for ${username} in S3`);
        return null;
      }
      
      // Sort by LastModified to get the most recent file
      const latestFile = listResponse.Contents.sort((a, b) => {
        return (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0);
      })[0];
      
      // Now get the actual file
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: latestFile.Key,
      });
      
      const response = await s3Client.send(command);
      
      // Convert the readable stream to a string
      if (response.Body instanceof Readable) {
        const chunks = [];
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        const bodyString = Buffer.concat(chunks).toString('utf-8');
        return JSON.parse(bodyString);
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching from S3:', error);
      return null;
    }
  }

export async function GET(request: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  // Make sure username exists before using it
  if (!params || !params.username) {
    return NextResponse.json(
      { message: 'Invalid username parameter' },
      { status: 400 }
    );
  }

  const username = params.username;

  try {
    // First, try to get data from S3
    const s3Data = await getLatestProfileFromS3(username);
    
    if (s3Data) {
      console.log(`Retrieved data from S3 for ${username}`);
      return NextResponse.json(s3Data);
    }
    
    // If no S3 data, try to scrape
    console.log(`No data in S3, scraping for ${username}`);
    const scrapedData = await scrapeInstagram(username);
    
    if (scrapedData) {
      return NextResponse.json(scrapedData);
    }
    
    // Fallback to local file (for development)
    const dataFilePath = path.join(process.cwd(), 'data', `${username}.json`);
    
    if (!fs.existsSync(dataFilePath)) {
      return NextResponse.json(
        { message: 'Profile data not found' },
        { status: 404 }
      );
    }
    
    const fileData = fs.readFileSync(dataFilePath, 'utf-8');
    const profileData = JSON.parse(fileData);
    
    return NextResponse.json(profileData);
  } catch (error: any) {
    console.error('Error retrieving profile data:', error);
    return NextResponse.json(
      { message: 'Failed to retrieve profile data', error: error.message },
      { status: 500 }
    );
  }
}