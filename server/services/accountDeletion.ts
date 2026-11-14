import { Types } from 'mongoose';
import {
  AppointmentBooking,
  AppointmentSchedule,
  Domain,
  Experience,
  JobApplication,
  JobPosting,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import { CouldntVerifyJwtError } from '../errors';
import { revokeGoogleCalendarAccess } from './googleCalendar';
import { logger } from './logger';

// Self-service deletion of an account (DELETE /me, GDPR art. 17): everything
// tied to the account goes, at once and for good. What stays is shared or
// anonymous: the skills catalogue (names other portfolios use) and the rate
// limit counters (keyed hashes, gone at the end of their window).
//
// Every model with a user reference (server/models/database/) is covered:
// - Domain.admin, and the Experiences listed by those domains (their
//   companies and projects are embedded in them)
// - Workflow.user (the owner's hiring journey)
// - WorkflowInstance.owner (visitors' progress in the owner's journey) and
//   .visitor (the account's progress in other journeys)
// - JobPosting.recruiter, with every JobApplication to those postings
// - JobApplication.candidate (and .domain, the candidate's own domain)
// - AppointmentSchedule.user and AppointmentBooking.user
// - the User itself, Google Calendar tokens and acceptances included

/** What was removed, by collection (the log line and the tests read it) */
export interface AccountDeletionSummary {
  domains: number;
  experiences: number;
  workflows: number;
  workflowInstances: number;
  jobPostings: number;
  jobApplications: number;
  appointmentSchedules: number;
  appointmentBookings: number;
  /** What Google answered when asked to revoke the Google Calendar grant ('none': no grant stored) */
  googleCalendar: Awaited<ReturnType<typeof revokeGoogleCalendarAccess>>;
}

const unknownUser = () => new CouldntVerifyJwtError('Unauthorized: unknown user');

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
  if (!(await User.exists({ _id: id }))) throw unknownUser();

  // While the tokens are still stored: they go with the account
  const googleCalendar = await revokeGoogleCalendarAccess(id);

  const domains = await Domain.find({ admin: id }, { experiences: 1 })
    .lean<{ _id: Types.ObjectId; experiences: Types.ObjectId[] }[]>();
  const domainIds = domains.map((domain) => domain._id);
  const experienceIds = domains.flatMap((domain) => domain.experiences);
  const jobIds = (await JobPosting.find({ recruiter: id }, { _id: 1 }).lean()).map((job) => job._id);

  const [experiences, jobApplications, workflowInstances, workflows, appointmentBookings, appointmentSchedules] =
    await Promise.all([
      Experience.deleteMany({ _id: { $in: experienceIds } }),
      JobApplication.deleteMany({
        $or: [{ job: { $in: jobIds } }, { candidate: id }, { domain: { $in: domainIds } }]
      }),
      WorkflowInstance.deleteMany({ $or: [{ owner: id }, { visitor: id }] }),
      Workflow.deleteMany({ user: id }),
      AppointmentBooking.deleteMany({ user: id }),
      AppointmentSchedule.deleteMany({ user: id })
    ]);
  // After their applications, then the domains after their experiences: an
  // interrupted deletion leaves nothing pointing at what is gone
  const jobPostings = await JobPosting.deleteMany({ _id: { $in: jobIds } });
  const removedDomains = await Domain.deleteMany({ _id: { $in: domainIds } });
  await User.deleteOne({ _id: id });

  const summary: AccountDeletionSummary = {
    domains: removedDomains.deletedCount,
    experiences: experiences.deletedCount,
    workflows: workflows.deletedCount,
    workflowInstances: workflowInstances.deletedCount,
    jobPostings: jobPostings.deletedCount,
    jobApplications: jobApplications.deletedCount,
    appointmentSchedules: appointmentSchedules.deletedCount,
    appointmentBookings: appointmentBookings.deletedCount,
    googleCalendar
  };
  // The user id only: no email, no domain name, no token
  logger.info('Account deleted', { userId, ...summary });
  return summary;
}
