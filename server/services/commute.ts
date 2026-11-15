import { BIKE_METERS_PER_MINUTE, COMMUTE_MODES, officeAddress, officeDaysPerWeek } from 'portfolio-common';
import type { CommuteMode, GeoPlace, JobPostingInput, PerfectJob, ScoreContext } from 'portfolio-common';
import { env } from '../env';
import { CommuteCache } from '../models/database';
import { geocode, streetRoute } from './geoplateforme';
import type { Point } from './geoplateforme';
import { logger } from './logger';
import { hashValue, takeRateLimit } from './rateLimit';
import type { RateLimit } from './rateLimit';
import { transitEnabled, transitMinutes, transitProvider } from './transit';
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

const DAY_MS = 24 * 60 * 60_000;
/** A job's address moves rarely; timetables and roads change slowly */
const PLACE_TTL_MS = 90 * DAY_MS;
const ROUTE_TTL_MS = 30 * DAY_MS;
/** How long a service that did not answer is left alone */
const FAILURE_TTL_MS = 10 * 60_000;

const commuteCalls = (): RateLimit => ({ limit: env.COMMUTE_DAILY_LIMIT, windowMs: DAY_MS });

/** What an owner's editor is told: whether travel times are computed, and by which modes */
export interface CommuteAvailability {
  enabled: boolean;
  modes: CommuteMode[];
  /** The service asked for public transport times, when `modes` has them: its name is shown */
  transit?: TransitProvider;
}

export const commuteAvailability = (): CommuteAvailability => {
  const enabled = env.commuteTimesEnabled;
  const transit = enabled ? transitProvider() : undefined;
  return {
    enabled,
    modes: enabled ? COMMUTE_MODES.filter((mode) => mode !== 'transit' || transitEnabled()) : [],
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
/** The caller may not ask anything new now (its own limit): nothing is asked, nothing is logged */
class NotAllowed extends Error {}

/** Called before a question goes out (never for an answer already kept): false keeps it in */
export type MayAsk = () => Promise<boolean>;

type Cached<T> = { found: T } | { none: true } | { failed: true };

/**
 * The answer to a question, from the cache or from `ask` (null: a definitive
 * no). Undefined when it is not known now: the service did not answer, or
 * the site asked enough for today
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

  const keep = (value: Cached<T>, ttl: number) =>
    CommuteCache.updateOne({ _id: id }, { $set: { value, expiresAt: new Date(Date.now() + ttl) } }, { upsert: true });
  try {
    if (mayAsk && !(await mayAsk())) throw new NotAllowed();
    if ((await takeRateLimit('commute-calls', commuteCalls())).retryAfterSeconds !== null) throw new OverDailyLimit();
    const answer = await ask();
    await keep(answer === null ? { none: true } : { found: answer }, ttlMs);
    return answer;
  } catch (error) {
    if (error instanceof NotAllowed) return undefined;
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
async function minutesByMode(modes: readonly CommuteMode[], from: Point, to: Point): Promise<number[] | undefined> {
  const wants = (mode: CommuteMode) => modes.includes(mode);
  // On foot: its time, the distance a bike ride is estimated from, and what public transport must beat
  const needsFoot = wants('walk') || wants('bike') || wants('transit');
  const [car, foot, transit] = await Promise.all([
    wants('car') ? answered('car', way(from, to), ROUTE_TTL_MS, () => streetRoute('car', from, to)) : null,
    needsFoot ? answered('foot', way(from, to), ROUTE_TTL_MS, () => streetRoute('pedestrian', from, to)) : null,
    wants('transit') ? answered('transit', way(from, to), ROUTE_TTL_MS, () => transitMinutes(from, to)) : null
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
 * What scoring the commute of `job` needs (portfolio-common's ScoreContext):
 * the travel time one way, that the job's address was not found, or nothing
 * when it is not known now (travel times are off, the owner's address has no
 * place yet, a service did not answer). A fully remote job has no commute:
 * nothing is asked
 */
export async function commuteContext(criterion: PerfectJob['commute'], location: JobLocation): Promise<ScoreContext> {
  if (!criterion?.place || officeDaysPerWeek(location) === 0) return {};
  const { enabled, modes: offered } = commuteAvailability();
  const modes = criterion.modes.filter((mode) => offered.includes(mode));
  if (!enabled || modes.length === 0) return {};
  const office = await locateOffice(officeAddress(location));
  if (office === undefined) return {};
  if (office === null) return { commute: { located: false } };
  const times = await minutesByMode(modes, rounded(criterion.place), rounded(office.place));
  return times ? { commute: { minutes: Math.min(...times) } } : {};
}
