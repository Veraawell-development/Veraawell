const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();
  const coll = db.collection('doctoravailabilities');
  const doc = await coll.findOne({ doctorId: new ObjectId('6910f7ddc58221f6baaeb159') });
  console.log(JSON.stringify(doc, null, 2));
  await client.close();
  process.exit(0);
}
run().catch(console.error);
