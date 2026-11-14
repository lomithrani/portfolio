import { RESERVED_DOMAIN_NAMES, isValidDomainName, normalizeDomainName } from 'portfolio-common';
import { Domain } from '../models/database';
import { TooManyRequestsError } from '../errors';
import { rateLimitAddress } from './clientAddress';
import { consumeRateLimit, rateLimitKey } from './rateLimit';
import type { RateLimit } from './rateLimit';

// GET /domain/:name/availability: whether a portfolio name can still be
// claimed, for the live hint of the claim forms. Advisory only: POST
// /domain/claim stays the authority (a name taken in between is a 409 there).

/** Why a name cannot be claimed: not a valid name, a reserved route name, or someone's portfolio */
export type DomainUnavailableReason = 'invalid' | 'reserved' | 'taken';

export interface DomainAvailability {
  /** The name as it would be claimed (trimmed, lower case) */
  name: string;
  available: boolean;
  reason?: DomainUnavailableReason;
}

/**
 * Lookups per IP address (IPv6: per /64), whatever their outcome. A claim
 * form asks once per pause in typing (~350 ms debounce): generous for people,
 * a cap on enumerating the names in use
 */
export const DOMAIN_AVAILABILITY_REQUESTS_PER_IP: RateLimit = { limit: 600, windowMs: 60 * 60_000 };

/** The availability of `rawName`: one indexed existence check, never the domain or its owner */
export async function domainAvailability(rawName: string): Promise<DomainAvailability> {
  const name = normalizeDomainName(rawName);
  if (RESERVED_DOMAIN_NAMES.has(name)) return { name, available: false, reason: 'reserved' };
  if (!isValidDomainName(name)) return { name, available: false, reason: 'invalid' };
  if (await Domain.exists({ name })) return { name, available: false, reason: 'taken' };
  return { name, available: true };
}

const waitText = (seconds: number) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

/** Counts an availability lookup from an IP; throws TooManyRequestsError (429) over the limit */
export async function limitDomainAvailabilityRequestsFromIp(ip: string | null) {
  // Unknown without a server or proxy header (tests)
  if (!ip) return;
  const key = rateLimitKey('domain-availability:ip', rateLimitAddress(ip));
  const retryAfter = await consumeRateLimit(key, DOMAIN_AVAILABILITY_REQUESTS_PER_IP);
  if (retryAfter !== null) {
    throw new TooManyRequestsError(
      `Too many requests from your network. Try again in ${waitText(retryAfter)}`,
      retryAfter
    );
  }
}
