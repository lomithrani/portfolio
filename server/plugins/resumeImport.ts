import Elysia from 'elysia';
import { Domain } from '../models/database';
import { userLogged } from './userLogged';
import { DomainDoesNotExistError } from '../errors';
import { resumeImportRequest } from '../models/elysia';
import { assertResumeImportEnabled, getResumeImportStatus, importResume } from '../services/resumeImport';

// Résumé import (services/resumeImport.ts): Claude extracts experience drafts
// from a PDF résumé; nothing is saved here. Off (404) without ANTHROPIC_API_KEY.
export const resumeImport = new Elysia()
  .use(userLogged)
  .get('/experiences/import', ({ userId }) => getResumeImportStatus(userId), {
    detail: {
      summary: 'Whether résumé import is available, and how many imports are left'
    }
  })
  .post('/experiences/import', async ({ body, userId }) => {
    assertResumeImportEnabled();

    // Same rule as POST /experiences, which saves the drafts
    if (!(await Domain.exists({ admin: userId }))) throw new DomainDoesNotExistError('You do not own a domain');

    const { file, fileName } = body;
    // The tracing plugin copies the parsed body into the request span again
    // when the response is sent (the exporter drops it: instrumentation.ts);
    // the handler has its copy, so the span keeps a few bytes, not megabytes
    body.file = '';

    return await importResume(userId, file, fileName);
  },
    {
      body: resumeImportRequest,
      detail: {
        summary: 'Extract experience drafts from a PDF résumé (nothing is saved)'
      }
    })
