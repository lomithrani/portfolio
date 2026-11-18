import { DEFAULT_RECRUITER_PLAN, RECRUITER_PLANS } from 'portfolio-common';
import type { RecruiterPlan } from 'portfolio-common';
import { User } from '../models/database';
import { FieldValidationError, RecruiterSpaceRequiredError } from '../errors';
import { restorePlanImports } from './accountQuotas';
import { userAcceptedCurrentTerms } from './legal';
import { m } from './legal.messages';

// The recruiter space of an account (User.recruiter): created the first time
// the account chooses the recruiter mode (PUT /me/mode, or POST /login with
// mode 'recruiter'), once it accepted the terms in force (services/users.ts
// setActiveMode), then required by every recruiter route (job postings, job
// description imports, the job step of a hiring journey), with the terms in
// force: a recruiter whose acceptance is older (or who opened the space before
// recruiters accepted the terms) accepts them again (PUT /me/consent) before
// going on.

export interface RecruiterSpace {
  enabledAt: Date;
  plan: RecruiterPlan;
  jobImportsUsed: number;
}

// Not a message: the client tells this 403 from its text (/recruiter space/ in pickJobFailure of
// client/src/services/workflow.ts) and says it in its own words: it stays in English (protocol.ts)
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

/**
 * The account's recruiter space; throws 403 (RecruiterSpaceRequiredError)
 * without one, then 422 on `consent` (FieldValidationError) while the
 * account has not accepted the terms in force
 */
export async function requireRecruiterSpace(userId: string): Promise<RecruiterSpace> {
  const [space, accepted] = await Promise.all([findRecruiterSpace(userId), userAcceptedCurrentTerms(userId)]);
  if (!space) throw new RecruiterSpaceRequiredError(RECRUITER_REQUIRED);
  if (!accepted) throw new FieldValidationError('consent', () => m.recruiterTermsRequired);
  return space;
}

/**
 * Creates the account's recruiter space on the free plan, unless it has one
 * (atomic: two concurrent calls create it once, and an existing space keeps
 * its plan and its imports used). A new space starts from the job imports a
 * deleted account of the same Google identity used (services/accountQuotas.ts).
 * Returns false when the account is gone.
 */
export async function enableRecruiterSpace(userId: string): Promise<boolean> {
  const { matchedCount } = await User.updateOne(
    { _id: userId, recruiter: { $exists: false } },
    { $set: { recruiter: { enabledAt: new Date(), plan: DEFAULT_RECRUITER_PLAN, jobImportsUsed: 0 } } }
  );
  if (matchedCount > 0) {
    await restorePlanImports(userId);
    return true;
  }
  return (await User.exists({ _id: userId })) !== null;
}
