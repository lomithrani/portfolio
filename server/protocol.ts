// Bodies of the API the client matches, not shows: they stay in English whatever the request's
// language (docs/I18N.md: "texts that code compares"), and the client says it in its own words,
// in the visitor's language. Changing one means changing what the client matches with it.
//
// Others, kept where they were declared: JOB_NOT_FOUND (services/jobPostings.ts),
// RECRUITER_REQUIRED (services/recruiters.ts), JOB_NOT_OPEN (services/workflowSteps/job.ts),
// EARLIER_STEPS_FIRST, JOURNEY_CHANGED, OWN_JOURNEY and STEP_NOT_SUBMITTABLE
// (services/workflows.ts).

/** 404 for a portfolio no one has: `isDomainNotFound` of client/src/services/apiErrors.ts, and the 404s of workflow.ts */
export const DOMAIN_NOT_FOUND = 'Domain not found'

/** 401 for a session whose account no longer exists: `isUnknownUser` of client/src/services/account.ts */
export const UNKNOWN_USER = 'Unauthorized: unknown user'

/** 409 of a booking whose slot was taken meanwhile: `isSlotUnavailable` of client/src/services/apiErrors.ts */
export const SLOT_UNAVAILABLE = 'This slot is no longer available'

/** 409 of a claim by an account that has a portfolio: /already own/ in client/src/services/account.ts */
export const ALREADY_OWNS_DOMAIN = 'You already own a domain'

/** 409 of an edit that started from an older version of a posting: `JOB_CHANGED` of client/src/lib/components/job-editor/JobEditor.svelte, which then offers to reload */
export const JOB_CHANGED = 'This job posting was changed since you opened it'

/** 409 of an edit that changes the terms (the fields the perfect job scores) of a posting opened before: `JOB_TERMS_LOCKED` of client/src/lib/components/job-editor/JobEditor.svelte, which then offers to reload it or to duplicate it */
export const JOB_TERMS_LOCKED = 'The terms of an opened job posting cannot be changed'

/**
 * 409 of PUT /jobs/:id/matching turning matching on for a job that is not open (put on hold,
 * filled or back to draft meanwhile). No screen calls the route yet: the recruiter's matching
 * panel will match it, and say it in its own words
 */
export const MATCHING_NEEDS_OPEN_JOB = 'Only an open job description can be proposed to candidates'

/**
 * 403 of the reviewers' routes of matching (GET /matching/reviews, PUT /matching/reviews/:id) for
 * an account that is not one of MATCHING_REVIEWERS. No screen calls them yet: the review screen
 * will match it. The 409 of a review of a version that is no longer the posting's is JOB_CHANGED
 */
export const NOT_A_MATCHING_REVIEWER = 'Only the reviewers of matching can do this'

/**
 * 403 of GET /opportunities (the jobs proposed to a candidate) for an account that is not proposed
 * to recruiters now: discovery off, paused (a requirement missing) or lapsed. No screen calls the
 * route yet: the candidate's screen will match it, then read GET /discovery to say why
 */
export const NOT_PROPOSED_TO_RECRUITERS = 'You are not proposed to recruiters now'

/**
 * 409 of GET /recruiter/jobs/:id/candidates (the candidates proposed for a recruiter's job) for a
 * job of theirs that is not proposed to candidates now: not open, out of matching, or not approved
 * by a reviewer. No screen calls the route yet: the recruiter's screen will match it, and say why
 * from the job's `matching`
 */
export const JOB_NOT_PROPOSED = 'This job description is not proposed to candidates now'
