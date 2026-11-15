import { ADDRESS_KINDS, ADDRESS_SEARCH } from 'portfolio-common';
import type { AddressKind, AddressSuggestion, GeoPlace } from 'portfolio-common';

// The public geocoding and route services of the Géoplateforme (IGN, the
// French mapping agency): https://data.geopf.fr. No key; France only, like
// the job postings. Geocoding finds an address, or the addresses that what
// was typed so far could be; the route service gives the time and the
// distance of a way by car or on foot (it has no bike profile and no public
// transport). Called by services/commute.ts, which counts and caches the
// calls, and by services/addressSearch.ts, which counts its own.
//
// Every function answers `null` for a definitive "no" (no such address, no
// way between the two points) and throws when the service gave no usable
// answer (down, too slow, an error status): the caller tells them apart.

const GEOCODING = 'https://data.geopf.fr/geocodage/search';
const ROUTES = 'https://data.geopf.fr/navigation/itineraire';

export const geoplateformeTimeouts = { geocodingMs: 6_000, routeMs: 10_000 };

/**
 * Under this, what the geocoder found is not the place asked for: it always answers with its
 * nearest guess (an unknown "Zzyzx-les-Bains" is "Aix-les-Bains" at 0.55, "Lyon area" is Lyon at
 * 0.36), where an address it knows scores over 0.9
 */
const MIN_GEOCODING_SCORE = 0.6;

const headers = { accept: 'application/json', 'user-agent': 'portfolio-commute' };

/** A service gave no usable answer. Its message is logged: a status or a reason, never the question */
export class GeoServiceError extends Error {
  override name = 'GeoServiceError';
}

const getJson = async (url: URL, timeoutMs: number): Promise<{ status: number; body: unknown }> => {
  // A redirect is never followed: the question (an address, two points) goes nowhere else
  const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export interface GeocodingQuery {
  /** The address, or the name of a town */
  text: string;
  /** Narrows the search to a postal code (5 digits) */
  postalCode?: string;
  /** Only towns are looked for: for a posting that names a city and no street */
  townOnly?: boolean;
}

/** An address as the geocoder answered it: where it is, and how well it matches the question */
interface FoundAddress extends AddressSuggestion {
  lat: number;
  lon: number;
  /** 0 to 1: an address it knows scores over 0.9, its nearest guess for one it does not, under 0.6 */
  score: number;
}

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/** A feature of the geocoder's answer; undefined for one without a position, a score or a name */
const foundAddress = (feature: unknown): FoundAddress | undefined => {
  if (!isObject(feature) || !isObject(feature.geometry) || !isObject(feature.properties)) return undefined;
  const [lon, lat] = Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates : [];
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const { label, score, type, name, postcode, city } = feature.properties;
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined;
  const kind = ADDRESS_KINDS.find((known) => known === type) as AddressKind | undefined;
  const street = kind === 'municipality' ? undefined : text(name, 200);
  const postalCode = typeof postcode === 'string' && /^\d{5}$/.test(postcode) ? postcode : undefined;
  return {
    label: text(label, 300) ?? '',
    // What the geocoder does not name (it has other indexes than addresses) is a place like a street
    kind: kind ?? 'street',
    ...(street ? { street } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(text(city, 200) ? { city: text(city, 200) } : {}),
    lat,
    lon,
    score
  };
};

interface SearchQuery extends GeocodingQuery {
  /** Narrows the search to the towns of this name */
  city?: string;
  limit: number;
}

/**
 * What the geocoder answers `query` with, its best match first. Null when it
 * refuses the question (400): a text it cannot read (too short, no letter),
 * or a `city` that is no commune's name ("La Défense", "Sophia Antipolis", a
 * town half typed), whatever the text
 */
async function search({ text: asked, postalCode, city, townOnly, limit }: SearchQuery): Promise<FoundAddress[] | null> {
  const url = new URL(GEOCODING);
  // The geocoder refuses a query over 200 characters
  url.searchParams.set('q', asked.slice(0, 200));
  url.searchParams.set('limit', String(limit));
  if (postalCode && /^\d{5}$/.test(postalCode)) url.searchParams.set('postcode', postalCode);
  if (city) url.searchParams.set('city', city.slice(0, 100));
  if (townOnly) url.searchParams.set('type', 'municipality');
  const { status, body } = await getJson(url, geoplateformeTimeouts.geocodingMs);
  if (status === 400) return null;
  if (status !== 200 || !isObject(body) || !Array.isArray(body.features)) {
    throw new GeoServiceError(`geocoding answered ${status}`);
  }
  return (body.features as unknown[]).map(foundAddress).filter((found) => found !== undefined);
}

/** Where an address is; null when the geocoder knows no such place */
export async function geocode(query: GeocodingQuery): Promise<GeoPlace | null> {
  const [found] = (await search({ ...query, limit: 1 })) ?? [];
  if (!found || found.score < MIN_GEOCODING_SCORE) return null;
  return { label: found.label || query.text, lat: found.lat, lon: found.lon };
}

export interface SuggestionQuery {
  /** What was typed so far: the geocoder completes its last word */
  text: string;
  /** Narrows the search to a postal code (5 digits), while it finds something there */
  postalCode?: string;
  /** Narrows the search to the towns of this name, while it finds something there */
  city?: string;
}

/**
 * Under this, the best of a narrowed search is a guess, not what was typed: a
 * street of another arrondissement is no match under the postal code an
 * earlier pick wrote ("129 rue ser" in 69002 is "Rue Seguin" at 0.35, without
 * it "129 Rue Servient 69003 Lyon" at 0.88)
 */
const GOOD_SUGGESTION_SCORE = 0.6;

const bestScore = (found: FoundAddress[]) => found.reduce((best, { score }) => Math.max(best, score), -1);

/**
 * A suggestion as the one line of text that finds it again. A town's label is
 * its name alone, which other towns, hamlets and streets share ("Saint-Denis"
 * alone is the one of La Réunion): its postal code goes with it
 */
const suggestionLabel = ({ kind, label, postalCode }: FoundAddress): string =>
  kind === 'municipality' && postalCode && !label.includes(postalCode) ? `${label} ${postalCode}` : label;

/**
 * The addresses that what was typed could be, the likeliest first. Not held
 * to the score an address must reach to be the place asked for: a few letters
 * of a street match it poorly, and are what a suggestion is for.
 *
 * The postal code and the town are a preference, not a condition: the
 * geocoder takes them as filters, so a town it does not know as a commune
 * would refuse every address (a 400), and a postal code an earlier pick wrote
 * would hide every street of the town but its own. When the narrowed search
 * finds no good match, the postal code is dropped, then the town: at most
 * three requests, one when the narrowing finds the address
 */
export async function suggestAddresses({ text: asked, postalCode, city }: SuggestionQuery): Promise<AddressSuggestion[]> {
  let narrowing = { postalCode, city };
  let kept: FoundAddress[] = [];
  for (;;) {
    const found = await search({ text: asked, ...narrowing, limit: ADDRESS_SEARCH.suggestions });
    // The town refused (or the text: then it is refused again, and nothing is found)
    if (found === null && narrowing.city) {
      narrowing = { ...narrowing, city: undefined };
      continue;
    }
    // The most narrowed answer wins a tie: it is the one the form asked for
    if (found && bestScore(found) > bestScore(kept)) kept = found;
    if (bestScore(kept) >= GOOD_SUGGESTION_SCORE || (!narrowing.postalCode && !narrowing.city)) break;
    narrowing = narrowing.postalCode ? { ...narrowing, postalCode: undefined } : { ...narrowing, city: undefined };
  }
  const seen = new Set<string>();
  return kept
    .map((found) => ({ ...found, label: suggestionLabel(found) }))
    .filter(({ label }) => label && !seen.has(label) && !!seen.add(label))
    .map(({ lat: _lat, lon: _lon, score: _score, ...suggestion }) => suggestion);
}

export interface Point {
  lat: number;
  lon: number;
}

export interface StreetRoute {
  minutes: number;
  meters: number;
}

/** The way between two points by car or on foot; null when there is none */
export async function streetRoute(profile: 'car' | 'pedestrian', from: Point, to: Point): Promise<StreetRoute | null> {
  const url = new URL(ROUTES);
  url.searchParams.set('resource', 'bdtopo-osrm');
  url.searchParams.set('profile', profile);
  url.searchParams.set('optimization', profile === 'car' ? 'fastest' : 'shortest');
  url.searchParams.set('start', `${from.lon},${from.lat}`);
  url.searchParams.set('end', `${to.lon},${to.lat}`);
  url.searchParams.set('timeUnit', 'minute');
  url.searchParams.set('distanceUnit', 'meter');
  url.searchParams.set('getSteps', 'false');
  url.searchParams.set('getBbox', 'false');
  url.searchParams.set('geometryFormat', 'polyline');
  const { status, body } = await getJson(url, geoplateformeTimeouts.routeMs);
  const error = isObject(body) && isObject(body.error) ? String(body.error.message ?? '') : '';
  // A point off its road network (abroad, at sea), or two points no road joins
  if (/no path found|not found|out of bounds|hors/i.test(error)) return null;
  if (status !== 200 || !isObject(body)) throw new GeoServiceError(`routes answered ${status}`);
  const { duration, distance } = body;
  if (typeof duration !== 'number' || typeof distance !== 'number' || !(duration >= 0) || !(distance >= 0)) {
    throw new GeoServiceError('routes answered without a duration');
  }
  return { minutes: duration, meters: distance };
}
