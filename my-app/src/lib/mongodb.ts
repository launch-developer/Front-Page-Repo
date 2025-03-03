import { MongoClient } from 'mongodb';

// Connection URI
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'instagram-scraper';
const collectionName = 'profiles';

// Cache the MongoDB connection
let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function storeProfileData(data: any) {
  try {
    console.log(`Storing profile data for ${data.user.username} in MongoDB`);
    const { db } = await connectToDatabase();
    const collection = db.collection(collectionName);

    // Add timestamp if not present
    if (!data.scrapedAt) {
      data.scrapedAt = new Date().toISOString();
    }

    // Use upsert to update or insert
    await collection.updateOne(
      { 'user.username': data.user.username },
      { $set: data },
      { upsert: true }
    );
    
    console.log(`Successfully stored data for ${data.user.username}`);
    return true;
  } catch (error) {
    console.error('Error storing in MongoDB:', error);
    return false;
  }
}

export async function getProfileData(username: string) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(collectionName);
    
    // Find the profile by username
    const profile = await collection.findOne({ 'user.username': username });
    
    if (!profile) {
      console.log(`No profile found in MongoDB for ${username}`);
      return null;
    }
    
    console.log(`Retrieved profile data for ${username} from MongoDB`);
    return profile;
  } catch (error) {
    console.error('Error retrieving from MongoDB:', error);
    return null;
  }
}