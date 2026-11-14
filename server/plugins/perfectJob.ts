import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { perfectJobRequest } from '../models/elysia';
import { perfectJobDto, perfectJobOf, savePerfectJob } from '../services/perfectJobs';
import type { PerfectJobDto } from '../services/perfectJobs';

// The perfect job of the signed-in account (services/perfectJobs.ts): what
// they look for in a job, criterion by criterion, each with its importance.
// Only its owner reads it: recruiters get a score (the hiring journey's
// "Match the perfect job" step), never the criteria.
export const perfectJob = new Elysia()
  .use(userLogged)
  .get('/perfect-job', async ({ userId }): Promise<PerfectJobDto> => perfectJobDto(await perfectJobOf(userId)), {
    detail: { summary: 'Your perfect job: the criteria you rated' }
  })
  .put(
    '/perfect-job',
    async ({ userId, body }): Promise<PerfectJobDto> => perfectJobDto(await savePerfectJob(userId, body.criteria)),
    {
      body: perfectJobRequest,
      detail: { summary: 'Replace the criteria of your perfect job (each with its importance)' }
    }
  );
