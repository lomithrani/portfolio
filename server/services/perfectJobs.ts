import { Types } from 'mongoose';
import { parsePerfectJob, storedPerfectJob } from 'portfolio-common';
import type { PerfectJob as PerfectJobCriteria } from 'portfolio-common';
import { PerfectJob } from '../models/database';
import { FieldValidationError, ServiceUnavailableError } from '../errors';
import {
  ADDRESS_LOOKUP_FAILED,
  ADDRESS_NOT_FOUND,
  COMMUTE_UNAVAILABLE,
  commuteAvailability,
  locateOwnerAddress
} from './commute';
import type { CommuteAvailability } from './commute';

// The perfect job of an account (plugins/perfectJob.ts): the criteria its
// owner rated, which a recruiter's job is scored against in the hiring
// journey (services/workflowSteps/jobMatch.ts). The rules are
// portfolio-common's parsePerfectJob. Private to its owner: nothing here is
// returned to a visitor.

/** GET, PUT /perfect-job */
export interface PerfectJobDto {
  criteria: PerfectJobCriteria;
  /** Whether this server computes travel times for the commute criterion, and by which modes */
  commute: CommuteAvailability;
}

export const perfectJobDto = (criteria: PerfectJobCriteria): PerfectJobDto => ({
  criteria,
  commute: commuteAvailability()
});

/** The criteria `userId` rated; none for an account that never saved any */
export async function perfectJobOf(userId: Types.ObjectId | string): Promise<PerfectJobCriteria> {
  const stored = await PerfectJob.findOne({ user: userId }, { criteria: 1 }).lean();
  return storedPerfectJob(stored?.criteria);
}

/**
 * Replaces the criteria of `userId` with what parsePerfectJob makes of `raw`
 * (422 naming `criteria`, or `criteria.<criterion>.<setting>`, for the first
 * rule broken). An upsert on the unique `user`: MongoDB retries it itself
 * when two first saves race, so the account keeps one perfect job
 */
export async function savePerfectJob(userId: string, raw: unknown): Promise<PerfectJobCriteria> {
  const { criteria, problems } = parsePerfectJob(raw);
  const [problem] = problems;
  if (problem) {
    throw new FieldValidationError(
      problem.field === 'criteria' ? 'criteria' : `criteria.${problem.field}`,
      problem.message
    );
  }
  if (criteria.commute) criteria.commute = await withPlace(userId, criteria.commute);
  await PerfectJob.updateOne({ user: userId }, { $set: { criteria } }, { upsert: true, runValidators: true });
  return criteria;
}

type Commute = NonNullable<PerfectJobCriteria['commute']>;

/**
 * The commute criterion with the place of its address, whatever place the
 * client sent: the one already stored while the address is the same, else
 * looked up now. 422 at the address when it is not found, or when this server
 * computes no travel times; 503 when the lookup did not answer
 */
async function withPlace(userId: string, commute: Commute): Promise<Commute> {
  const { place: _sent, ...criterion } = commute;
  const stored = (await perfectJobOf(userId)).commute;
  if (stored?.place && stored.from === criterion.from) return { ...criterion, place: stored.place };
  if (!commuteAvailability().enabled) throw new FieldValidationError('criteria.commute.from', COMMUTE_UNAVAILABLE);
  const place = await locateOwnerAddress(criterion.from);
  if (place === undefined) throw new ServiceUnavailableError(ADDRESS_LOOKUP_FAILED);
  if (place === null) throw new FieldValidationError('criteria.commute.from', ADDRESS_NOT_FOUND);
  return { ...criterion, place };
}
