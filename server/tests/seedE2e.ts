// Seeds what the Playwright owner tests sign in as (client/tests/experiences-owner.test.ts): a
// user and the domain 'e2e-owner' it owns, kept for those tests alone (they add and remove its
// experiences). Idempotent: safe to run against a seeded database.
// Usage: MONGO_URL=mongodb://... bun run seed:e2e
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
  { email: 'e2e.owner@example.com' },
  { $setOnInsert: { name: 'Eve', surname: 'Owner' } },
  { upsert: true, returnDocument: 'after' }
);

await Domain.findOneAndUpdate(
  { name: 'e2e-owner' },
  { $setOnInsert: { admin: user._id, experiences: [] } },
  { upsert: true }
);

console.log('Seeded the e2e owner');
await mongoose.disconnect();
process.exit(0);
