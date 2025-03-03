import { NextRequest, NextResponse } from 'next/server';
import { getProfileData } from '@/lib/mongodb';
import { scrapeInstagram } from '../../scrape/route';

export async function GET(request: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  
  if (!params || !params.username) {
    return NextResponse.json(
      { message: 'Invalid username parameter' },
      { status: 400 }
    );
  }

  const username = params.username;
  console.log(`API request for profile: ${username}`);

  try {
    // Try to get data from MongoDB first
    const mongoData = await getProfileData(username);
    
    if (mongoData) {
      console.log(`Retrieved data from MongoDB for ${username}`);
      return NextResponse.json(mongoData);
    }
    
    // If no MongoDB data, try to scrape
    console.log(`No data in MongoDB, scraping for ${username}`);
    const scrapedData = await scrapeInstagram(username);
    
    if (scrapedData) {
      return NextResponse.json(scrapedData);
    }
    
    // If we got here, we couldn't find any data
    return NextResponse.json(
      { 
        message: 'Profile data not found',
        user: {
          username: username,
          biography: 'Profile not found',
          fullName: '',
          followersCount: 0,
          followingCount: 0,
          profilePicUrl: '',
          externalUrl: '',
          verified: false,
        },
        posts: [],
        scrapedAt: new Date().toISOString(),
        status: 'not_found'
      },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error retrieving profile data:', error);
    return NextResponse.json(
      { 
        message: 'Failed to retrieve profile data', 
        error: error.message,
        user: {
          username: username,
          biography: 'Error retrieving profile',
          fullName: '',
          followersCount: 0,
          followingCount: 0,
          profilePicUrl: '',
          externalUrl: '',
          verified: false,
        },
        posts: [],
        scrapedAt: new Date().toISOString(),
        status: 'error'
      },
      { status: 500 }
    );
  }
}