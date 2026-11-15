import { env } from '../env';
import { GeoServiceError } from './geoplateforme';
import type { Point } from './geoplateforme';
import { commuteArrival } from './transitous';

// Public transport times from the HERE Public Transit API v8
// (https://docs.here.com/here-transit), a commercial journey planner over
// the timetables of the operators it lists for France. The operator opts in
// with COMMUTE_TRANSIT=here and the API key of a HERE platform app
// (HERE_API_KEY): each journey asked is a transaction of that account, free
// up to a monthly allowance (services/commute.ts caps and caches the calls;
// HERE's terms let a result be kept 30 days, which is how long it is).
// Called by services/commute.ts only.
//
// The key goes in the URL, as HERE asks: that URL is never logged, and the
// API traces no outgoing request (instrumentation.ts). What HERE answers an
// error with is not read into an error message either: only its status.

const ROUTES = 'https://transit.router.hereapi.com/v8/routes';

export const hereTransitTimeouts = { routesMs: 15_000 };

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * 08:30 at the office (HERE reads a time without offset as local to the
 * destination), on the day services/transitous.ts picks: an ordinary working
 * day, near enough for its timetables to be published
 */
export const hereArrivalTime = (now = new Date()): string => `${commuteArrival(now).toISOString().slice(0, 10)}T08:30:00`;

const instant = (stop: unknown): number =>
  isObject(stop) && typeof stop.time === 'string' ? Date.parse(stop.time) : Number.NaN;

/** How long a route takes, from leaving the door to reaching the other one; NaN when it does not say */
const routeSeconds = (route: unknown): number => {
  const sections = isObject(route) && Array.isArray(route.sections) ? (route.sections as unknown[]) : [];
  const [first, last] = [sections[0], sections[sections.length - 1]];
  if (!isObject(first) || !isObject(last)) return Number.NaN;
  return (instant(last.arrival) - instant(first.departure)) / 1000;
};

/**
 * The shortest journey by public transport between two points, door to door
 * (the walks to and from the stops included), arriving for a morning at
 * work; null when HERE finds no journey (no stop near, no timetable there)
 */
export async function hereTransitMinutes(from: Point, to: Point): Promise<number | null> {
  const url = new URL(ROUTES);
  url.searchParams.set('origin', `${from.lat},${from.lon}`);
  url.searchParams.set('destination', `${to.lat},${to.lon}`);
  url.searchParams.set('arrivalTime', hereArrivalTime());
  // The best journey and two others: one request, the shortest of them counts
  url.searchParams.set('alternatives', '2');
  url.searchParams.set('apiKey', env.HERE_API_KEY ?? '');
  // A redirect is never followed: the key and the two points go nowhere else
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(hereTransitTimeouts.routesMs)
  });
  if (response.status !== 200) throw new GeoServiceError(`transit answered ${response.status}`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!isObject(body) || !Array.isArray(body.routes)) throw new GeoServiceError('transit answered without journeys');
  const routes = body.routes as unknown[];
  const durations = routes.map(routeSeconds).filter((seconds) => Number.isFinite(seconds) && seconds >= 0);
  // Journeys this code cannot time are not "no journey": a failure, logged and asked again
  // in 10 minutes, never kept 30 days as none (HERE's schema does not promise the times)
  if (routes.length > 0 && durations.length === 0) throw new GeoServiceError('transit answered without journey times');
  return durations.length === 0 ? null : Math.min(...durations) / 60;
}
