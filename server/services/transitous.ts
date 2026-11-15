import { env } from '../env';
import { GeoServiceError } from './geoplateforme';
import type { Point } from './geoplateforme';

// Public transport times from Transitous (https://transitous.org), a
// community-run journey planner (MOTIS) over the timetables published as
// open data. No key, but a usage policy the operator accepts by setting
// COMMUTE_TRANSIT=transitous: open-source and non-commercial projects, light
// use (services/commute.ts caps and caches the calls), a User-Agent that
// says who asks (COMMUTE_CONTACT), and a link to its sources where the times
// are shown. Called by services/transit.ts only.

const PLAN = 'https://api.transitous.org/api/v1/plan';

export const transitousTimeouts = { planMs: 15_000 };

/**
 * The next Tuesday that is at least two days away, 07:30 UTC (a morning's
 * arrival at work in France, summer or winter): timetables are published
 * for the coming days, and a Tuesday is an ordinary working day
 */
export const commuteArrival = (now = new Date()): Date => {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 7, 30));
  while (day.getUTCDay() !== 2) day.setUTCDate(day.getUTCDate() + 1);
  return day;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The shortest journey by public transport between two points, door to door
 * (the walks to and from the stops included), arriving for a morning at
 * work; null when no journey is found
 */
export async function transitousMinutes(from: Point, to: Point): Promise<number | null> {
  const url = new URL(PLAN);
  url.searchParams.set('fromPlace', `${from.lat},${from.lon}`);
  url.searchParams.set('toPlace', `${to.lat},${to.lon}`);
  url.searchParams.set('time', commuteArrival().toISOString());
  url.searchParams.set('arriveBy', 'true');
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': `portfolio-commute/1 (${env.COMMUTE_CONTACT})` },
    redirect: 'manual',
    signal: AbortSignal.timeout(transitousTimeouts.planMs)
  });
  if (response.status !== 200) throw new GeoServiceError(`transit answered ${response.status}`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!isObject(body) || !Array.isArray(body.itineraries)) throw new GeoServiceError('transit answered without journeys');
  const durations = (body.itineraries as unknown[])
    .map((itinerary) => (isObject(itinerary) ? itinerary.duration : undefined))
    .filter((seconds): seconds is number => typeof seconds === 'number' && seconds >= 0);
  return durations.length === 0 ? null : Math.min(...durations) / 60;
}
