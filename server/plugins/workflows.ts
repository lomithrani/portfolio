import Elysia from 'elysia';
import type { WorkflowStep } from 'portfolio-common';
import { userLogged } from './userLogged';
import {
  domainNameParams,
  stepSuggestionRequest,
  workflowRequest,
  workflowStepParams,
  workflowStepRequest
} from '../models/elysia';
import { sessionUserId } from '../services/session';
import { stepSuggestionsEnabled, suggestStep } from '../services/stepSuggestions';
import { journeyFor, journeySteps, portfolioOwner, saveJourneySteps, submitStep } from '../services/workflows';
import type { JourneyDto } from '../services/workflows';

// The hiring journey of a portfolio (services/workflows.ts): the owner
// chooses its steps; visitors see them, signed in with where they stand, and
// go through them one after the other. What a step is (its settings, what a
// visitor submits on it) belongs to its type (services/workflowSteps/): the
// routes are the same for every type. The booking routes of the meeting step
// (plugins/appointments.ts) check the steps before it.

/** The owner's journey as they edit it: every step with its settings */
interface WorkflowDto {
  steps: WorkflowStep[];
}

const workflowOwner = new Elysia()
  .use(userLogged)
  .get('/workflow', async ({ userId }): Promise<WorkflowDto> => ({ steps: await journeySteps(userId) }), {
    detail: { summary: 'Your hiring journey: the steps visitors go through on your Hire page, in order' }
  })
  .put(
    '/workflow',
    async ({ userId, body }): Promise<WorkflowDto> => ({ steps: await saveJourneySteps(userId, body.steps) }),
    {
      body: workflowRequest,
      detail: { summary: 'Replace the steps of your hiring journey (ids, types and settings, in order)' }
    }
  )
  // A step the owner misses, filed as a feature request in the project's
  // GitHub repository (services/stepSuggestions.ts); off without a token
  .get('/workflow/step-suggestions', () => ({ enabled: stepSuggestionsEnabled() }), {
    detail: { summary: 'Whether this server takes step suggestions' }
  })
  .post('/workflow/step-suggestions', ({ userId, body }) => suggestStep(userId, body), {
    body: stepSuggestionRequest,
    detail: { summary: "Suggest a step for the hiring journey: filed as an issue in the project's GitHub repository" }
  })
  .post(
    '/workflow/domains/:domainName/steps/:stepId',
    async ({ userId, params: { domainName, stepId }, body: { input } }): Promise<JourneyDto> =>
      submitStep(domainName, userId, stepId, input),
    {
      params: workflowStepParams,
      // A JSON body, whatever the step takes: the request is never a "simple" cross-origin one
      body: workflowStepRequest,
      detail: { summary: "Submit a step of a portfolio's hiring journey (what `input` is depends on the step's type)" }
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
