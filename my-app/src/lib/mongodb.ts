import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = process.env.MONGODB_URI || '';
const dbName = process.env.MONGODB_DB_NAME || 'instagram-scraper';

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function connectToDatabase() {
  // If we have cached values, use them
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Connect to the server
  await client.connect();
  
  // Verify connection
  await client.db(dbName).command({ ping: 1 });
  console.log("Connected successfully to MongoDB server");
  
  // Cache the client and db
  cachedClient = client;
  cachedDb = client.db(dbName);
  
  return { client, db: cachedDb };
}

export async function storeProfileData(data: any) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('profiles');
    
    // Store the profile data
    const result = await collection.updateOne(
      { 'user.username': data.user.username },
      { $set: data },
      { upsert: true }
    );
    
    console.log(`MongoDB: Stored profile data for ${data.user.username}`);
    return result;
  } catch (error) {
    console.error('Error storing data in MongoDB:', error);
    throw error;
  }
}

export async function getProfileData(username: string) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('profiles');
    
    // Get the profile data
    const profileData = await collection.findOne({ 'user.username': username });
    
    if (!profileData) {
      console.log(`MongoDB: No profile data found for ${username}`);
      return null;
    }
    
    console.log(`MongoDB: Retrieved profile data for ${username}`);
    return profileData;
  } catch (error) {
    console.error('Error retrieving data from MongoDB:', error);
    throw error;
  }
}