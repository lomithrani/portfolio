import { t } from "elysia";
import { WORKFLOW_STEP_TYPES } from "portfolio-common";

const objectId = t.String({ pattern: '^[0-9a-fA-F]{24}$' });

// t.UnionEnum defaults to its first value, which Elysia fills in for a
// missing field: a step without a type must be refused, not become a job step
const workflowStepType = t.UnionEnum(WORKFLOW_STEP_TYPES, { default: undefined });

// PUT /workflow: the owner's whole journey, in order. Each type at most once,
// and the other rules of portfolio-common's workflowStepsProblem, checked by
// the route
export const workflowRequest = t.Object({
  steps: t.Array(t.Object({ type: workflowStepType }), { maxItems: WORKFLOW_STEP_TYPES.length })
});

// PUT /workflow/domains/:domainName/job: one of the caller's job postings
export const workflowJobRequest = t.Object({
  jobId: objectId
});

// A portfolio's name, as the visitor's page has it (normalised by the route)
export const domainNameParams = t.Object({
  domainName: t.String({ minLength: 1, maxLength: 253 })
});
