import { ratedCriteria, stepManifest } from 'portfolio-common';
import { env } from '../env';
import { AppointmentSchedule, Domain } from '../models/database';
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
// the journey's steps, not their settings.

/** GET /me/readiness */
export interface CandidateReadiness {
  /** The address name of the portfolio the account owns; null until it claims one */
  domain: string | null;
  /** The experiences of that portfolio */
  experiences: number;
  perfectJob: {
    /** How many criteria are rated */
    criteria: number;
    /**
     * Whether the criteria that tell most jobs apart are rated: the pay, the work mode, where
     * the office is (the cities, or the commute while this server computes travel times: off,
     * the commute is left out of every score) and the contract types
     */
    essentials: { pay: boolean; workMode: boolean; place: boolean; contractTypes: boolean };
  };
  journey: {
    /** false: the owner never saved a journey, and has the default one (a meeting step only) */
    saved: boolean;
    /** The types of its steps, in order ('' for a stored step that is not one) */
    types: string[];
    /**
     * A step before the meeting can never succeed, so recruiters never reach the meeting: its
     * type is not one this version has (a stored step that is not one, a type removed since), or
     * a step type it needs is not before it. Only a journey written by hand or by an older
     * version (PUT /workflow refuses both); `gate` and `meeting` are then false
     */
    blocked: boolean;
    /**
     * Recruiters share a job, which is scored against the perfect job, before they can book: a
     * job step, then a job match, then a meeting (the gate template, journeyTemplate), whatever
     * comes between them and whatever their settings
     */
    gate: boolean;
    /** It leads to a meeting recruiters can reach */
    meeting: boolean;
  };
  calendar: {
    /** This server takes Google Calendar connections (GOOGLE_CLIENT_SECRET) */
    configured: boolean;
    /** A grant is stored */
    connected: boolean;
    /** Google refused the stored grant, and the owner has not connected again since */
    reconnect: boolean;
    /**
     * The meeting types (Appointments tab) recruiters can book: turned on, with hours (weekly
     * hours, or a day of their own with hours, from yesterday on). One turned on without hours
     * offers no slot: not counted
     */
    enabledSchedules: number;
  };
}

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
 * How many meeting types of `userId` offer slots: turned on, with weekly hours or a day of their
 * own with hours (from yesterday on, in UTC: a day that is still today somewhere). What a slot
 * also needs (the notice, the calendar's busy times) changes by the hour: not counted
 */
const bookableSchedules = (userId: string) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return AppointmentSchedule.countDocuments({
    user: userId,
    enabled: true,
    $or: [
      { 'availability.0': { $exists: true } },
      { dateOverrides: { $elemMatch: { available: true, date: { $gte: yesterday }, 'windows.0': { $exists: true } } } }
    ]
  });
};

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
