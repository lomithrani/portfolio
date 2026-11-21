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

/** 409 of an edit that started from an older version of a posting: `JOB_CHANGED` of client/src/lib/components/job-editor/JobEditor.svelte, which then offers to reload; also of PUT /jobs/:id/matching for a posting edited meanwhile, which `switchFailure` of client/src/services/recruiterMatching.ts matches (its panel offers to reload), and of PUT /matching/reviews/:id on a version no longer the posting's, which `reviewFailure` of client/src/services/matchingReviews.ts matches (the reviewers' page reads the list again) */
export const JOB_CHANGED = 'This job posting was changed since you opened it'

/** 409 of an edit that changes the terms (the fields the perfect job scores) of a posting opened before: `JOB_TERMS_LOCKED` of client/src/lib/components/job-editor/JobEditor.svelte, which then offers to reload it or to duplicate it */
export const JOB_TERMS_LOCKED = 'The terms of an opened job posting cannot be changed'

/**
 * 409 of PUT /jobs/:id/matching turning matching on for a job that is not open (put on hold,
 * filled or back to draft meanwhile). `switchFailure` of client/src/services/recruiterMatching.ts
 * matches it: the recruiter's matching panel says it in its own words
 */
export const MATCHING_NEEDS_OPEN_JOB = 'Only an open job description can be proposed to candidates'

/**
 * 403 of the reviewers' routes of matching (GET /matching/reviews, PUT /matching/reviews/:id) for
 * an account that is not one of MATCHING_REVIEWERS. The reviewers' page
 * (client/src/routes/(app)/recruiter/reviews, client/src/services/matchingReviews.ts) reads any
 * 403 there, as the 404 of matching off, as "not available", without matching the body. The 409 of
 * a review of a version that is no longer the posting's is JOB_CHANGED, which that page matches
 * (it reads the list again)
 */
export const NOT_A_MATCHING_REVIEWER = 'Only the reviewers of matching can do this'

/**
 * 403 of GET /opportunities (the jobs proposed to a candidate) and of a candidate's decision for an
 * account that is not proposed to recruiters now: discovery off, paused (a requirement missing) or
 * lapsed. `feedFailure` and `decisionFailure` of client/src/services/matching.ts match it (the deck
 * stops; the candidate's page reads GET /discovery to say why)
 */
export const NOT_PROPOSED_TO_RECRUITERS = 'You are not proposed to recruiters now'

/**
 * 409 of GET /recruiter/jobs/:id/candidates (the candidates proposed for a recruiter's job), and of
 * a recruiter's decision, for a job of theirs that is not proposed to candidates now: not open, out
 * of matching, or not approved by a reviewer. `feedFailure` and `decisionFailure` of
 * client/src/services/matching.ts match it (the deck stops; the recruiter's page says why from the
 * job's `matching`)
 */
export const JOB_NOT_PROPOSED = 'This job description is not proposed to candidates now'

/**
 * 409 of a decision of matching (PUT or DELETE /opportunities/jobs/:id/decision, PUT or DELETE
 * /recruiter/jobs/:id/candidates/decision) on a job and a candidate who are both interested
 * already, or were (a mutual interest is never undone by a decision: either side ends it).
 * `decisionFailure` of client/src/services/matching.ts matches it: the card leaves the deck
 */
export const MUTUAL_INTEREST_EXISTS = 'You are both interested already'

/**
 * 409 of a recruiter's decision on a candidate's card (PUT /recruiter/jobs/:id/candidates/decision)
 * whose token does not stand for a candidate for that recruiter and job (too old, or not one), or
 * whose candidate is not proposed for the job now (withdrew, paused, criteria changed, passed it).
 * `decisionFailure` of client/src/services/matching.ts matches it: the card leaves the recruiter's
 * deck, which reads the feed again
 */
export const CANDIDATE_UNAVAILABLE = 'This candidate is not proposed for this job now'

/**
 * 404 of an undo of a decision (DELETE /opportunities/jobs/:id/decision, DELETE
 * /recruiter/jobs/:id/candidates/decision) when the caller has no decision on that job and
 * candidate. `decisionFailure` of client/src/services/matching.ts matches it: the deck stops
 * offering Undo
 */
export const DECISION_NOT_FOUND = 'There is no decision to undo'

/**
 * 409 of an undo of a decision (the same routes) taken over MATCHING_LIMITS.undoMinutes ago, or
 * that is no longer the caller's latest decision (as a candidate, or as a recruiter), or not their
 * first answer on the pair: an undo puts back a choice just made. `decisionFailure` of
 * client/src/services/matching.ts matches it: the deck stops offering Undo
 */
export const DECISION_FINAL = 'This decision can no longer be undone'

/**
 * 404 of the routes of one mutual interest (GET /matches/:id, POST /matches/:id/end, PUT
 * /matches/:id/seen) for one the caller is not a side of, or that does not exist.
 * `endMutualInterest` of client/src/services/opportunities.ts and `recruiterInterestFailure` of
 * client/src/services/recruiterMatching.ts match it: each side's list says the mutual interest is
 * gone and is read again
 */
export const MATCH_NOT_FOUND = 'Match not found'

/**
 * 409 of the job step's submit (POST /workflow/domains/:domainName/steps/:stepId) by a recruiter
 * whose mutual interest with the owner (matching) fills that step with its job: they cannot share
 * another while it lasts. No screen sends it yet: the page for recruiters will hide the job step's
 * choice for that recruiter (2.13), and match it
 */
export const JOB_OF_MUTUAL_INTEREST = 'This step holds the job you are both interested in'
