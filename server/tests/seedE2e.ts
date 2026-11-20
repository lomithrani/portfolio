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
// shared link, with characters the HTML must escape. 'e2e-ready' is the owner of the one test of
// client/tests/landing.test.ts that sets a portfolio up with nothing answered in the browser (the
// gate from "Get started", the perfect job's essentials, the landing card then ready): it sets back
// what it changes at its start, so a run never depends on the one before. The candidate 'e2e.candidate@example.com' (no domain, no
// recruiter space, no acceptance of the terms) is signed in as by client/tests/account.test.ts,
// claim-consent.test.ts, feedback.test.ts, recruiter.test.ts, hire-journey.test.ts, job-view.test.ts
// and the signed-in steps of landing.test.ts; the tests that would change it (accepting the terms,
// claiming, opening a recruiter space or recording a space: PUT /me/mode, deleting the account)
// answer those requests in the browser, so it stays that way.
// Matching (Path 2), for the test files of its screens to come: two candidates proposed to
// recruiters, 'e2e-match' (client/tests/matching-candidate.test.ts, which turns its discovery off
// and on) and 'e2e-match-card' (client/tests/matching-recruiter.test.ts, whose anonymous card the
// e2e recruiter reads), each with everything discovery asks for, set back on every run: the terms in
// force, a perfect job of three criteria with the pay, the gate journey, a Google Calendar grant
// (a placeholder: nothing ever asks Google with it) and a meeting type with hours, a discovery
// consent in force, an experience; and a job of the e2e recruiter in matching, approved, which
// both candidates' criteria pass (E2E_MATCHING_JOB_TITLE: no test tag matches it, so the files that
// remove their tagged postings leave it). They are proposed only by an API run with MATCHING=true,
// and with GOOGLE_CLIENT_SECRET set (any value: Calendar counts as configured; nothing asks Google
// unless a page books or lists slots, which the tests answer in the browser).
// Idempotent: safe to run against a seeded database.
// Usage: MONGO_URL=mongodb://... bun run seed:e2e
import mongoose, { Types } from "mongoose";
import {
  DISCOVERY_CONSENT_KEYS,
  ExperienceType,
  LEGAL_VERSION,
  currentConsent,
  journeyTemplate,
  parsePerfectJob
} from "portfolio-common";
import {
  AppointmentSchedule,
  DiscoveryProfile,
  Domain,
  Experience,
  JobPosting,
  PerfectJob,
  RateLimitCounter,
  User,
  Workflow
} from "../models/database";
import type { JobPosting as StoredJobPosting } from "../models/database/jobPosting";
import { reviewedVersion } from "../services/jobMatching";
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
  { email: 'e2e.preview@example.com', name: 'Pia', surname: 'Preview', domain: 'e2e-preview' },
  { email: 'e2e.ready@example.com', name: 'Remy', surname: 'Ready', domain: 'e2e-ready' }
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

// ── Matching (Path 2) ──────────────────────────────────────

/** The title of the e2e recruiter's job in matching, which no test file's tag matches */
const E2E_MATCHING_JOB_TITLE = 'Staff Platform Engineer (e2e matching)';
const E2E_MATCHING_JOB_ID = new Types.ObjectId('65e2e0000000000000000101');

// What the two candidates rate: the pay (a deal-breaker), the work mode and the contract, which the
// job below passes (55 k€ asked of 60-75 k€, hybrid, a CDI)
const { criteria: matchCriteria, problems } = parsePerfectJob({
  pay: { importance: 5, dealBreaker: true, perYear: 55_000 },
  workMode: { importance: 4, modes: ['hybrid', 'on_site'] },
  contractTypes: { importance: 3, types: ['cdi'] }
});
if (problems.length > 0) throw new Error(`The e2e perfect job breaks a rule: ${JSON.stringify(problems)}`);

const matchCandidates = [
  { email: 'e2e.match@example.com', name: 'Mia', surname: 'Match', domain: 'e2e-match', role: 'Backend engineer' },
  { email: 'e2e.matchcard@example.com', name: 'Cleo', surname: 'Card', domain: 'e2e-match-card', role: 'Platform engineer' }
];

const now = new Date();
for (const candidate of matchCandidates) {
  const user = await User.findOneAndUpdate(
    { email: candidate.email },
    {
      $setOnInsert: { name: candidate.name, surname: candidate.surname },
      // A grant as the API stores it once connected: a placeholder nothing ever sends to Google
      $set: { 'googleCalendar.refreshToken': 'e2e-placeholder', 'googleCalendar.connectedAt': now },
      $unset: { 'googleCalendar.revokedAt': 1 }
    },
    { upsert: true, returnDocument: 'after' }
  );
  await recordConsent(user._id, currentConsent(), 'account');
  const domain = await Domain.findOneAndUpdate(
    { name: candidate.domain },
    { $setOnInsert: { admin: user._id, experiences: [] } },
    { upsert: true, returnDocument: 'after' }
  );
  // One role on the card, when a test left none
  if (domain.experiences.length === 0) {
    const experience = await Experience.create({
      type: ExperienceType.Professional,
      title: candidate.role,
      summary: 'Seeded for the end-to-end tests of matching.',
      start: new Date(Date.UTC(now.getUTCFullYear() - 4, 0, 1)),
      projects: []
    });
    await Domain.updateOne({ _id: domain._id }, { $push: { experiences: experience._id } });
  }
  await PerfectJob.findOneAndUpdate({ user: user._id }, { $set: { criteria: matchCriteria } }, { upsert: true });
  await Workflow.findOneAndUpdate({ user: user._id }, { $set: { steps: journeyTemplate('gate') } }, { upsert: true });
  await AppointmentSchedule.findOneAndUpdate(
    { user: user._id, title: 'E2E intro call' },
    {
      $set: {
        timezone: 'Europe/Paris',
        enabled: true,
        availability: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00' }))
      }
    },
    { upsert: true }
  );
  // A consent in force, given now (it never lapses between runs), and active
  await DiscoveryProfile.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        enabledAt: now,
        lastActiveAt: now,
        consents: [{ action: 'granted', at: now, termsVersion: LEGAL_VERSION, wordingKey: DISCOVERY_CONSENT_KEYS.en }]
      },
      $unset: { withdrawnAt: 1, card: 1 }
    },
    { upsert: true }
  );
}

// The e2e recruiter's job in matching, approved as it is (set on every run, as the API stores it)
await JobPosting.findOneAndUpdate(
  { _id: E2E_MATCHING_JOB_ID },
  {
    $set: {
      recruiter: recruiter._id,
      title: E2E_MATCHING_JOB_TITLE,
      description: '## The job\n\nRun the platform the product teams build on. Seeded for the end-to-end tests of matching.',
      company: 'E2E Matching Corp',
      status: 'open',
      location: { country: 'FR', city: 'Paris', postalCode: '75011', workMode: 'hybrid', remoteDaysPerWeek: 2 },
      contract: { type: 'cdi' },
      workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
      pay: { min: 60_000, max: 75_000, currency: 'EUR', period: 'year' }
    },
    $setOnInsert: { publishedAt: now }
  },
  { upsert: true }
);
const matchingJob = (await JobPosting.findById(E2E_MATCHING_JOB_ID).lean<StoredJobPosting>())!;
await JobPosting.updateOne(
  { _id: E2E_MATCHING_JOB_ID },
  {
    $set: {
      matching: {
        enabledAt: now,
        review: { status: 'approved', requestedAt: now, reviewedAt: now, version: reviewedVersion(matchingJob) }
      }
    }
  },
  { timestamps: false }
);

// The jobs shared on a journey that scores them are counted, per owner and recruiter and per UTC
// day (JOB_SHARES_PER_DAY of services/workflowSteps/job.ts, keyed 'job-share:<hash>'): every run
// starts from none, so the e2e recruiter's picks never depend on the runs before it on the same day
// (client/tests/hire-journey.test.ts shares jobs on the scored journey of 'e2e-journey')
await RateLimitCounter.deleteMany({ _id: /^job-share:/ });

console.log(
  `Seeded the e2e owners: ${owners.map((owner) => owner.domain).join(', ')}, the e2e recruiter and the e2e candidate, ` +
    `and for matching: ${matchCandidates.map((candidate) => candidate.domain).join(', ')} and the job "${E2E_MATCHING_JOB_TITLE}"`
);
await mongoose.disconnect();
process.exit(0);
