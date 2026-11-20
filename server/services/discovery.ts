import { Types } from 'mongoose';
import {
  discoveryConsentCutoff,
  discoveryConsentExpiry,
  discoveryConsentKey,
  discoveryRequirementMessage,
  discoveryRequirements,
  discoveryState,
  parseDiscoveryCard,
  parseDiscoveryConsent
} from 'portfolio-common';
import type { DiscoveryConsentInput, DiscoveryRequirement, DiscoveryState } from 'portfolio-common';
import { env } from '../env';
import { DiscoveryProfile, Domain } from '../models/database';
import { FieldValidationError, TooManyRequestsError } from '../errors';
import { candidateReadiness } from './candidateReadiness';
import { userAcceptedCurrentTerms } from './legal';
import { logger } from './logger';
import { rateLimitKey, takeRateLimit } from './rateLimit';
import type { RateLimit } from './rateLimit';
import { ownerJourney } from './workflows';
import { jobMatchMinScore } from './workflowSteps/jobMatch';
import { m } from './discovery.messages';

// Discovery (Path 2, matching on open jobs, behind MATCHING): a candidate
// asks to be proposed to recruiters, as an anonymous card, and can stop at
// once. What they must have set up is portfolio-common's discoveryRequirements,
// read from their readiness (services/candidateReadiness.ts, the one place
// that decides what an account has set up) with the terms in force and their
// activity; the consent is portfolio-common's parseDiscoveryConsent (18 or
// over, under the terms in force), recorded on their DiscoveryProfile with the
// key of its wording in the request's language, and so is its withdrawal.
//
// Everything here reads and writes the candidate's own documents only, and
// logs nothing they set (a headline, the experiences hidden). Deterministic:
// no model is asked anything, here or in what decides who is proposed to whom.

/** GET /discovery, and what the other discovery routes answer */
export interface DiscoveryDto {
  /** off, on (proposed to recruiters), paused (a requirement is missing) or lapsed (consent too old) */
  state: DiscoveryState;
  /** Since when discovery is on: the latest consent; null while off */
  enabledAt: Date | null;
  /** When that consent lapses (DISCOVERY_CONSENT_MONTHS after it); null while off */
  consentExpiresAt: Date | null;
  /** What the candidate misses to be proposed, in order (portfolio-common DISCOVERY_REQUIREMENTS) */
  missing: DiscoveryRequirement[];
  /**
   * The minimum of their journey's job match: the one bar a job is held to,
   * proposed or shared through their link alike; null without a job match
   */
  minScore: number | null;
  /** What their anonymous card shows (portfolio-common's parseDiscoveryCard) */
  card: { headline: string | null; hiddenExperiences: string[] };
}

/** Times an account turns discovery on per UTC day: each one is recorded, and kept */
export const DISCOVERY_GRANTS_PER_DAY: RateLimit = { limit: 10, windowMs: 24 * 60 * 60_000 };

/** The counter of `userId`'s consents (keyed by a hash: rateLimitKey) */
export const discoveryGrantsKey = (userId: string) => rateLimitKey('discovery-grant', userId);

/** How often an active candidate's lastActiveAt is written again, at most */
const TOUCH_INTERVAL_MS = 24 * 60 * 60_000;

interface StoredProfile {
  enabledAt?: Date | null;
  lastActiveAt?: Date | null;
  card?: { headline?: string | null; hiddenExperiences?: Types.ObjectId[] | null } | null;
}

const storedProfile = (userId: string) =>
  DiscoveryProfile.findOne({ user: userId }, { enabledAt: 1, lastActiveAt: 1, card: 1 }).lean<StoredProfile>();

/** The ids of the experiences of the portfolio `userId` owns */
const ownExperiences = async (userId: string): Promise<Set<string>> => {
  const domain = await Domain.findOne({ admin: userId }, { experiences: 1 })
    .lean<{ experiences?: Types.ObjectId[] }>();
  return new Set((domain?.experiences ?? []).map(String));
};

/**
 * What the account `userId` misses to be proposed to recruiters: its readiness,
 * the terms in force, and, while discovery is on, its activity since
 * `lastActiveAt`
 */
const missingRequirements = async (
  userId: string,
  lastActiveAt: Date | null | undefined,
  now: Date
): Promise<DiscoveryRequirement[]> => {
  const [readiness, termsAccepted] = await Promise.all([
    candidateReadiness(userId),
    userAcceptedCurrentTerms(userId)
  ]);
  return discoveryRequirements(readiness, { termsAccepted, lastActiveAt, now });
};

/** Where the account `userId` stands in discovery: see DiscoveryDto. Reads only, stores nothing */
export async function discoveryStatus(userId: string, now = new Date()): Promise<DiscoveryDto> {
  const profile = await storedProfile(userId);
  const enabledAt = profile?.enabledAt ?? null;
  const [missing, journey, own] = await Promise.all([
    // Activity counts only while discovery is on: turning it on again is activity
    missingRequirements(userId, enabledAt ? profile?.lastActiveAt : undefined, now),
    ownerJourney(userId),
    ownExperiences(userId)
  ]);
  const jobMatch = journey.steps.find((step) => step.type === 'job-match');
  return {
    state: discoveryState(enabledAt, missing, now),
    enabledAt,
    consentExpiresAt: enabledAt ? discoveryConsentExpiry(enabledAt) : null,
    missing,
    minScore: jobMatch ? jobMatchMinScore(jobMatch.config) : null,
    card: {
      headline: profile?.card?.headline || null,
      // An experience deleted since is no longer hidden: it is gone
      hiddenExperiences: (profile?.card?.hiddenExperiences ?? []).map(String).filter((id) => own.has(id))
    }
  };
}

/**
 * The discovery consent a client sent, checked (portfolio-common
 * parseDiscoveryConsent): throws FieldValidationError (422) naming `consent`,
 * `consent.adultConfirmed` or `consent.termsVersion` (an older version of the
 * terms) otherwise
 */
export const assertValidDiscoveryConsent = (input: unknown): DiscoveryConsentInput => {
  const result = parseDiscoveryConsent(input);
  if (!result.ok) throw new FieldValidationError(result.property, result.message);
  return result.consent;
};

/**
 * Turns discovery on for the account `userId` with the consent `input`
 * (POST /discovery/consent). 422 on `consent...` for a consent that is not
 * one, then on `requirements.<requirement>` for the first requirement it
 * misses (discoveryRequirements), and 429 over DISCOVERY_GRANTS_PER_DAY.
 * Recorded once, atomically: an account already on, with its consent in
 * force, records nothing again (two requests at once append one entry); a
 * lapsed consent is given again. Turning it on is activity.
 */
export async function grantDiscovery(userId: string, input: unknown, now = new Date()): Promise<DiscoveryDto> {
  const consent = assertValidDiscoveryConsent(input);
  const [missing, profile] = await Promise.all([missingRequirements(userId, now, now), storedProfile(userId)]);
  const [first] = missing;
  if (first) throw new FieldValidationError(`requirements.${first}`, () => discoveryRequirementMessage(first));
  if (discoveryState(profile?.enabledAt, missing, now) === 'on') {
    // On already, with a consent in force: nothing to record, but it is activity
    await DiscoveryProfile.updateOne({ user: userId }, { $set: { lastActiveAt: now } });
    return discoveryStatus(userId, now);
  }

  const { retryAfterSeconds } = await takeRateLimit(discoveryGrantsKey(userId), DISCOVERY_GRANTS_PER_DAY);
  if (retryAfterSeconds !== null) {
    throw new TooManyRequestsError(() => m.tooManyGrants(DISCOVERY_GRANTS_PER_DAY.limit), retryAfterSeconds);
  }
  // The profile first (concurrent upserts on its unique user are retried by
  // MongoDB), then the consent, only where none is in force
  await DiscoveryProfile.updateOne({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true });
  await DiscoveryProfile.updateOne(
    {
      user: userId,
      $or: [{ enabledAt: { $exists: false } }, { enabledAt: { $lte: discoveryConsentCutoff(now) } }]
    },
    {
      $set: { enabledAt: now, lastActiveAt: now },
      $push: {
        consents: {
          action: 'granted',
          at: now,
          termsVersion: consent.termsVersion,
          wordingKey: discoveryConsentKey()
        }
      }
    }
  );
  return discoveryStatus(userId, now);
}

/**
 * What discovery does once a candidate withdraws, beyond leaving every feed
 * (which their unset enabledAt does at once). Tests replace it
 */
export const discoveryWithdrawal = {
  /**
   * Drops the decisions about the candidate `candidateId` that no mutual
   * interest came of: theirs on jobs, and recruiters' on them. The mutual
   * interests stay: each is an agreement the candidate ends on its own. None
   * exists yet: the decisions of matching fill this in
   */
  dropPendingDecisions: async (_candidateId: string): Promise<void> => {}
};

/**
 * Turns discovery off for the account `userId` (DELETE /discovery/consent):
 * at once, whatever it misses, and recorded (a withdrawal, appended to its
 * consents). An account already off records nothing. The pending decisions
 * about the candidate are dropped (discoveryWithdrawal)
 */
export async function withdrawDiscovery(userId: string, now = new Date()): Promise<DiscoveryDto> {
  await DiscoveryProfile.updateOne(
    { user: userId, enabledAt: { $exists: true } },
    { $unset: { enabledAt: 1 }, $push: { consents: { action: 'withdrawn', at: now } } }
  );
  // Even when it was off: a withdrawal stopped midway is finished
  await discoveryWithdrawal.dropPendingDecisions(userId);
  return discoveryStatus(userId, now);
}

/**
 * Saves what the anonymous card of the account `userId` shows (PUT
 * /discovery), on or off: 422 on `card...` for settings that break a rule
 * (portfolio-common's parseDiscoveryCard). Only the experiences of its own
 * portfolio are kept hidden. Changing it is activity.
 */
export async function saveDiscoveryCard(userId: string, input: unknown, now = new Date()): Promise<DiscoveryDto> {
  const result = parseDiscoveryCard(input);
  if (!result.ok) throw new FieldValidationError(result.property, result.message);
  const own = await ownExperiences(userId);
  const hidden = result.card.hiddenExperiences.filter((id) => own.has(id)).map((id) => new Types.ObjectId(id));
  const { headline } = result.card;
  await DiscoveryProfile.updateOne(
    { user: userId },
    {
      $set: {
        'card.hiddenExperiences': hidden,
        lastActiveAt: now,
        ...(headline ? { 'card.headline': headline } : {})
      },
      ...(headline ? {} : { $unset: { 'card.headline': 1 } })
    },
    { upsert: true }
  );
  return discoveryStatus(userId, now);
}

/**
 * Records that the candidate `userId` is active, while discovery is on for
 * them: what keeps them proposed past DISCOVERY_INACTIVITY_DAYS. Called when
 * they sign in (POST /login); a session lasts 7 days, so whatever they do is
 * within 7 days of a sign-in. Written at most once a day, and nothing while
 * MATCHING is off. Never throws: a sign-in never fails on it
 */
export async function touchDiscovery(userId: string, now = new Date()): Promise<void> {
  if (!env.matchingEnabled || !Types.ObjectId.isValid(userId)) return;
  try {
    await DiscoveryProfile.updateOne(
      {
        user: userId,
        enabledAt: { $exists: true },
        $or: [
          { lastActiveAt: { $exists: false } },
          { lastActiveAt: { $lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } }
        ]
      },
      { $set: { lastActiveAt: now } }
    );
  } catch (error) {
    logger.warn('Discovery activity could not be recorded', {
      userId,
      error: error instanceof Error ? error.name : 'unknown'
    });
  }
}
