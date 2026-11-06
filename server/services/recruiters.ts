import { DEFAULT_RECRUITER_PLAN, RECRUITER_PLANS } from 'portfolio-common';
import type { RecruiterPlan } from 'portfolio-common';
import { User } from '../models/database';
import { RecruiterSpaceRequiredError } from '../errors';

// The recruiter space of an account (User.recruiter): created the first time
// the account chooses the recruiter mode (PUT /me/mode, or POST /login with
// mode 'recruiter'), then required by every recruiter route (job postings,
// their applicants, job description imports).

export interface RecruiterSpace {
  enabledAt: Date;
  plan: RecruiterPlan;
  jobImportsUsed: number;
}

const RECRUITER_REQUIRED = 'Create your recruiter space first';

/** The account's recruiter space; null without one (or when the account is gone) */
export async function findRecruiterSpace(userId: string): Promise<RecruiterSpace | null> {
  const user = await User.findById(userId, { recruiter: 1 }).lean();
  const space = user?.recruiter;
  if (!space) return null;
  return {
    enabledAt: space.enabledAt,
    plan: (space.plan in RECRUITER_PLANS ? space.plan : DEFAULT_RECRUITER_PLAN) as RecruiterPlan,
    jobImportsUsed: space.jobImportsUsed ?? 0
  };
}

/** The account's recruiter space; throws 403 (RecruiterSpaceRequiredError) without one */
export async function requireRecruiterSpace(userId: string): Promise<RecruiterSpace> {
  const space = await findRecruiterSpace(userId);
  if (!space) throw new RecruiterSpaceRequiredError(RECRUITER_REQUIRED);
  return space;
}

/**
 * Creates the account's recruiter space on the free plan, unless it has one
 * (atomic: two concurrent calls create it once, and an existing space keeps
 * its plan and its imports used). Returns false when the account is gone.
 */
export async function enableRecruiterSpace(userId: string): Promise<boolean> {
  const { matchedCount } = await User.updateOne(
    { _id: userId, recruiter: { $exists: false } },
    { $set: { recruiter: { enabledAt: new Date(), plan: DEFAULT_RECRUITER_PLAN, jobImportsUsed: 0 } } }
  );
  if (matchedCount > 0) return true;
  return (await User.exists({ _id: userId })) !== null;
}
