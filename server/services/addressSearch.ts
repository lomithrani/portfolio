import { addressSearchText, canSearchAddress } from 'portfolio-common';
import type { AddressSuggestion, OfficePlace } from 'portfolio-common';
import { env } from '../env';
import { ServiceUnavailableError, TooManyRequestsError } from '../errors';
import { locateOffice } from './commute';
import type { OfficeAddress } from './commute';
import { suggestAddresses } from './geoplateforme';
import { logger } from './logger';
import { consumeRateLimit, rateLimitKey, takeRateLimit } from './rateLimit';
import type { RateLimit } from './rateLimit';
import { m } from './addressSearch.messages';
import { m as limits } from './rateLimit.messages';

// The address search of the forms that take an address (plugins/addresses.ts):
// the commute's address of a perfect job, the office of a job posting. What
// is typed is answered with the addresses the Géoplateforme knows
// (services/geoplateforme.ts), so the address kept is one travel times can
// be computed from; and a posting's office is looked up as scoring will
// (services/commute.ts), so its recruiter sees what was found.
//
// On only where travel times are (COMMUTE_TIMES=true): nothing is sent to the
// map service otherwise. What is typed is an address, maybe someone's home:
// it is never logged and never kept, and it travels in request bodies, which
// traces drop (instrumentation.ts), never in a URL. The browser never calls
// the map service itself: it learns nothing about who types. The counters
// are keyed by a hash of the account (rateLimitKey), like every other one.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Searches per account: a form asks once per pause in typing (300 ms), an
 * address takes a dozen
 */
export const ADDRESS_SEARCHES_PER_USER: RateLimit = { limit: 60, windowMs: MINUTE_MS };
/**
 * Searches per account per UTC day: some forty addresses, far over what a
 * person types, so that one account cannot use up the site's day
 */
export const ADDRESS_SEARCHES_PER_USER_PER_DAY: RateLimit = { limit: 500, windowMs: DAY_MS };
/**
 * Searches per UTC day for the whole site. They are not counted against
 * COMMUTE_DAILY_LIMIT, which a few people typing would use up: that one keeps
 * the routes and the lookups of scoring. A search is one request to the map
 * service, up to three when the postal code and the town given find nothing
 * (services/geoplateforme.ts suggestAddresses): far under what it takes (50
 * searches a second for one IP)
 */
export const ADDRESS_SEARCHES_PER_DAY: RateLimit = { limit: 10_000, windowMs: DAY_MS };
/**
 * Lookups of offices one account has the map service make per UTC day (an
 * office already found is not counted; a street not found takes a second
 * lookup, for its town): each is a request counted against
 * COMMUTE_DAILY_LIMIT, which one account must not use up
 */
export const OFFICE_LOOKUPS_PER_USER: RateLimit = { limit: 40, windowMs: DAY_MS };

const waitText = (seconds: number) =>
  seconds > 3600 ? limits.wait.hours(Math.ceil(seconds / 3600)) : limits.wait.minutes(Math.max(1, Math.ceil(seconds / 60)));

const tooManySearches = (retryAfter: number) =>
  new TooManyRequestsError(() => m.tooManySearches(waitText(retryAfter)), retryAfter);

/** POST /addresses/search */
export interface AddressSearchResult {
  /** Whether this server looks addresses up at all (COMMUTE_TIMES=true) */
  enabled: boolean;
  suggestions: AddressSuggestion[];
}

export interface AddressSearchQuery {
  q: string;
  postalCode?: string;
  city?: string;
}

/**
 * The addresses that what `userId` typed could be. None for a text too short
 * to look up; 429 over the account's searches a minute or a day, 503 when the
 * map service does not answer or the site searched enough for today
 */
export async function searchAddresses(userId: string, query: AddressSearchQuery): Promise<AddressSearchResult> {
  if (!env.commuteTimesEnabled) return { enabled: false, suggestions: [] };
  const text = addressSearchText(query.q);
  if (!canSearchAddress(text)) return { enabled: true, suggestions: [] };
  // A search refused by the minute's limit is not counted against the day's
  const retryAfter =
    (await consumeRateLimit(rateLimitKey('address-search:user', userId), ADDRESS_SEARCHES_PER_USER)) ??
    (await consumeRateLimit(rateLimitKey('address-search:user-day', userId), ADDRESS_SEARCHES_PER_USER_PER_DAY));
  if (retryAfter !== null) throw tooManySearches(retryAfter);
  if ((await takeRateLimit('address-search', ADDRESS_SEARCHES_PER_DAY)).retryAfterSeconds !== null) {
    logger.warn('Address search: no answer', { reason: 'daily limit' });
    throw new ServiceUnavailableError(() => m.searchUnavailable);
  }
  try {
    const city = query.city ? addressSearchText(query.city) : undefined;
    return { enabled: true, suggestions: await suggestAddresses({ text, postalCode: query.postalCode, city }) };
  } catch (error) {
    // Never what was typed: it is an address
    logger.warn('Address search: no answer', { reason: error instanceof Error ? error.name : 'unknown' });
    throw new ServiceUnavailableError(() => m.searchUnavailable);
  }
}

/** POST /addresses/office */
export interface OfficePlaceResult extends OfficePlace {
  /** Whether this server looks addresses up at all (COMMUTE_TIMES=true) */
  enabled: boolean;
}

/**
 * Where travel times to an office at `location` are counted from: what
 * scoring a posting with it will find. 429 when it is not known yet and the
 * account had enough offices looked up for today
 */
export async function officePlace(
  userId: string,
  location: OfficeAddress
): Promise<OfficePlaceResult> {
  if (!env.commuteTimesEnabled) return { enabled: false, found: 'unknown' };
  const clean = (value: string | undefined) => (value ? addressSearchText(value) : '') || undefined;
  const asked = { address: clean(location.address), postalCode: clean(location.postalCode), city: clean(location.city) };
  if (!asked.address && !asked.city) return { enabled: true, found: 'none' };
  let refused: number | null = null;
  const office = await locateOffice(asked, async () => {
    refused = await consumeRateLimit(rateLimitKey('office-lookup:user', userId), OFFICE_LOOKUPS_PER_USER);
    return refused === null;
  });
  if (refused !== null) throw tooManySearches(refused);
  if (office === undefined) return { enabled: true, found: 'unknown' };
  if (office === null) return { enabled: true, found: 'none' };
  return { enabled: true, found: office.level, label: office.place.label };
}
