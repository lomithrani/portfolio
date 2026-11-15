// Bodies of the API the client matches, not shows: they stay in English whatever the request's
// language (docs/I18N.md: "texts that code compares"), and the client says it in its own words,
// in the visitor's language. Changing one means changing what the client matches with it.
//
// Others, kept where they were declared: JOB_NOT_FOUND (services/jobPostings.ts),
// RECRUITER_REQUIRED (services/recruiters.ts), JOB_NOT_OPEN (services/workflowSteps/job.ts),
// EARLIER_STEPS_FIRST, JOURNEY_CHANGED, OWN_JOURNEY and STEP_NOT_SUBMITTABLE
// (services/workflows.ts), FULL_JOB (services/jobPostings.ts).

/** 404 for a portfolio no one has: `isDomainNotFound` of client/src/services/apiErrors.ts, and the 404s of workflow.ts and recruiter.ts */
export const DOMAIN_NOT_FOUND = 'Domain not found'

/** 401 for a session whose account no longer exists: `isUnknownUser` of client/src/services/account.ts */
export const UNKNOWN_USER = 'Unauthorized: unknown user'

/** 409 of a booking whose slot was taken meanwhile: `isSlotUnavailable` of client/src/services/apiErrors.ts */
export const SLOT_UNAVAILABLE = 'This slot is no longer available'

/** 409 of a claim by an account that has a portfolio: /already own/ in client/src/services/account.ts */
export const ALREADY_OWNS_DOMAIN = 'You already own a domain'

// POST /jobs/:id/applicants: `addApplicantError` of client/src/services/recruiter.ts
/** 403: /own portfolio/ */
export const OWN_PORTFOLIO = 'You cannot add your own portfolio'
/** 409: /already/ */
export const ALREADY_APPLICANT = 'Already an applicant'

// POST and DELETE /jobs/:id/application: `applicationFailure` of client/src/services/applications.ts
/** 409: /not taking applications/ */
export const JOB_NOT_TAKING_APPLICATIONS = 'This job posting is not taking applications'
/** 403: /own job posting/ */
export const OWN_JOB_POSTING = 'You cannot apply to your own job posting'
/** 403: /claim a portfolio/ */
export const PORTFOLIO_REQUIRED = 'Claim a portfolio before applying'
/** 409: /already applied/ */
export const ALREADY_APPLIED = 'You already applied'
/** 404: /not applied/ */
export const NOT_APPLIED = 'You have not applied to this job posting'

/** 409 of an edit that started from an older version of a posting: `JOB_CHANGED` of client/src/lib/components/job-editor/JobEditor.svelte, which then offers to reload */
export const JOB_CHANGED = 'This job posting was changed since you opened it'
