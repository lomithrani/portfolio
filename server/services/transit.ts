import { env } from '../env';
import { hereTransitMinutes } from './hereTransit';
import type { Point } from './geoplateforme';
import { transitousMinutes } from './transitous';

// Public transport times, from the service the operator chose with
// COMMUTE_TRANSIT (docs/DEPLOYMENT.md, Travel times): HERE
// (services/hereTransit.ts) or Transitous (services/transitous.ts). None
// without it: owners can then pick bike, car and on foot. Called by
// services/commute.ts only, which counts and caches the calls.

/** The services public transport times can come from */
export type TransitProvider = 'here' | 'transitous';

/** The service asked for public transport times; undefined when the site has none */
export const transitProvider = (): TransitProvider | undefined => {
  if (env.COMMUTE_TRANSIT === 'here') return env.HERE_API_KEY ? 'here' : undefined;
  if (env.COMMUTE_TRANSIT === 'transitous') return env.COMMUTE_CONTACT ? 'transitous' : undefined;
  return undefined;
};

export const transitEnabled = () => transitProvider() !== undefined;

/**
 * The shortest journey by public transport between two points, door to door,
 * arriving for a morning at work, in minutes; null when no journey is found.
 * Throws when the service gave no usable answer
 */
export async function transitMinutes(from: Point, to: Point): Promise<number | null> {
  const provider = transitProvider();
  if (provider === 'here') return hereTransitMinutes(from, to);
  if (provider === 'transitous') return transitousMinutes(from, to);
  return null;
}
