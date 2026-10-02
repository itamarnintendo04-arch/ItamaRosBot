const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing.");
}

const client = new MongoClient(MONGODB_URI, {
  tls: true,
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 15000
});

let database = null;

async function connectDatabase() {
  if (database) {
    return database;
  }

  try {
    await client.connect();

    await client.db("admin").command({
      ping: 1
    });

    database = client.db("itamaros_bot");

    console.log("MongoDB connected successfully.");

    return database;
  } catch (error) {
    console.error("MongoDB connection failed:");
    console.error(error);

    throw error;
  }
}

function getDatabase() {
  if (!database) {
    throw new Error(
      "Database is not connected. Call connectDatabase() first."
    );
  }

  return database;
}

module.exports = {
  connectDatabase,
  getDatabase
};
