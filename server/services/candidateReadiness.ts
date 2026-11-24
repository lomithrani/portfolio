import { ratedCriteria, stepManifest } from 'portfolio-common';
import type { CandidateReadiness } from 'portfolio-common';
import { env } from '../env';
import { AppointmentSchedule, Domain } from '../models/database';
import { bookableScheduleFilter } from './appointmentSchedules';
import { commuteAvailability } from './commute';
import { getCalendarConnection } from './googleCalendar';
import { perfectJobOf } from './perfectJobs';
import { knownStepType, ownerJourney } from './workflows';

// What a candidate still has to set up before they share the link of their
// portfolio (GET /me/readiness): the one place that decides it, for the
// onboarding of the landing page and the admin's checklist alike. It reads
// the account's own documents only (its portfolio, perfect job, journey,
// calendar and meeting types) and says what is there, never what it holds:
// how many criteria are rated and which, not what they ask for; the types of
// the journey's steps, not their settings. The discovery of Path 2 reads it
// too (services/discovery.ts, portfolio-common's discoveryRequirements): one
// readiness, for sharing the link and for being proposed to recruiters.

/** GET /me/readiness: see portfolio-common's CandidateReadiness (common/models/readiness.ts) */
export type { CandidateReadiness };

/** A job step, then a job match, then a meeting, whatever comes between them */
const isGate = (types: readonly string[]) => {
  const job = types.indexOf('job');
  const match = types.indexOf('job-match');
  const meeting = types.indexOf('meeting');
  return job !== -1 && job < match && match < meeting;
};

/** A step before the first meeting can never succeed: see CandidateReadiness.journey.blocked */
const isBlocked = (types: readonly string[]) => {
  const before = types.slice(0, Math.max(types.indexOf('meeting'), 0));
  const neededMissing = (type: string, index: number) =>
    (stepManifest(type)?.needs ?? []).some((needed) => !before.slice(0, index).includes(needed));
  return before.some((type, index) => !knownStepType(type) || neededMissing(type, index));
};

/**
 * How many meeting types of `userId` offer slots (bookableScheduleFilter): the ones the page for
 * recruiters lists
 */
const bookableSchedules = (userId: string) =>
  AppointmentSchedule.countDocuments(bookableScheduleFilter(userId));

/** Where the account `userId` stands in setting up its portfolio: see CandidateReadiness */
export async function candidateReadiness(userId: string): Promise<CandidateReadiness> {
  const [domain, perfectJob, journey, connection, enabledSchedules] = await Promise.all([
    Domain.findOne({ admin: userId }, { name: 1, experiences: 1 }).lean(),
    perfectJobOf(userId),
    ownerJourney(userId),
    getCalendarConnection(userId),
    bookableSchedules(userId)
  ]);
  const rated = new Set(ratedCriteria(perfectJob));
  const types = journey.steps.map((step) => step.type);
  const blocked = isBlocked(types);
  return {
    domain: domain?.name ?? null,
    experiences: domain?.experiences?.length ?? 0,
    perfectJob: {
      criteria: rated.size,
      essentials: {
        pay: rated.has('pay'),
        workMode: rated.has('workMode'),
        place: rated.has('cities') || (rated.has('commute') && commuteAvailability().enabled),
        contractTypes: rated.has('contractTypes')
      }
    },
    journey: {
      saved: journey.saved,
      types,
      blocked,
      gate: !blocked && isGate(types),
      meeting: !blocked && types.includes('meeting')
    },
    calendar: {
      configured: env.googleCalendarEnabled,
      connected: connection.connected,
      reconnect: connection.revokedAt !== null,
      enabledSchedules
    }
  };
}
