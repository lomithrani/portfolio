import { Types } from 'mongoose';
import { parsePerfectJob, storedPerfectJob } from 'portfolio-common';
import type { PerfectJob as PerfectJobCriteria } from 'portfolio-common';
import { PerfectJob } from '../models/database';
import { FieldValidationError } from '../errors';

// The perfect job of an account (plugins/perfectJob.ts): the criteria its
// owner rated, which a recruiter's job is scored against in the hiring
// journey (services/workflowSteps/jobMatch.ts). The rules are
// portfolio-common's parsePerfectJob. Private to its owner: nothing here is
// returned to a visitor.

/** GET, PUT /perfect-job */
export interface PerfectJobDto {
  criteria: PerfectJobCriteria;
}

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
  await PerfectJob.updateOne({ user: userId }, { $set: { criteria } }, { upsert: true, runValidators: true });
  return criteria;
}
