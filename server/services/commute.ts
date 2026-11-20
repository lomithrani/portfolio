import { setTimeout as sleep } from 'node:timers/promises';
import { Types } from 'mongoose';
import {
  BIKE_METERS_PER_MINUTE,
  COMMUTE_MODES,
  commuteMinutesPerWeek,
  discoveryConsentCutoff,
  officeAddress,
  officeDaysPerWeek,
  storedPerfectJob
} from 'portfolio-common';
import type { CommuteMode, GeoPlace, JobPostingInput, PerfectJob, ScoreContext } from 'portfolio-common';
import { env } from '../env';
import { CommuteCache, DiscoveryProfile, PerfectJob as StoredPerfectJob } from '../models/database';
import { geocode, streetRoute } from './geoplateforme';
import type { Point } from './geoplateforme';
import { logger } from './logger';
import { hashValue, peekRateLimit, rateLimitKey, refundRateLimit, takeRateLimit } from './rateLimit';
import type { RateLimit } from './rateLimit';
import { transitMinutes, transitProvider } from './transit';
import type { TransitProvider } from './transit';

// Travel times for the commute criterion of the perfect job
// (portfolio-common's perfectJob.ts): from the address an owner gave to the
// address of a job posting, one way, by the fastest of the modes the owner
// accepts. Off unless COMMUTE_TIMES=true: nothing is then sent anywhere, and
// the criterion does not count.
//
// Who is asked what: the Géoplateforme (services/geoplateforme.ts) finds the
// addresses, and gives the way by car and on foot; the time by bike is an
// estimate from the distance on foot; the service COMMUTE_TRANSIT names
// (services/transit.ts: HERE or Transitous) gives the journey by public
// transport. They receive an address or two points, and nothing about who
// asks.
//
// Every answer is kept (CommuteCache) and every call counted against one
// daily cap for the site (COMMUTE_DAILY_LIMIT): a job is scored at each read
// of a journey, its travel time is asked for once. A service that does not
// answer is not asked again for a few minutes. An owner's address is private:
// it is never logged, its place is stored with their perfect job only, and
// the ways from it are kept under a key that does not show it.
//
// Two ways to read a travel time. A journey's job match step asks what is
// not kept yet and waits for it (commuteContext): one pair at a time, in a
// request that can wait. Matching (Path 2) scores many pairs in one read, a
// GET that Bun cuts after 30 s without data, where a pair never asked can
// take 20: it reads only what is kept (cachedCommuteContext, which also says
// whether what is missing can still be found), and has what is missing
// asked in the background (warmCommute, warmOffice), one pair at a time,
// within a daily allowance for the account whose read wanted it and at most
// half of the site's day (MATCHING_COMMUTE_SHARE), so that a feed makes no
// outside call, one account cannot hold up the others, and journeys always
// keep travel times. A warm-up reads the candidate's address when it runs,
// and only while their consent to matching is in force. Matching never asks
// Transitous, nor reads what it answered: its usage policy is for
// non-commercial projects (docs/DEPLOYMENT.md).

const DAY_MS = 24 * 60 * 60_000;
/** A job's address moves rarely; timetables and roads change slowly */
const PLACE_TTL_MS = 90 * DAY_MS;
const ROUTE_TTL_MS = 30 * DAY_MS;
/** How long a service that did not answer is left alone */
const FAILURE_TTL_MS = 10 * 60_000;

const commuteCalls = (): RateLimit => ({ limit: env.COMMUTE_DAILY_LIMIT, windowMs: DAY_MS });

/**
 * What a travel time is read for: the job match step of a journey (Path 1), or matching (Path 2),
 * which never uses Transitous
 */
export type CommuteUse = 'journey' | 'matching';

/** What an owner's editor is told: whether travel times are computed, and by which modes */
export interface CommuteAvailability {
  enabled: boolean;
  modes: CommuteMode[];
  /** The service asked for public transport times, when `modes` has them: its name is shown */
  transit?: TransitProvider;
}

/**
 * Whether travel times are computed, by which modes, and which service gives public transport
 * times. For matching, public transport only from a service whose terms allow it: never
 * Transitous, whose usage policy is for non-commercial projects
 */
export const commuteAvailability = (use: CommuteUse = 'journey'): CommuteAvailability => {
  const enabled = env.commuteTimesEnabled;
  const provider = enabled ? transitProvider() : undefined;
  const transit = use === 'matching' && provider === 'transitous' ? undefined : provider;
  return {
    enabled,
    modes: enabled ? COMMUTE_MODES.filter((mode) => mode !== 'transit' || transit !== undefined) : [],
    ...(transit ? { transit } : {})
  };
};

/** For the startup log line: whether travel times are computed, by which modes, and the daily cap */
export const describeCommute = (): string => {
  const { enabled, modes } = commuteAvailability();
  const transit = transitProvider();
  return enabled
    ? `on (${modes.join(', ')}; ${transit ? `public transport from ${transit}; ` : ''}${env.COMMUTE_DAILY_LIMIT} requests a day)`
    : 'off (COMMUTE_TIMES is not true)';
};

// ── Asking once ─────────────────────────────────────────────

class OverDailyLimit extends Error {}

/**
 * Called before a question goes out (never for an answer already kept): false keeps it in, and so
 * does a MayAsk that throws (the caller's own limit could not be read)
 */
export type MayAsk = () => Promise<boolean>;

/** Keeps every question in: what is not kept is not known now */
const nothingNew: MayAsk = async () => false;

type Cached<T> = { found: T } | { none: true } | { failed: true };

/**
 * The answer to a question, from the cache or from `ask` (null: a definitive
 * no). Undefined when it is not known now: the service did not answer (a
 * few minutes ago included), the site asked enough for today, or `mayAsk`
 * kept the question in
 */
async function answered<T>(
  kind: string,
  question: string,
  ttlMs: number,
  ask: () => Promise<T | null>,
  mayAsk?: MayAsk
): Promise<T | null | undefined> {
  const id = `${kind}:${hashValue(question)}`;
  const cached = (await CommuteCache.findById(id).lean())?.value as Cached<T> | undefined;
  if (cached && 'found' in cached) return cached.found;
  if (cached && 'none' in cached) return null;
  if (cached && 'failed' in cached) return undefined;

  // The caller's own limit, not the service: nothing is asked, logged or remembered as failed (a
  // limit that could not be read keeps the question in, and leaves the answer to the next read)
  if (mayAsk && !(await mayAsk().catch(() => false))) return undefined;
  const keep = (value: Cached<T>, ttl: number) =>
    CommuteCache.updateOne({ _id: id }, { $set: { value, expiresAt: new Date(Date.now() + ttl) } }, { upsert: true });
  try {
    if ((await takeRateLimit('commute-calls', commuteCalls())).retryAfterSeconds !== null) throw new OverDailyLimit();
    const answer = await ask();
    await keep(answer === null ? { none: true } : { found: answer }, ttlMs);
    return answer;
  } catch (error) {
    // Never the question: it holds an address or the place of someone's home
    logger.warn('Travel times: no answer', {
      kind,
      reason: error instanceof OverDailyLimit ? 'daily limit' : error instanceof Error ? error.name : 'unknown',
      detail: error instanceof Error && error.name === 'GeoServiceError' ? error.message : undefined
    });
    if (!(error instanceof OverDailyLimit)) await keep({ failed: true }, FAILURE_TTL_MS).catch(() => {});
    return undefined;
  }
}

// ── Places ──────────────────────────────────────────────────

/**
 * Where the address an owner travels from is, looked up when they save it.
 * Not kept in the cache (it is stored with their perfect job): null when no
 * such place is found, undefined when the lookup did not answer
 */
export async function locateOwnerAddress(address: string): Promise<GeoPlace | null | undefined> {
  try {
    if ((await takeRateLimit('commute-calls', commuteCalls())).retryAfterSeconds !== null) return undefined;
    return await geocode({ text: address });
  } catch (error) {
    logger.warn('Travel times: no answer', { kind: 'owner-place', reason: error instanceof Error ? error.name : 'unknown' });
    return undefined;
  }
}

type JobLocation = JobPostingInput['location'];

/** Where an office is, as its posting says it (portfolio-common's officeAddress) */
export type OfficeAddress = ReturnType<typeof officeAddress>;

/** Where an office was found, and whether that is its street or only its town */
export interface LocatedOffice {
  place: GeoPlace;
  level: 'street' | 'town';
}

/**
 * Where a posting's office is: its street when it gives one that is found,
 * its town otherwise. Null when neither is found, undefined when it is not
 * known now. Kept in the cache: asked at each read of a journey, and by the
 * job editor (services/addressSearch.ts, which gives `mayAsk`: its own limit
 * on what one account has looked up), it is looked up once
 */
export const locateOffice = async (
  { address, postalCode, city }: OfficeAddress,
  mayAsk?: MayAsk
): Promise<LocatedOffice | null | undefined> => {
  const lookedUp = (text: string, townOnly: boolean) =>
    answered(
      'place',
      `${townOnly ? 'town' : 'street'}|${text.toLowerCase()}`,
      PLACE_TTL_MS,
      () => geocode({ text, postalCode, townOnly }),
      mayAsk
    );
  if (address) {
    const street = await lookedUp([address, postalCode, city].filter(Boolean).join(' '), false);
    if (street) return { place: street, level: 'street' };
    // Not known now; a street that is not found leaves the town
    if (street === undefined || !city) return street;
  }
  if (!city) return null;
  const town = await lookedUp([postalCode, city].filter(Boolean).join(' '), true);
  return town ? { place: town, level: 'town' } : town;
};

// ── Ways ────────────────────────────────────────────────────

/** A point as it is asked for and kept: about 10 metres */
const rounded = ({ lat, lon }: Point): Point => ({ lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) });
const way = (from: Point, to: Point) => `${from.lat},${from.lon}>${to.lat},${to.lon}`;

/**
 * The time of the way by each of `modes`, in minutes: Infinity for a mode
 * that does not lead there. Undefined when one of them is not known now
 */
async function minutesByMode(
  modes: readonly CommuteMode[],
  from: Point,
  to: Point,
  mayAsk?: MayAsk
): Promise<number[] | undefined> {
  const wants = (mode: CommuteMode) => modes.includes(mode);
  // On foot: its time, the distance a bike ride is estimated from, and what public transport must beat
  const needsFoot = wants('walk') || wants('bike') || wants('transit');
  const [car, foot, transit] = await Promise.all([
    wants('car') ? answered('car', way(from, to), ROUTE_TTL_MS, () => streetRoute('car', from, to), mayAsk) : null,
    needsFoot
      ? answered('foot', way(from, to), ROUTE_TTL_MS, () => streetRoute('pedestrian', from, to), mayAsk)
      : null,
    // Each service reads only its own answers: a site that changes COMMUTE_TRANSIT asks again
    wants('transit')
      ? answered('transit', `${transitProvider()}|${way(from, to)}`, ROUTE_TTL_MS, () => transitMinutes(from, to), mayAsk)
      : null
  ]);
  if (car === undefined || foot === undefined || transit === undefined) return undefined;
  const none = Number.POSITIVE_INFINITY;
  const times: number[] = [];
  if (wants('car')) times.push(car?.minutes ?? none);
  if (wants('walk')) times.push(foot?.minutes ?? none);
  if (wants('bike')) times.push(foot ? foot.meters / BIKE_METERS_PER_MINUTE : none);
  // Door to door: walking all the way when that is quicker than any journey
  if (wants('transit')) times.push(Math.min(transit ?? none, foot?.minutes ?? none));
  return times;
}

/**
 * The modes the commute from the owner's address to the office at `location` is computed by:
 * those the owner accepts that the site offers for `use` (for matching, never Transitous' public
 * transport). None when no travel time is computed: the owner's address has no place, the job is
 * fully remote (nowhere to go, which always matches), travel times are off, or no mode is left.
 * What that means for a read of matching is cachedCommuteContext's `state`: a pair that loses a
 * mode to matching is `unknowable`, not `none`
 */
export const commuteModes = (criterion: PerfectJob['commute'], location: JobLocation, use: CommuteUse): CommuteMode[] => {
  if (!criterion?.place || officeDaysPerWeek(location) === 0) return [];
  const { enabled, modes: offered } = commuteAvailability(use);
  return enabled ? criterion.modes.filter((mode) => offered.includes(mode)) : [];
};

/**
 * The modes the owner accepts that a journey computes and matching does not (public transport
 * from Transitous): none for a journey, for a job fully remote or an address without a place
 */
const modesLostToMatching = (criterion: PerfectJob['commute'], location: JobLocation, use: CommuteUse): CommuteMode[] => {
  if (use === 'journey' || !criterion?.place || officeDaysPerWeek(location) === 0) return [];
  const forJourneys = commuteAvailability('journey').modes;
  const forMatching = commuteAvailability('matching').modes;
  return criterion.modes.filter((mode) => forJourneys.includes(mode) && !forMatching.includes(mode));
};

/**
 * What a read knows of the commute of one pair:
 * - `known`: its travel time, or that the office is not found on a map (`context.commute`);
 * - `none`: no travel time is computed for it (commuteModes is empty: no place, fully remote,
 *   travel times off, no mode the owner accepts that the site offers at all): the commute does
 *   not count, which no warm-up changes;
 * - `missing`: something is not kept yet: warmCommute can ask for it, while the day's allowances
 *   last (commuteWarmUpPossible);
 * - `failed`: a service did not answer a few minutes ago (or, for a read that asks, the site asked
 *   enough for today): a later warm-up can find it;
 * - `unknowable` (matching only): the owner accepts public transport, which the site asks
 *   Transitous for and matching never does, and the time by the other modes they accept does not
 *   show that the commute matches (or there are none). No warm-up changes it: a feed treats it as
 *   unknown (a deal-breaker commute holds the pair back), never as not counted.
 */
export type CommuteState = 'known' | 'none' | 'missing' | 'failed' | 'unknowable';

/** A commute as a read found it */
export interface CommuteReading {
  /** What scorePerfectJob takes: `commute` only when `state` is `known` */
  context: ScoreContext;
  state: CommuteState;
}

/** The commute of one pair, asking what is not kept when `mayAsk` lets it (always, without one) */
async function readCommute(
  criterion: PerfectJob['commute'],
  location: JobLocation,
  use: CommuteUse,
  mayAsk?: MayAsk
): Promise<CommuteReading> {
  const notKnown = (state: CommuteState): CommuteReading => ({ context: {}, state });
  const modes = commuteModes(criterion, location, use);
  // Without them, a time is the most the way can take: it tells only that the commute matches
  const lost = modesLostToMatching(criterion, location, use);
  if (!criterion?.place || (modes.length === 0 && lost.length === 0)) return notKnown('none');
  if (modes.length === 0) return notKnown('unknowable');
  const place = criterion.place;

  let keptIn = false;
  const asking: MayAsk | undefined =
    mayAsk &&
    (async () => {
      let allowed = false;
      try {
        allowed = await mayAsk();
        return allowed;
      } finally {
        keptIn ||= !allowed;
      }
    });
  const office = await locateOffice(officeAddress(location), asking);
  if (office === undefined) return notKnown(keptIn ? 'missing' : 'failed');
  if (office === null) return { context: { commute: { located: false } }, state: 'known' };
  const times = await minutesByMode(modes, rounded(place), rounded(office.place), asking);
  if (!times) return notKnown(keptIn ? 'missing' : 'failed');
  const minutes = Math.min(...times);
  if (lost.length > 0 && commuteMinutesPerWeek(minutes, location) > criterion.maxMinutesPerWeek) return notKnown('unknowable');
  return { context: { commute: { minutes } }, state: 'known' };
}

/** How a read may get what is not kept yet */
export interface CommuteAsking {
  /**
   * Called before each question that would go out (never for one already answered, or failed
   * a few minutes ago): false keeps it in, and the read does without it. Without it, every
   * question goes, within COMMUTE_DAILY_LIMIT
   */
  mayAsk?: MayAsk;
  /** Default `journey` */
  use?: CommuteUse;
}

/**
 * What scoring the commute of `job` needs (portfolio-common's ScoreContext):
 * the travel time one way, that the job's address was not found, or nothing
 * when it is not known now (travel times are off, the owner's address has no
 * place yet, a service did not answer, `mayAsk` kept a question in, or, for
 * matching, a mode the owner accepts is not computed and the others do not
 * show that it matches). A fully remote job has no commute: nothing is asked.
 * Waits for what it asks: for one pair, in a request that can wait (the job
 * match step of a journey)
 */
export async function commuteContext(
  criterion: PerfectJob['commute'],
  location: JobLocation,
  { mayAsk, use = 'journey' }: CommuteAsking = {}
): Promise<ScoreContext> {
  return (await readCommute(criterion, location, use, mayAsk)).context;
}

/**
 * The commute of one pair from what is kept only: no outside call, no wait, nothing counted or
 * written, and what that leaves (CommuteState): for a read that scores many pairs (the feeds of
 * matching). A pair `missing` (or `failed`) can be found by warmCommute; `none` and `unknowable`
 * cannot
 */
export const cachedCommuteContext = (
  criterion: PerfectJob['commute'],
  location: JobLocation,
  use: CommuteUse
): Promise<CommuteReading> => readCommute(criterion, location, use, nothingNew);

// ── Warming up (matching) ───────────────────────────────────

/**
 * Questions the reads of one account may have asked in the background per UTC day (a place, a
 * way by car, on foot or by public transport not kept yet: one each), within matching's share of
 * COMMUTE_DAILY_LIMIT
 */
export const DISCOVERY_COMMUTE_CALLS: RateLimit = { limit: 100, windowMs: DAY_MS };

/** The counter of what `accountId`'s reads had asked in the background (keyed by a hash of it) */
export const discoveryCommuteKey = (accountId: string) => rateLimitKey('discovery-commute', accountId);

/**
 * The share of COMMUTE_DAILY_LIMIT the warm-ups of matching may use, all accounts together
 * (rounded down): the rest is kept for the job match steps of journeys (Path 1), whose commute,
 * a deal-breaker included, would otherwise not count until the next UTC day
 */
export const MATCHING_COMMUTE_SHARE = 0.5;

/** The site's counter of what warm-ups asked */
const MATCHING_COMMUTE_KEY = 'discovery-commute-site';

const matchingCommuteCalls = (): RateLimit => ({
  limit: Math.floor(env.COMMUTE_DAILY_LIMIT * MATCHING_COMMUTE_SHARE),
  windowMs: DAY_MS
});

/**
 * Whether a warm-up wanted now by `accountId`'s read could ask anything today: travel times are
 * computed, and neither the account's DISCOVERY_COMMUTE_CALLS, nor matching's share of the day,
 * nor COMMUTE_DAILY_LIMIT is used up. Reads three counters, writes nothing: once per read of a
 * feed, which stops waiting for its `missing` pairs (and shows them as unknown) when it is false
 */
export async function commuteWarmUpPossible(accountId: string): Promise<boolean> {
  if (!env.commuteTimesEnabled) return false;
  const share = matchingCommuteCalls();
  const [own, matching, site] = await Promise.all([
    peekRateLimit(discoveryCommuteKey(accountId), DISCOVERY_COMMUTE_CALLS),
    peekRateLimit(MATCHING_COMMUTE_KEY, share),
    peekRateLimit('commute-calls', commuteCalls())
  ]);
  return own.count < DISCOVERY_COMMUTE_CALLS.limit && matching.count < share.limit && site.count < env.COMMUTE_DAILY_LIMIT;
}

/**
 * How warm-ups are paced: one at a time, in the order asked, and a pause after one that asked a
 * service (the Géoplateforme takes 5 route requests a second from one address, and a pair asks
 * up to two at once); at most `queue` waiting, `perAccount` of them for one account, a warm-up
 * beyond is dropped (a later read asks for it again), and a line says so `dropLogMs` at most.
 * Changed by the tests only
 */
export const commuteWarmUps = { pauseMs: 400, queue: 100, perAccount: 20, dropLogMs: 60_000 };

type DropReason = 'queue full' | 'account share';

/** The warm-ups waiting (or running), by a hash of what they ask: one per question */
const waitingWarmUps = new Map<string, Promise<void>>();
/** How many of them each account's reads wanted */
const waitingByAccount = new Map<string, number>();
let lastWarmUp: Promise<void> = Promise.resolve();
/** The warm-ups dropped since the last line said so, and when it did, by reason */
const droppedWarmUps = new Map<DropReason, { count: number; loggedAt: number }>();

/** For the tests: forgets the warm-ups dropped and not yet logged */
export const forgetDroppedWarmUps = () => droppedWarmUps.clear();

const dropWarmUp = (reason: DropReason): Promise<void> => {
  const dropped = droppedWarmUps.get(reason) ?? { count: 0, loggedAt: Number.NEGATIVE_INFINITY };
  dropped.count++;
  const now = Date.now();
  if (now - dropped.loggedAt >= commuteWarmUps.dropLogMs) {
    logger.warn('Travel times: warm-up dropped', { reason, dropped: dropped.count });
    dropped.count = 0;
    dropped.loggedAt = now;
  }
  droppedWarmUps.set(reason, dropped);
  return Promise.resolve();
};

/**
 * Runs `warm` once the warm-ups before it are done, with a MayAsk that counts each question
 * against matching's share of the site's day and `accountId`'s DISCOVERY_COMMUTE_CALLS. A warm-up
 * already waiting under `key` is that one: it takes no other place. Resolves once it ran, or was
 * dropped; never rejects. Nothing it holds is logged, nor its key (it may stand for an owner's
 * place)
 */
const warmUp = (key: string, accountId: string, warm: (mayAsk: MayAsk) => Promise<unknown>): Promise<void> => {
  const waiting = waitingWarmUps.get(key);
  if (waiting) return waiting;
  if (waitingWarmUps.size >= commuteWarmUps.queue) return dropWarmUp('queue full');
  const own = waitingByAccount.get(accountId) ?? 0;
  if (own >= commuteWarmUps.perAccount) return dropWarmUp('account share');
  waitingByAccount.set(accountId, own + 1);
  const release = () => {
    waitingWarmUps.delete(key);
    const left = (waitingByAccount.get(accountId) ?? 1) - 1;
    if (left > 0) waitingByAccount.set(accountId, left);
    else waitingByAccount.delete(accountId);
  };

  const task = async () => {
    let asked = false;
    let refused = false;
    let failure: string | undefined;
    const mayAsk: MayAsk = async () => {
      if (refused) return false;
      try {
        const share = await takeRateLimit(MATCHING_COMMUTE_KEY, matchingCommuteCalls());
        if (share.retryAfterSeconds === null) {
          const allowance = await takeRateLimit(discoveryCommuteKey(accountId), DISCOVERY_COMMUTE_CALLS);
          if (allowance.retryAfterSeconds === null) return (asked = true);
          // The account's day is over: the site's share was not used
          await refundRateLimit(share.counterId);
        }
      } catch (error) {
        failure ??= error instanceof Error ? error.name : 'unknown';
      }
      // Nothing more for this warm-up
      refused = true;
      return false;
    };
    try {
      try {
        await warm(mayAsk);
      } catch (error) {
        failure ??= error instanceof Error ? error.name : 'unknown';
      } finally {
        release();
      }
      if (failure) logger.warn('Travel times: warm-up failed', { reason: failure });
      if (asked && commuteWarmUps.pauseMs > 0) await sleep(commuteWarmUps.pauseMs);
    } catch {
      // A line that could not be logged: the next warm-up goes on
    }
  };
  // Never broken: a warm-up runs after the one before it however that one ended
  const run = lastWarmUp.then(task, task);
  lastWarmUp = run;
  waitingWarmUps.set(key, run);
  return run;
};

/** An office as a warm-up is known by (lowercase, like the lookup) */
const officeKey = (location: JobLocation) => {
  const { address, postalCode, city } = officeAddress(location);
  return [address, postalCode, city].map((part) => part ?? '').join('|').toLowerCase();
};

/**
 * The commute criterion of `candidateId` as it is now, while their consent to matching is in force
 * (DiscoveryProfile.enabledAt, not lapsed); undefined once they withdrew it, let it lapse, deleted
 * their account or took the commute out of their perfect job. Read when a warm-up runs, never
 * before: what it asks is from where they are now, and only while they agree
 */
async function consentedCommute(candidateId: string): Promise<PerfectJob['commute']> {
  if (!Types.ObjectId.isValid(candidateId)) return undefined;
  const [consented, stored] = await Promise.all([
    DiscoveryProfile.exists({ user: candidateId, enabledAt: { $gt: discoveryConsentCutoff() } }),
    StoredPerfectJob.findOne({ user: candidateId }, { 'criteria.commute': 1 }).lean<{ criteria?: unknown }>()
  ]);
  return consented ? storedPerfectJob(stored?.criteria).commute : undefined;
}

/** A pair matching scores: a candidate who opted in, and the office of a job */
export interface CommutePair {
  candidateId: string;
  location: JobLocation;
}

/**
 * Has what the commute of one pair needs and is not kept asked in the background, for matching
 * (never Transitous), within matching's share of the day, `accountId`'s DISCOVERY_COMMUTE_CALLS
 * (the account whose read wanted it), COMMUTE_DAILY_LIMIT and the failure memo: what is kept is
 * read, never asked again. The candidate's address is read when the warm-up runs, and nothing is
 * asked once their consent to matching is no longer in force. Fire and forget
 * (`void warmCommute(...)`): the promise resolves once it ran, for the tests, and never rejects
 */
export const warmCommute = ({ candidateId, location }: CommutePair, accountId: string): Promise<void> =>
  !env.commuteTimesEnabled || officeDaysPerWeek(location) === 0
    ? Promise.resolve()
    : warmUp(hashValue(`commute|${candidateId}|${officeKey(location)}`), accountId, async (mayAsk) => {
        const criterion = await consentedCommute(candidateId);
        if (commuteModes(criterion, location, 'matching').length > 0) await readCommute(criterion, location, 'matching', mayAsk);
      });

/**
 * Has the office at `location` looked up in the background, as warmCommute does: when matching
 * is turned on for a job, so that its office is found once (kept 90 days) and each candidate
 * then needs only the ways. Nothing for a fully remote job, or while travel times are off
 */
export const warmOffice = (location: JobLocation, accountId: string): Promise<void> =>
  !env.commuteTimesEnabled || officeDaysPerWeek(location) === 0
    ? Promise.resolve()
    : warmUp(hashValue(`office|${officeKey(location)}`), accountId, (mayAsk) => locateOffice(officeAddress(location), mayAsk));
