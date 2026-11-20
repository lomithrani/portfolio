import Elysia, { NotFoundError } from 'elysia';
import { env } from '../env';
import { userLogged } from './userLogged';
import {
  discoveryCardRequest,
  discoveryConsentRequest,
  jobMatchingRequest,
  matchingReviewRequest,
  objectIdParams,
  opportunitiesQuery
} from '../models/elysia';
import { candidateCardPreview } from '../services/candidateCard';
import type { CandidateCardPreview } from '../services/candidateCard';
import { discoveryStatus, grantDiscovery, saveDiscoveryCard, withdrawDiscovery } from '../services/discovery';
import type { DiscoveryDto } from '../services/discovery';
import { setJobMatching, toRecruiterJobDto } from '../services/jobMatching';
import type { RecruiterJobPostingDto } from '../services/jobMatching';
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
// matching, by the operator's reviewers (services/matchingReviews.ts); and the
// feeds (services/matchFeeds.ts): the jobs proposed to a candidate, the
// anonymous cards of the candidates proposed for a recruiter's job. Every
// route is the signed-in account's own: none takes another account to read.
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
  });

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
  .use(reviews);

/**
 * The matching routes as createApp mounts them, the flag read when the app is
 * built: none while MATCHING is off (not even listed by /swagger), every one
 * once it is on. Typed as when on, so the client is typed against them
 */
export const matchingRoutes = (): typeof matches =>
  env.matchingEnabled ? matches : (new Elysia() as unknown as typeof matches);
