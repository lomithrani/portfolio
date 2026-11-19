// Seeds what the Playwright owner tests sign in as: per test file, a user and the domain it owns,
// kept for that file alone (its tests add and remove the domain's experiences, so files running in
// parallel never share one): 'e2e-owner' for client/tests/experiences-owner.test.ts, 'e2e-import'
// for client/tests/resume-import.test.ts. client/tests/recruiter.test.ts signs in as the recruiter
// 'e2e.recruiter@example.com' (a recruiter space, no domain, the terms in force accepted: every
// run records the version of the code it runs, so a new LEGAL_VERSION never locks the e2e tests
// out of the recruiter routes, which ask for it). 'e2e-shared' is a portfolio the tests may read
// or point at but never change: its journey, set here on every run, is a job step then the
// meeting, on which client/tests/job-view.test.ts alone has the e2e recruiter pick its jobs.
// client/tests/hire-journey.test.ts changes the hiring journey of 'e2e-journey' alone,
// and goes through it as the e2e recruiter. client/tests/share-kit.test.ts signs in as the owner of
// 'e2e-share-kit' (the default journey, never saved: the tests answer the readiness and the perfect
// job they need in the browser, so it stays that way). 'e2e-preview' is read, never changed, by
// client/tests/robots.test.ts: its title and tagline, set here on every run, are the preview of a
// shared link, with characters the HTML must escape. The candidate 'e2e.candidate@example.com' (no domain, no
// recruiter space, no acceptance of the terms) is signed in as by client/tests/account.test.ts,
// claim-consent.test.ts, feedback.test.ts, recruiter.test.ts, hire-journey.test.ts, job-view.test.ts
// and the signed-in steps of landing.test.ts; the tests that would change it (accepting the terms,
// claiming, opening a recruiter space or recording a space: PUT /me/mode, deleting the account)
// answer those requests in the browser, so it stays that way.
// Idempotent: safe to run against a seeded database.
// Usage: MONGO_URL=mongodb://... bun run seed:e2e
import mongoose, { Types } from "mongoose";
import { currentConsent } from "portfolio-common";
import { Domain, User, Workflow } from "../models/database";
import { recordConsent } from "../services/legal";
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
  { email: 'e2e.shared@example.com', name: 'Sam', surname: 'Shared', domain: 'e2e-shared' },
  { email: 'e2e.journey@example.com', name: 'Jay', surname: 'Journey', domain: 'e2e-journey' },
  { email: 'e2e.sharekit@example.com', name: 'Skye', surname: 'Sharer', domain: 'e2e-share-kit' },
  { email: 'e2e.preview@example.com', name: 'Pia', surname: 'Preview', domain: 'e2e-preview' }
];

// The heading of 'e2e-preview', which its link preview carries (og:title, og:description): text
// its owner wrote, with what an HTML attribute must escape (PREVIEW_HEADING of
// client/tests/robots.test.ts)
const E2E_PREVIEW_HEADING = {
  headerTitle: 'Jane "JD" Doe & Co',
  headerSubtitle: 'Staff engineer <Lyon> & more'
};

for (const owner of owners) {
  const user = await User.findOneAndUpdate(
    { email: owner.email },
    { $setOnInsert: { name: owner.name, surname: owner.surname } },
    { upsert: true, returnDocument: 'after' }
  );

  await Domain.findOneAndUpdate(
    { name: owner.domain },
    {
      $setOnInsert: { admin: user._id, experiences: [] },
      // Set on every run, as PUT /domain stores it (a database seeded before has none)
      ...(owner.domain === 'e2e-preview' ? { $set: E2E_PREVIEW_HEADING } : {})
    },
    { upsert: true }
  );

  // A job to pick before the meeting: the e2e recruiter's pick links the job's private page
  // (/opportunities/:id), which its owner reads. Set on every run (a database seeded before has
  // the default journey), as PUT /workflow stores it
  if (owner.domain === 'e2e-shared') {
    await Workflow.findOneAndUpdate(
      { user: user._id },
      {
        $set: {
          steps: [
            { id: 'job', type: 'job', config: {} },
            { id: 'meeting', type: 'meeting', config: {} }
          ]
        }
      },
      { upsert: true }
    );
  }
}

// A recruiter space without a domain, on the free plan with no import used. Its id is fixed:
// with no domain, the e2e tests could not look it up (client/tests/support/owner.ts signs its
// session with E2E_RECRUITER_ID)
const recruiter = await User.findOneAndUpdate(
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
  { upsert: true, returnDocument: 'after' }
);
// The recruiter routes ask for the terms in force: accepted from the recruiter space, once per
// version (a run after a new LEGAL_VERSION adds it, the next ones change nothing)
await recordConsent(recruiter._id, currentConsent(), 'recruiter');

// A candidate without a portfolio (nor recruiter space, nor acceptance of the terms). Its id is
// fixed for the same reason (CANDIDATE_ID of client/tests/account.test.ts and landing.test.ts)
await User.findOneAndUpdate(
  { email: 'e2e.candidate@example.com' },
  {
    $setOnInsert: {
      _id: new Types.ObjectId('65e2e0000000000000000002'),
      name: 'E2E',
      surname: 'Candidate'
    }
  },
  { upsert: true }
);

console.log(
  `Seeded the e2e owners: ${owners.map((owner) => owner.domain).join(', ')}, the e2e recruiter and the e2e candidate`
);
await mongoose.disconnect();
process.exit(0);
