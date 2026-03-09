const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();
  const colls = await db.listCollections().toArray();
  console.log(colls.map(c => c.name));
  await client.close();
  process.exit(0);
}
run();
