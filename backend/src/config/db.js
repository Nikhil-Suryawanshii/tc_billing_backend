import mongoose from 'mongoose';

let connectionPromise;

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Set MONGODB_URI in backend/.env to your MongoDB Atlas connection string.');
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;

  mongoose.set('strictQuery', true);
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DATABASE || 'the_concept_interior',
      serverSelectionTimeoutMS: 10000,
    }).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  await connectionPromise;
  return mongoose.connection;
}
