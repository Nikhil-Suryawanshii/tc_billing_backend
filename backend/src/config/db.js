const mongoose = require('mongoose');

let connectionPromise;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const database = process.env.MONGODB_DATABASE || 'the_concept_interior';

  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add your Atlas URI to backend/.env.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, { dbName: database })
      .then((connection) => {
        console.log(`MongoDB connected to database "${database}".`);
        return connection.connection;
      })
      .catch((error) => {
        connectionPromise = undefined;
        throw error;
      });
  }

  return connectionPromise;
}

module.exports = connectDB;
