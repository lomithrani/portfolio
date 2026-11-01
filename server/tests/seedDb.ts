// Seeds the owner's user and the default 'louis.gentil' domain (the client's
// root redirect target). Idempotent: safe to run against a seeded database.
// Usage: MONGO_URL=mongodb://... bun run seed
import mongoose from "mongoose";
import { Domain, User } from "../models/database";
import { redactConnectionString } from "../services/redact";

const mongoUrl = Bun.env.MONGO_URL;
if (!mongoUrl) {
  console.error('MONGO_URL is required');
  process.exit(1);
}

// Never print credentials (CI and Railway logs keep this output)
console.log(`Connecting to: ${redactConnectionString(mongoUrl)}`);

await mongoose.connect(mongoUrl);

const user = await User.findOneAndUpdate(
  { email: 'louisgentil89@gmail.com' },
  { $setOnInsert: { name: 'Louis', surname: 'Gentil' } },
  { upsert: true, returnDocument: 'after' }
);

await Domain.findOneAndUpdate(
  { name: 'louis.gentil' },
  { $setOnInsert: { admin: user._id, experiences: [] } },
  { upsert: true }
);

console.log('Seeded');
await mongoose.disconnect();
process.exit(0);
