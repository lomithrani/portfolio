// Seeds what the Playwright owner tests sign in as: per test file, a user and the domain it owns,
// kept for that file alone (its tests add and remove the domain's experiences, so files running in
// parallel never share one): 'e2e-owner' for client/tests/experiences-owner.test.ts, 'e2e-import'
// for client/tests/resume-import.test.ts. client/tests/recruiter.test.ts and
// client/tests/jobs-apply.test.ts sign in as the recruiter 'e2e.recruiter@example.com' (a
// recruiter space, no domain) and as the owner of 'e2e-applicant', who applies or is added to the
// applicants. client/tests/hire-journey.test.ts changes the hiring journey of 'e2e-journey' alone,
// and goes through it as the e2e recruiter. Idempotent: safe to run against a seeded database.
// Usage: MONGO_URL=mongodb://... bun run seed:e2e
import mongoose, { Types } from "mongoose";
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
  { email: 'e2e.import@example.com', name: 'Ivy', surname: 'Importer', domain: 'e2e-import' },
  { email: 'e2e.applicant@example.com', name: 'Ada', surname: 'Applicant', domain: 'e2e-applicant' },
  { email: 'e2e.journey@example.com', name: 'Jay', surname: 'Journey', domain: 'e2e-journey' }
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

// A recruiter space without a domain, on the free plan with no import used. Its id is fixed:
// with no domain, the e2e tests could not look it up (client/tests/support/owner.ts signs its
// session with E2E_RECRUITER_ID)
await User.findOneAndUpdate(
  { email: 'e2e.recruiter@example.com' },
  {
    $setOnInsert: {
      _id: new Types.ObjectId('65e2e0000000000000000001'),
      name: 'Rita',
      surname: 'Recruiter',
      activeMode: 'recruiter',
      recruiter: { enabledAt: new Date(), plan: 'free', jobImportsUsed: 0 }
    }
  },
  { upsert: true }
);

console.log(`Seeded the e2e owners: ${owners.map((owner) => owner.domain).join(', ')}, and the e2e recruiter`);
await mongoose.disconnect();
process.exit(0);
