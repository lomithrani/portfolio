// Seeds what the Playwright owner tests sign in as: per test file, a user and the domain it owns,
// kept for that file alone (its tests add and remove the domain's experiences, so files running in
// parallel never share one): 'e2e-owner' for client/tests/experiences-owner.test.ts, 'e2e-import'
// for client/tests/resume-import.test.ts. Idempotent: safe to run against a seeded database.
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

// One domain per user: an owner can own only one
const owners = [
  { email: 'e2e.owner@example.com', name: 'Eve', surname: 'Owner', domain: 'e2e-owner' },
  { email: 'e2e.import@example.com', name: 'Ivy', surname: 'Importer', domain: 'e2e-import' }
];

for (const owner of owners) {
  const user = await User.findOneAndUpdate(
    { email: owner.email },
    { $setOnInsert: { name: owner.name, surname: owner.surname } },
    { upsert: true, returnDocument: 'after' }
  );

  await Domain.findOneAndUpdate(
    { name: owner.domain },
    { $setOnInsert: { admin: user._id, experiences: [] } },
    { upsert: true }
  );
}

console.log(`Seeded the e2e owners: ${owners.map((owner) => owner.domain).join(', ')}`);
await mongoose.disconnect();
process.exit(0);
