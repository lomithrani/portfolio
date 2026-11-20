import { t } from "elysia";
import { MATCHING_LIMITS, MATCHING_REVIEW_DECISIONS, MATCH_DECISIONS, MATCH_SIDES } from "portfolio-common";

// Matching (Path 2, plugins/matches.ts). Discovery's are Unknown, not object
// schemas: Elysia would turn a string or an array into an object before
// checking it (see workflowRequest). The rules are portfolio-common's, checked
// by the routes, which name what they refuse in the request's language

// POST /discovery/consent: the discovery consent the person ticked (18 or
// over, under the terms in force), portfolio-common's parseDiscoveryConsent
export const discoveryConsentRequest = t.Object({
  consent: t.Unknown()
});

// PUT /discovery: what the anonymous card shows, portfolio-common's
// parseDiscoveryCard (a headline, the experiences it leaves out)
export const discoveryCardRequest = t.Object({
  card: t.Unknown()
});

// PUT /jobs/:id/matching: whether the recruiter proposes the job to the
// candidates whose criteria it meets
export const jobMatchingRequest = t.Object({
  enabled: t.Boolean()
});

// PUT /matching/reviews/:id: a reviewer's decision on a job in matching, on
// the version they read (`version`, as GET /matching/reviews gave it). The
// reason (required to reject) is checked by portfolio-common's
// parseReviewReason, on the text it keeps: the length here only bounds what is
// read. No default: t.UnionEnum defaults to its first value, which Elysia fills
// in for a missing field (a decision without one would approve)
export const matchingReviewRequest = t.Object({
  decision: t.UnionEnum(MATCHING_REVIEW_DECISIONS, { default: undefined }),
  reason: t.Optional(t.String({ maxLength: MATCHING_LIMITS.reviewReason * 4 })),
  version: t.String({ minLength: 1, maxLength: 128 })
});

// GET /opportunities: where the page starts, a previous page's `next` (the
// publication time of the last job read, its milliseconds in base 36, then
// its id: services/matchFeeds.ts)
export const FEED_CURSOR_PATTERN = "^[0-9a-z]{1,11}\\.[0-9a-f]{24}$";

export const opportunitiesQuery = t.Object({
  after: t.Optional(t.String({ maxLength: 40, pattern: FEED_CURSOR_PATTERN }))
});

// The decisions of matching (services/matches.ts). No default for the enums:
// t.UnionEnum defaults to its first value, which Elysia fills in for a
// missing field (a decision without one would be an interest)
const decision = t.UnionEnum(MATCH_DECISIONS, { default: undefined });

// A card's token (services/matchTokens.ts: base64url, about 66 characters),
// in the body of the request, never its path (paths reach traces)
const cardToken = t.String({ minLength: 1, maxLength: 256 });

// PUT /opportunities/jobs/:id/decision: what the candidate says of a job
// proposed to them
export const candidateDecisionRequest = t.Object({
  decision
});

// PUT /recruiter/jobs/:id/candidates/decision: what the recruiter says of the
// candidate a card's token stands for, for their job
export const recruiterDecisionRequest = t.Object({
  token: cardToken,
  decision
});

// DELETE /recruiter/jobs/:id/candidates/decision: the recruiter undoes theirs
export const recruiterUndoRequest = t.Object({
  token: cardToken
});

// GET /matches: the side of the mutual interests to list
export const matchesQuery = t.Object({
  side: t.UnionEnum(MATCH_SIDES, { default: undefined })
});
