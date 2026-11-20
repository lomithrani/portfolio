import mongoose, { Types } from 'mongoose';
import {
  AppointmentBooking,
  AppointmentSchedule,
  DiscoveryProfile,
  Domain,
  Experience,
  JobPosting,
  PerfectJob,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import { CouldntVerifyJwtError } from '../errors';
import { UNKNOWN_USER } from '../protocol';
import { carryOverAccountQuotas } from './accountQuotas';
import { revokeGoogleCalendarAccess } from './googleCalendar';
import { logger } from './logger';

// Self-service deletion of an account (DELETE /me, GDPR art. 17): everything
// tied to the account goes, at once and for good. What stays is shared or
// pseudonymous: the skills catalogue (names other portfolios use) and the
// rate limit counters (keyed hashes, gone at the end of their window); the
// per-account quotas the account used are carried over to a keyed hash of its
// Google id until their window ends (at most 30 days, services/accountQuotas.ts),
// so deleting and re-creating the account does not reset them.
//
// Every model with a user reference (server/models/database/) is covered:
// - Domain.admin, and the Experiences listed by those domains (their
//   companies and projects are embedded in them)
// - Workflow.user (the owner's hiring journey), and the documents of the
//   legacy `workflows` collection (the old /workflows API, no longer read)
// - WorkflowInstance.owner (visitors' progress in the owner's journey) and
//   .visitor (the account's progress in other journeys)
// - PerfectJob.user (the criteria the owner rated, the address they travel
//   from among them). The travel times computed from that address stay in
//   CommuteCache until they expire (30 days at most): their keys are hashes
//   that show neither the address nor the account
// - JobPosting.recruiter, and the documents of the legacy `jobapplications`
//   collection (the removed job board's applications, no longer read, dropped
//   by hand after the deploy: docs/DEPLOYMENT.md) to those postings, of the
//   account as candidate and of its domains
// - AppointmentSchedule.user and AppointmentBooking.user; AppointmentBooking.visitor
//   (the meetings the account booked on other portfolios) is unset: the
//   meeting stays booked in its owner's calendar, and its slot held
// - DiscoveryProfile.user (Path 2: whether the account is proposed to
//   recruiters, its anonymous card's settings, its consents and withdrawals)
// - the User itself, Google Calendar tokens and acceptances included

/** What was removed, by collection (the log line and the tests read it) */
export interface AccountDeletionSummary {
  domains: number;
  experiences: number;
  workflows: number;
  /** Documents of the legacy `workflows` collection (models/database/workflow.ts) */
  legacyWorkflows: number;
  workflowInstances: number;
  perfectJobs: number;
  jobPostings: number;
  /** Documents of the legacy `jobapplications` collection (the removed job board) */
  legacyJobApplications: number;
  appointmentSchedules: number;
  appointmentBookings: number;
  /** Bookings the account made on other portfolios, no longer tied to it */
  bookedMeetings: number;
  /** Its discovery (Path 2): the consents it gave and withdrew go with it */
  discoveryProfiles: number;
  /** What Google answered when asked to revoke the Google Calendar grant ('none': no grant stored) */
  googleCalendar: Awaited<ReturnType<typeof revokeGoogleCalendarAccess>>;
}

/** Collection of the old /workflows API (`{ user, name, description, enabled, steps }`), still stored, never read */
export const LEGACY_WORKFLOWS_COLLECTION = 'workflows';

/**
 * Collection of the removed job board's applications (`{ job, candidate, domain, source }`), never
 * read; dropped by hand on each stage (docs/DEPLOYMENT.md), then this goes too
 */
export const LEGACY_JOB_APPLICATIONS_COLLECTION = 'jobapplications';

const unknownUser = () => new CouldntVerifyJwtError(UNKNOWN_USER);

/**
 * Deletes the account `userId` and everything tied to it. 401 when the
 * account no longer exists. The Google Calendar grant is revoked at Google
 * first, best effort (a failure never stops the deletion); then the data
 * the account owns, the account last, so a deletion interrupted midway can
 * be run again from the same session.
 */
export async function deleteAccount(userId: string): Promise<AccountDeletionSummary> {
  if (!Types.ObjectId.isValid(userId)) throw unknownUser();
  const id = new Types.ObjectId(userId);
  const user = await User.findById(id, { googleId: 1, 'recruiter.jobImportsUsed': 1 }).lean();
  if (!user) throw unknownUser();

  // While the tokens are still stored: they go with the account
  const googleCalendar = await revokeGoogleCalendarAccess(id);

  const domains = await Domain.find({ admin: id }, { experiences: 1 })
    .lean<{ _id: Types.ObjectId; experiences: Types.ObjectId[] }[]>();
  const domainIds = domains.map((domain) => domain._id);
  const experienceIds = domains.flatMap((domain) => domain.experiences);
  const jobIds = (await JobPosting.find({ recruiter: id }, { _id: 1 }).lean()).map((job) => job._id);

  const [
    experiences,
    workflowInstances,
    workflows,
    perfectJobs,
    legacyWorkflows,
    legacyJobApplications,
    appointmentBookings,
    appointmentSchedules,
    bookedMeetings,
    discoveryProfiles
  ] = await Promise.all([
    Experience.deleteMany({ _id: { $in: experienceIds } }),
    WorkflowInstance.deleteMany({ $or: [{ owner: id }, { visitor: id }] }),
    Workflow.deleteMany({ user: id }),
    PerfectJob.deleteMany({ user: id }),
    // The old /workflows API wrote there; no model reads it any more
    mongoose.connection.collection(LEGACY_WORKFLOWS_COLLECTION).deleteMany({ user: { $in: [id, userId] } }),
    // The removed job board wrote there, until the collection is dropped
    mongoose.connection.collection(LEGACY_JOB_APPLICATIONS_COLLECTION).deleteMany({
      $or: [{ candidate: id }, { domain: { $in: domainIds } }, { job: { $in: jobIds } }]
    }),
    AppointmentBooking.deleteMany({ user: id }),
    AppointmentSchedule.deleteMany({ user: id }),
    AppointmentBooking.updateMany({ visitor: id }, { $unset: { visitor: 1 } }),
    DiscoveryProfile.deleteMany({ user: id })
  ]);
  // The postings after their applications, then the domains after their
  // experiences: an interrupted deletion leaves nothing pointing at what is gone
  const jobPostings = await JobPosting.deleteMany({ recruiter: id });
  const removedDomains = await Domain.deleteMany({ _id: { $in: domainIds } });
  // Before the account, which holds the Google id and the plan's imports used
  await carryOverAccountQuotas(userId, user.googleId, user.recruiter?.jobImportsUsed);
  await User.deleteOne({ _id: id });

  const summary: AccountDeletionSummary = {
    domains: removedDomains.deletedCount,
    experiences: experiences.deletedCount,
    workflows: workflows.deletedCount,
    legacyWorkflows: legacyWorkflows.deletedCount,
    workflowInstances: workflowInstances.deletedCount,
    perfectJobs: perfectJobs.deletedCount,
    jobPostings: jobPostings.deletedCount,
    legacyJobApplications: legacyJobApplications.deletedCount,
    appointmentSchedules: appointmentSchedules.deletedCount,
    appointmentBookings: appointmentBookings.deletedCount,
    bookedMeetings: bookedMeetings.modifiedCount,
    discoveryProfiles: discoveryProfiles.deletedCount,
    googleCalendar
  };
  // The user id only: no email, no domain name, no token
  logger.info('Account deleted', { userId, ...summary });
  return summary;
}
