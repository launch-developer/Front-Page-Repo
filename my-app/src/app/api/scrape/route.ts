import { NextResponse } from 'next/server';
import { scrapeInstagram } from './instagram-scraper';

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

// Re-export the scrapeInstagram function
export { scrapeInstagram } from './instagram-scraper';