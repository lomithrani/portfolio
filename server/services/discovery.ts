import { Types } from 'mongoose';
import {
  DISCOVERY_REJOIN_DAYS,
  discoveryConsentExpiry,
  discoveryConsentKey,
  discoveryConsentRenewable,
  discoveryRenewalCutoff,
  discoveryRequirementMessage,
  discoveryRequirements,
  discoveryState,
  matchingMessages,
  parseDiscoveryCard,
  parseDiscoveryConsent
} from 'portfolio-common';
import type { DiscoveryConsentInput, DiscoveryRequirement, DiscoveryState } from 'portfolio-common';
import { env } from '../env';
import { DiscoveryProfile, Domain, Match } from '../models/database';
import { FieldValidationError, TooManyRequestsError } from '../errors';
import { candidateIdentity, identifiesCandidate } from './candidateCard';
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

/** The ids of the experiences of the portfolio `userId` owns (none without one) */
const ownExperiences = async (userId: string): Promise<Set<string>> => {
  const domain = await Domain.findOne({ admin: userId }, { experiences: 1 }).lean<{ experiences?: Types.ObjectId[] }>();
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

/**
 * Whether the account `userId` is proposed to recruiters now (the state `on`): its consent in
 * force, and nothing it misses (its readiness, the terms in force, its activity). Its
 * `profile` when the caller read it already (the feeds: services/matchFeeds.ts). Reads only
 */
export async function isProposed(
  userId: string,
  now = new Date(),
  profile?: Pick<StoredProfile, 'enabledAt' | 'lastActiveAt'> | null
): Promise<boolean> {
  const stored = profile === undefined ? await storedProfile(userId) : profile;
  const enabledAt = stored?.enabledAt;
  if (!enabledAt || discoveryState(enabledAt, [], now) !== 'on') return false;
  const missing = await missingRequirements(userId, stored?.lastActiveAt, now);
  return missing.length === 0;
}

/**
 * Whether discovery is off for the account `userId`, or a withdrawal of it is under way: no consent
 * in force (`enabledAt` unset), or a withdrawal asked since the latest consent (`withdrawnAt`, which
 * a withdrawal writes before it unsets `enabledAt` and drops the decisions about them). What a
 * decision of matching reads again once it is written (services/matches.ts): a withdrawal that
 * landed between its check and its write had dropped the decisions before this one was there.
 * Reads only
 */
export async function withdrawnFromDiscovery(userId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId)) return true;
  const profile = await DiscoveryProfile.findOne({ user: userId }, { enabledAt: 1, withdrawnAt: 1 }).lean<{
    enabledAt?: Date | null;
    withdrawnAt?: Date | null;
  }>();
  const { enabledAt, withdrawnAt } = profile ?? {};
  return !enabledAt || (!!withdrawnAt && withdrawnAt.getTime() >= enabledAt.getTime());
}

/** Where the account `userId` stands in discovery: see DiscoveryDto. Reads only, stores nothing */
export async function discoveryStatus(userId: string, now = new Date()): Promise<DiscoveryDto> {
  const profile = await storedProfile(userId);
  const enabledAt = profile?.enabledAt ?? null;
  const [missing, journey, experiences] = await Promise.all([
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
      hiddenExperiences: (profile?.card?.hiddenExperiences ?? [])
        .map(String)
        .filter((id) => experiences.has(id))
    }
  };
}

/**
 * The message of a refusal, read again in the language in use: a pure parse
 * asked once more, so the 422 is in the visitor's language and its log line
 * in English (inBothLanguages)
 */
const refusal = (result: { ok: true } | { ok: false; message: string }) => (result.ok ? '' : result.message);

/**
 * The discovery consent a client sent, checked (portfolio-common
 * parseDiscoveryConsent): throws FieldValidationError (422) naming `consent`,
 * `consent.adultConfirmed` or `consent.termsVersion` (an older version of the
 * terms) otherwise
 */
export const assertValidDiscoveryConsent = (input: unknown): DiscoveryConsentInput => {
  const result = parseDiscoveryConsent(input);
  if (!result.ok) throw new FieldValidationError(result.property, () => refusal(parseDiscoveryConsent(input)));
  return result.consent;
};

/** DISCOVERY_REJOIN_DAYS, in milliseconds */
const REJOIN_MS = DISCOVERY_REJOIN_DAYS * 24 * 60 * 60_000;

/**
 * In how many seconds the account `userId` may turn discovery on again at `now`: null when it may,
 * else the rest of DISCOVERY_REJOIN_DAYS after the withdrawal that last turned it off (its consents'
 * latest entry). A withdrawal drops every decision about the candidate no mutual interest came of,
 * recruiters' passes included: turning discovery on again at once would put them back before
 * every recruiter who passed them, and tell them which jobs those were. A withdrawal of an account
 * that was not on records nothing, and holds nothing back; nor does one asked after `now`, or at
 * the same moment (a later request, which wins: the opt-in then records nothing)
 */
const rejoinRetryAfter = async (userId: string, now: Date): Promise<number | null> => {
  const profile = await DiscoveryProfile.findOne({ user: userId }, { consents: { $slice: -1 } }).lean<{
    consents?: { action?: string; at?: Date }[];
  }>();
  const [latest] = profile?.consents ?? [];
  if (latest?.action !== 'withdrawn' || !latest.at || latest.at >= now) return null;
  const rejoinAt = latest.at.getTime() + REJOIN_MS;
  return rejoinAt > now.getTime() ? Math.ceil((rejoinAt - now.getTime()) / 1000) : null;
};

/**
 * Turns discovery on for the account `userId` with the consent `input`
 * (POST /discovery/consent). 422 on `consent...` for a consent that is not
 * one, then on `requirements.<requirement>` for the first requirement it
 * misses (discoveryRequirements), 429 within DISCOVERY_REJOIN_DAYS of the
 * withdrawal that last turned it off (rejoinRetryAfter, checked again in the
 * write that records the consent, so one that lands meanwhile counts), and 429 over
 * DISCOVERY_GRANTS_PER_DAY (an opt-in refused before uses none of them).
 * Recorded once, atomically: an account
 * already on, with a consent in force that does not lapse within
 * DISCOVERY_CONSENT_RENEWAL_DAYS, records nothing again (two requests at once
 * append one entry); one that lapses within them, or has lapsed, is given
 * again, from which DISCOVERY_CONSENT_MONTHS count again. A withdrawal made
 * after this request started wins: the opt-in then records nothing
 * (withdrawDiscovery). Turning it on is activity.
 *
 * `now` is when the request started, which a withdrawal is compared with.
 */
export async function grantDiscovery(userId: string, input: unknown, now = new Date()): Promise<DiscoveryDto> {
  const consent = assertValidDiscoveryConsent(input);
  const [missing, profile] = await Promise.all([missingRequirements(userId, now, now), storedProfile(userId)]);
  const [first] = missing;
  if (first) throw new FieldValidationError(`requirements.${first}`, () => discoveryRequirementMessage(first));
  if (discoveryState(profile?.enabledAt, missing, now) === 'on' && !discoveryConsentRenewable(profile?.enabledAt, now)) {
    // On already, with a consent in force for a while yet: nothing to record, but it is activity
    await DiscoveryProfile.updateOne({ user: userId }, { $set: { lastActiveAt: now } });
    return discoveryStatus(userId, now);
  }

  const rejoinIn = await rejoinRetryAfter(userId, now);
  if (rejoinIn !== null) throw new TooManyRequestsError(() => m.rejoinTooSoon(DISCOVERY_REJOIN_DAYS), rejoinIn);

  const { retryAfterSeconds } = await takeRateLimit(discoveryGrantsKey(userId), DISCOVERY_GRANTS_PER_DAY);
  if (retryAfterSeconds !== null) {
    throw new TooManyRequestsError(() => m.tooManyGrants(DISCOVERY_GRANTS_PER_DAY.limit), retryAfterSeconds);
  }
  // The profile first (concurrent upserts on its unique user are retried by
  // MongoDB), then the consent, only where none is in force for a while yet,
  // where no withdrawal came after this request started, and where none turned
  // discovery off within DISCOVERY_REJOIN_DAYS (rejoinRetryAfter, checked again
  // in the write: a withdrawal that started before this request, and turned it
  // off between the reads above and this write, holds it back all the same)
  await DiscoveryProfile.updateOne({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true });
  const { modifiedCount } = await DiscoveryProfile.updateOne(
    {
      user: userId,
      $and: [
        { $or: [{ enabledAt: { $exists: false } }, { enabledAt: { $lte: discoveryRenewalCutoff(now) } }] },
        { $or: [{ withdrawnAt: { $exists: false } }, { withdrawnAt: { $lt: now } }] },
        { consents: { $not: { $elemMatch: { action: 'withdrawn', at: { $gt: new Date(now.getTime() - REJOIN_MS) } } } } }
      ]
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
  if (modifiedCount === 0) {
    const heldIn = await rejoinRetryAfter(userId, now);
    if (heldIn !== null) throw new TooManyRequestsError(() => m.rejoinTooSoon(DISCOVERY_REJOIN_DAYS), heldIn);
  }
  return discoveryStatus(userId, now);
}

/**
 * What discovery does once a candidate withdraws, beyond leaving every feed
 * (which their unset enabledAt does at once). Tests replace it
 */
export const discoveryWithdrawal = {
  /**
   * Drops the decisions about the candidate `candidateId` that no mutual
   * interest came of (their matches without one: models/database/match.ts):
   * theirs on jobs, and recruiters' on them. The mutual interests stay: each
   * is an agreement the candidate ends on its own
   */
  dropPendingDecisions: async (candidateId: string): Promise<void> => {
    if (!Types.ObjectId.isValid(candidateId)) return;
    await Match.deleteMany({ candidate: candidateId, matchedAt: { $exists: false } });
  }
};

/**
 * Turns discovery off for the account `userId` (DELETE /discovery/consent):
 * at once, whatever it misses, and recorded (a withdrawal, appended to its
 * consents). An account already off appends nothing. The pending decisions
 * about the candidate are dropped (discoveryWithdrawal)
 *
 * Every withdrawal, an account never on included, first keeps when it was
 * asked (`withdrawnAt`, the latest): an opt-in that started before it and
 * writes after it then records nothing (grantDiscovery), so a candidate who
 * turned discovery on then off at once is off, whatever order the two
 * requests' writes land in.
 */
export async function withdrawDiscovery(userId: string, now = new Date()): Promise<DiscoveryDto> {
  await DiscoveryProfile.updateOne({ user: userId }, { $max: { withdrawnAt: now } }, { upsert: true });
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
 * (portfolio-common's parseDiscoveryCard), then on `card.headline` for a
 * headline that says who the account is: its name (its account's, its email
 * address's), its portfolio's title or address name, a company or a place of
 * its experiences, a place of its perfect job, a page of the site
 * (identifiesCandidate, the rule the card keeps its texts to). Only the
 * experiences of its own portfolio are kept hidden. Changing it is activity.
 */
export async function saveDiscoveryCard(userId: string, input: unknown, now = new Date()): Promise<DiscoveryDto> {
  const result = parseDiscoveryCard(input);
  if (!result.ok) throw new FieldValidationError(result.property, () => refusal(parseDiscoveryCard(input)));
  const { headline } = result.card;
  const [experiences, identity] = await Promise.all([
    ownExperiences(userId),
    headline ? candidateIdentity(userId) : undefined
  ]);
  if (headline && identity && identifiesCandidate(headline, identity)) {
    throw new FieldValidationError('card.headline', () => matchingMessages.card.headlineIdentity);
  }
  const hidden = result.card.hiddenExperiences
    .filter((id) => experiences.has(id))
    .map((id) => new Types.ObjectId(id));
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
