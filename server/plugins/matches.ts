import Elysia, { NotFoundError } from 'elysia';
import { env } from '../env';
import { userLogged } from './userLogged';
import {
  candidateDecisionRequest,
  discoveryCardRequest,
  discoveryConsentRequest,
  jobMatchingRequest,
  matchesQuery,
  matchingReviewRequest,
  objectIdParams,
  opportunitiesQuery,
  recruiterDecisionRequest,
  recruiterUndoRequest
} from '../models/elysia';
import { candidateCardPreview } from '../services/candidateCard';
import type { CandidateCardPreview } from '../services/candidateCard';
import { discoveryStatus, grantDiscovery, saveDiscoveryCard, withdrawDiscovery } from '../services/discovery';
import type { DiscoveryDto } from '../services/discovery';
import { setJobMatching, toRecruiterJobDto } from '../services/jobMatching';
import type { RecruiterJobPostingDto } from '../services/jobMatching';
import {
  decideAsCandidate,
  decideAsRecruiter,
  endMatch,
  listMatches,
  markMatchSeen,
  matchNotifications,
  readMatch,
  undoAsCandidate,
  undoAsRecruiter
} from '../services/matches';
import type { CandidateDecisionDto, MatchDto, MatchNotificationsDto, RecruiterDecisionDto } from '../services/matches';
import { candidateFeed, recruiterFeed } from '../services/matchFeeds';
import type { CandidateFeedDto, RecruiterFeedDto } from '../services/matchFeeds';
import { pendingReviews, requireMatchingReviewer, reviewJob } from '../services/matchingReviews';
import type { ReviewedJobDto } from '../services/matchingReviews';
import { requireRecruiterSpace } from '../services/recruiters';

// Path 2, matching on open jobs (CLAUDE.md, Matching): off unless MATCHING=true.
// For now: discovery (services/discovery.ts): a candidate asks to be proposed
// to recruiters, as an anonymous card (services/candidateCard.ts), previews
// it, and can stop at once; the recruiter's switch, which proposes a job to
// candidates (services/jobMatching.ts); the review of each job put into
// matching, by the operator's reviewers (services/matchingReviews.ts); the
// feeds (services/matchFeeds.ts): the jobs proposed to a candidate, the
// anonymous cards of the candidates proposed for a recruiter's job; and the
// decisions of each side on them, the mutual interest they make and where it
// leads (services/matches.ts). Every route is the signed-in account's own:
// none takes another account to read.
// Their answers hold date-like texts (a contract's start date): the client
// reads them without Eden's date parsing (portfolioTextApi).

const discovery = new Elysia()
  .use(userLogged)
  .get('/discovery', ({ userId }): Promise<DiscoveryDto> => discoveryStatus(userId), {
    detail: { summary: 'Whether you are proposed to recruiters, what you still miss for it, and what your anonymous card shows' }
  })
  // The card as recruiters read it, what it leaves out and why, and the
  // criteria whose outcome a recruiter reads beside it: reads only, on or off
  .get('/discovery/card', ({ userId }): Promise<CandidateCardPreview> => candidateCardPreview(userId), {
    detail: { summary: 'Preview your anonymous card as recruiters read it, and what it leaves out of your portfolio' }
  })
  .put('/discovery', ({ userId, body }): Promise<DiscoveryDto> => saveDiscoveryCard(userId, body.card), {
    body: discoveryCardRequest,
    detail: { summary: 'Set what your anonymous card shows: a headline, the experiences it leaves out' }
  })
  // Opt-in: the consent (18 or over, under the terms in force) and every
  // requirement, or a 422 naming the first that is missing
  .post('/discovery/consent', ({ userId, body }): Promise<DiscoveryDto> => grantDiscovery(userId, body.consent), {
    body: discoveryConsentRequest,
    detail: { summary: 'Be proposed to recruiters, as an anonymous card: needs your consent and every requirement' }
  })
  // Withdrawal: at once, whatever is missing, and recorded
  .delete('/discovery/consent', ({ userId }): Promise<DiscoveryDto> => withdrawDiscovery(userId), {
    detail: { summary: 'Stop being proposed to recruiters, at once' }
  })
  // The candidate's feed: the open jobs proposed to them, the most recently published first
  .get('/opportunities', ({ userId, query: { after } }): Promise<CandidateFeedDto> => candidateFeed(userId, after), {
    query: opportunitiesQuery,
    detail: {
      summary:
        'The open jobs proposed to you, scored against your criteria, the most recently published first (403 unless you are proposed to recruiters; 429 over the reads of an hour)'
    }
  })
  // What the candidate says of a job proposed to them, and the undo of it
  .put(
    '/opportunities/jobs/:id/decision',
    ({ userId, params: { id }, body: { decision } }): Promise<CandidateDecisionDto> => decideAsCandidate(userId, id, decision),
    {
      params: objectIdParams,
      body: candidateDecisionRequest,
      detail: {
        summary:
          "Say whether a job proposed to you interests you: with its recruiter's interest in you, you are both interested and your portfolio is revealed to them (403 unless you are proposed to recruiters; 404 for a job not proposed to you; 409 once you are both interested; 429 over the decisions of a day)"
      }
    }
  )
  .delete(
    '/opportunities/jobs/:id/decision',
    ({ userId, params: { id } }): Promise<CandidateDecisionDto> => undoAsCandidate(userId, id),
    {
      params: objectIdParams,
      detail: { summary: 'Undo what you said of a job, until you and its recruiter are both interested (404 without a decision; 409 after)' }
    }
  );

// A recruiter's switch and feed: their own postings only (404 for another's),
// with a recruiter space and the terms in force, like every recruiter route
const jobMatching = new Elysia()
  .use(userLogged)
  .onBeforeHandle(async ({ userId }) => {
    await requireRecruiterSpace(userId);
  })
  .put('/jobs/:id/matching', async ({ userId, params: { id }, body: { enabled } }): Promise<RecruiterJobPostingDto> =>
    toRecruiterJobDto(await setJobMatching(userId, id, enabled)), {
    params: objectIdParams,
    body: jobMatchingRequest,
    detail: {
      summary: 'Propose an open job description to the candidates whose criteria it meets, once a reviewer approved it, or stop (409 unless open; 422 on `company` or `description`; 409 over the jobs a recruiter can have in matching)'
    }
  })
  // The recruiter's feed for a job: anonymous cards, in a neutral order, never a count
  .get('/recruiter/jobs/:id/candidates', ({ userId, params: { id } }): Promise<RecruiterFeedDto> => recruiterFeed(userId, id), {
    params: objectIdParams,
    detail: {
      summary:
        'The anonymous cards of the candidates proposed for your job, those interested in it first, a few at a time, and whether there are more (409 unless it is proposed to candidates; 429 over the reads of an hour)'
    }
  })
  // What the recruiter says of a card, for their job: the card's token in the body, never the path
  .put(
    '/recruiter/jobs/:id/candidates/decision',
    ({ userId, params: { id }, body: { token, decision } }): Promise<RecruiterDecisionDto> =>
      decideAsRecruiter(userId, id, token, decision),
    {
      params: objectIdParams,
      body: recruiterDecisionRequest,
      detail: {
        summary:
          "Say whether the candidate of an anonymous card interests you for your job: with their interest in it, you are both interested and their portfolio is revealed to you (409 unless the job is proposed to candidates, for a card's token that is not one or a candidate no longer proposed, and once you are both interested; 429 over the decisions of a day)"
      }
    }
  )
  .delete(
    '/recruiter/jobs/:id/candidates/decision',
    ({ userId, params: { id }, body: { token } }): Promise<RecruiterDecisionDto> => undoAsRecruiter(userId, id, token),
    {
      params: objectIdParams,
      body: recruiterUndoRequest,
      detail: {
        summary: "Undo what you said of a card's candidate, until you are both interested (404 without a decision; 409 after)"
      }
    }
  );

// The mutual interests of the signed-in account, as a candidate or as a recruiter (as a recruiter:
// with a recruiter space and the terms in force, checked by the service), and what they have not
// seen yet
const mutualInterests = new Elysia()
  .use(userLogged)
  .get('/matches', ({ userId, query: { side } }): Promise<{ matches: MatchDto[] }> => listMatches(userId, side), {
    query: matchesQuery,
    detail: {
      summary:
        'Your mutual interests as a candidate or as a recruiter, the latest first: the job, and as a recruiter the portfolio revealed'
    }
  })
  .get('/matches/:id', ({ userId, params: { id } }): Promise<MatchDto> => readMatch(userId, id), {
    params: objectIdParams,
    detail: { summary: 'One of your mutual interests (404 for one you are not a side of)' }
  })
  .put('/matches/:id/seen', ({ userId, params: { id } }): Promise<MatchDto> => markMatchSeen(userId, id), {
    params: objectIdParams,
    detail: { summary: 'Mark one of your mutual interests as seen: it no longer counts in your notifications' }
  })
  .post('/matches/:id/end', ({ userId, params: { id } }): Promise<MatchDto> => endMatch(userId, id), {
    params: objectIdParams,
    detail: {
      summary:
        "End one of your mutual interests: it no longer leads into the candidate's hiring journey (kept a few months, then deleted)"
    }
  })
  .get('/me/notifications', ({ userId }): Promise<MatchNotificationsDto> => matchNotifications(userId), {
    detail: { summary: 'How many of your mutual interests going on you have not seen yet, as a candidate and as a recruiter' }
  });

// The reviewers' (MATCHING_REVIEWERS): 403 for anyone else
const reviews = new Elysia()
  .use(userLogged)
  .onBeforeHandle(async ({ userId }) => {
    await requireMatchingReviewer(userId);
  })
  .get('/matching/reviews', (): Promise<{ jobs: ReviewedJobDto[] }> => pendingReviews(), {
    detail: { summary: 'The jobs put into matching that wait for a review, the oldest request first (reviewers only)' }
  })
  .put('/matching/reviews/:id', ({ params: { id }, body }): Promise<ReviewedJobDto> => reviewJob(id, body), {
    params: objectIdParams,
    body: matchingReviewRequest,
    detail: {
      summary: 'Approve a job put into matching, or reject it with a reason its recruiter reads, as the version read (409 once it changed; reviewers only)'
    }
  });

export const matches = new Elysia()
  // A backstop: createApp registers none of these routes while MATCHING is
  // off (matchingRoutes), so they answer the 404 of a route that does not
  // exist whatever the request, before its body is read. Should the flag be
  // turned off once the app is built (tests do), they still answer it before
  // the session is read, and nothing is read or written
  .onTransform(() => {
    if (!env.matchingEnabled) throw new NotFoundError();
  })
  .use(discovery)
  .use(jobMatching)
  .use(mutualInterests)
  .use(reviews);

/**
 * The matching routes as createApp mounts them, the flag read when the app is
 * built: none while MATCHING is off (not even listed by /swagger), every one
 * once it is on. Typed as when on, so the client is typed against them
 */
export const matchingRoutes = (): typeof matches =>
  env.matchingEnabled ? matches : (new Elysia() as unknown as typeof matches);
