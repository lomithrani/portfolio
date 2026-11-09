import Elysia from 'elysia';
import type { WorkflowStepType } from 'portfolio-common';
import { userLogged } from './userLogged';
import { domainNameParams, workflowJobRequest, workflowRequest } from '../models/elysia';
import { sessionUserId } from '../services/session';
import {
  journeyFor,
  journeySteps,
  pickJourneyJob,
  portfolioOwner,
  saveJourneySteps
} from '../services/workflows';
import type { JourneyDto } from '../services/workflows';

// The hiring journey of a portfolio (services/workflows.ts): the owner
// chooses its steps; visitors see them, signed in with where they stand, and
// complete them one after the other. The booking routes of the meeting step
// (plugins/appointments.ts) check the steps before it.

interface WorkflowDto {
  steps: { type: WorkflowStepType }[];
}

const toWorkflowDto = (steps: WorkflowStepType[]): WorkflowDto => ({ steps: steps.map((type) => ({ type })) });

const workflowOwner = new Elysia()
  .use(userLogged)
  .get('/workflow', async ({ userId }): Promise<WorkflowDto> => toWorkflowDto(await journeySteps(userId)), {
    detail: { summary: 'Your hiring journey: the steps visitors go through on your Hire page, in order' }
  })
  .put(
    '/workflow',
    async ({ userId, body }): Promise<WorkflowDto> =>
      toWorkflowDto(await saveJourneySteps(userId, body.steps.map((step) => step.type))),
    {
      body: workflowRequest,
      detail: { summary: 'Replace the steps of your hiring journey (each step once, a step it opens after each requirement)' }
    }
  )
  .put(
    '/workflow/domains/:domainName/job',
    async ({ userId, params: { domainName }, body: { jobId } }): Promise<JourneyDto> =>
      pickJourneyJob(domainName, userId, jobId),
    {
      params: domainNameParams,
      body: workflowJobRequest,
      detail: { summary: "Job step: pick one of your open job postings for a portfolio's hiring journey" }
    }
  );

const workflowPublic = new Elysia()
  // Anyone can see the steps; a signed-in caller also gets where they stand
  .get(
    '/workflow/domains/:domainName',
    async ({ params: { domainName }, request }): Promise<JourneyDto> =>
      journeyFor(await portfolioOwner(domainName), await sessionUserId(request)),
    {
      params: domainNameParams,
      detail: { summary: "A portfolio's hiring journey, with the signed-in caller's progress" }
    }
  );

export const workflows = new Elysia().use(workflowPublic).use(workflowOwner);
