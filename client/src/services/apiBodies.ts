// Bodies of the API the client matches, never shows: English constants whatever the visitor's
// language (docs/I18N.md, "texts that code compares"), each the same as the server's
// (server/protocol.ts, and the two kept where they are declared: JOB_NOT_FOUND of
// server/services/jobPostings.ts, RECRUITER_REQUIRED of server/services/recruiters.ts), which
// client/src/services/tests/apiBodies.test.ts checks. One place for each, so that a body renamed on
// the server fails that test rather than turning a failure the client tells apart into a generic one.

/** 409 of an edit, a switch of matching or a review on a version of a posting no longer its own */
export const JOB_CHANGED = 'This job posting was changed since you opened it';

/** 409 of an edit that changes the locked terms of a posting opened before */
export const JOB_TERMS_LOCKED = 'The terms of an opened job posting cannot be changed';

/** 404 of a posting that does not exist, is not the caller's, or is not shared with them */
export const JOB_NOT_FOUND = 'Job posting not found';

/** 403 of a recruiter route for an account without a recruiter space */
export const RECRUITER_REQUIRED = 'Create your recruiter space first';

/** 409 of PUT /jobs/:id/matching turning matching on for a job that is not open */
export const MATCHING_NEEDS_OPEN_JOB = 'Only an open job description can be proposed to candidates';

/** 403 of the candidate feed and decisions for an account not proposed to recruiters now */
export const NOT_PROPOSED_TO_RECRUITERS = 'You are not proposed to recruiters now';

/** 409 of the recruiter feed and decisions for a job not proposed to candidates now */
export const JOB_NOT_PROPOSED = 'This job description is not proposed to candidates now';

/** 409 of a decision or an undo on a pair both interested already */
export const MUTUAL_INTEREST_EXISTS = 'You are both interested already';

/** 409 of a recruiter's decision on a card whose candidate is not proposed for the job now */
export const CANDIDATE_UNAVAILABLE = 'This candidate is not proposed for this job now';

/** 404 of an undo without a decision to undo */
export const DECISION_NOT_FOUND = 'There is no decision to undo';

/** 409 of an undo of a decision that can no longer be undone */
export const DECISION_FINAL = 'This decision can no longer be undone';

/** 404 of the routes of one mutual interest for anyone but its two sides */
export const MATCH_NOT_FOUND = 'Match not found';

/** 409 of the job step's submit while a mutual interest holds the step with its job */
export const JOB_OF_MUTUAL_INTEREST = 'This step holds the job you are both interested in';
