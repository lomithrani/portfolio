import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { jobImportRequest } from '../models/elysia';
import { getJobImportStatus, importJobDescription } from '../services/jobImport';

// Job description import (services/jobImport.ts): Claude extracts a job
// posting draft from a PDF; nothing is saved here (the client saves it
// through POST /jobs). Both routes need a recruiter space (403); POST is off
// (404) without ANTHROPIC_API_KEY, and 402 once the plan's imports are used.
export const jobImport = new Elysia()
  .use(userLogged)
  .get('/jobs/import', ({ userId }) => getJobImportStatus(userId), {
    detail: {
      summary: 'Whether job description import is available, and how many imports are left'
    }
  })
  .post('/jobs/import', async ({ body, userId }) => {
    const { file, fileName } = body;
    // The tracing plugin copies the parsed body into the request span again
    // when the response is sent (dropped as the span ends: instrumentation.ts);
    // the handler has its copy, so the span keeps a few bytes, not megabytes
    body.file = '';

    return await importJobDescription(userId, file, fileName);
  },
    {
      body: jobImportRequest,
      detail: {
        summary: 'Extract a job posting draft from a PDF job description (nothing is saved)'
      }
    })
