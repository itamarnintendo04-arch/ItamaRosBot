const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing.");
}

const client = new MongoClient(MONGODB_URI);

let database;

async function connectDatabase() {
  if (database) {
    return database;
  }

  await client.connect();

  database = client.db("itamaros_bot");

  console.log("MongoDB connected successfully.");

  return database;
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
