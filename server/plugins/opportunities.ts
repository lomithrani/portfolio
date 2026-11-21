import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { objectIdParams } from '../models/elysia';
import { readableJobPosting } from '../services/jobAccess';
import type { SharedJobPostingDto } from '../services/jobAccess';

// What a signed-in account reads of what was shared with it, outside the recruiter space: the job
// posting a recruiter picked on its hiring journey, linked from the meeting invitation (the web
// client's /opportunities/:id). Session only (401), and 404 to anyone the posting was not shared
// with, like an unknown id: who may read it is services/jobAccess.ts. Never names the recruiter.
export const opportunities = new Elysia()
  .use(userLogged)
  .get(
    '/opportunities/jobs/:id',
    async ({ userId, params: { id } }): Promise<SharedJobPostingDto> => readableJobPosting(userId, id),
    {
      params: objectIdParams,
      detail: {
        summary:
          "A job posting shared with you (`access`): one a recruiter picked on your hiring journey ('journey'), one you and its recruiter are both interested in ('match'), one proposed to you through matching ('feed'), or your own ('recruiter'); 404 for any other id; 429 over the feeds' reads of an hour"
      }
    }
  );
