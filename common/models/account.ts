// Account spaces and plans, shared by the API and the client.
//
// One Google account can use the site in two spaces ("modes"): as a candidate (the portfolio of
// the domain it owns, if any) and as a recruiter (job postings). The recruiter space is created
// the first time the account chooses it; the account then switches freely between the two. The
// active mode only decides what the client shows: the API authorises each route on what the
// account has (a domain, a recruiter space), never on the active mode.

export const USER_MODES = ['candidate', 'recruiter'] as const;
export type UserMode = (typeof USER_MODES)[number];

export const USER_MODE_LABELS: Record<UserMode, string> = {
	candidate: 'Candidate',
	recruiter: 'Recruiter'
};

/** Plans of the recruiter space. Everyone is on the free plan until subscriptions exist */
export const RECRUITER_PLANS = {
	free: {
		/** Job description PDF imports included, for the lifetime of the account */
		jobImports: 3
	}
} as const;
export type RecruiterPlan = keyof typeof RECRUITER_PLANS;

/** The plan of a recruiter space that has none recorded */
export const DEFAULT_RECRUITER_PLAN: RecruiterPlan = 'free';
