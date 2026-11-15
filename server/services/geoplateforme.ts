import type { GeoPlace } from 'portfolio-common';

// The public geocoding and route services of the Géoplateforme (IGN, the
// French mapping agency): https://data.geopf.fr. No key; France only, like
// the job postings. Geocoding finds an address; the route service gives the
// time and the distance of a way by car or on foot (it has no bike profile
// and no public transport). Called by services/commute.ts only, which
// counts and caches the calls.
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

export class GeoServiceError extends Error {}

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

/** Where an address is; null when the geocoder knows no such place */
export async function geocode({ text, postalCode, townOnly }: GeocodingQuery): Promise<GeoPlace | null> {
  const url = new URL(GEOCODING);
  // The geocoder refuses a query over 200 characters
  url.searchParams.set('q', text.slice(0, 200));
  url.searchParams.set('limit', '1');
  if (postalCode && /^\d{5}$/.test(postalCode)) url.searchParams.set('postcode', postalCode);
  if (townOnly) url.searchParams.set('type', 'municipality');
  const { status, body } = await getJson(url, geoplateformeTimeouts.geocodingMs);
  // 400: a query it cannot read (too short, no letter): no such place
  if (status === 400) return null;
  if (status !== 200 || !isObject(body) || !Array.isArray(body.features)) {
    throw new GeoServiceError(`geocoding answered ${status}`);
  }
  const [feature] = body.features as unknown[];
  if (!isObject(feature) || !isObject(feature.geometry) || !isObject(feature.properties)) return null;
  const [lon, lat] = Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates : [];
  const { label, score } = feature.properties;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (typeof score !== 'number' || score < MIN_GEOCODING_SCORE) return null;
  return { label: typeof label === 'string' ? label.slice(0, 300) : text, lat, lon };
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
