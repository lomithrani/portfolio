import { t } from "elysia";
import { WORKFLOW_LIMITS } from "portfolio-common";

// A step id is also a key of the progress stored per visitor: its pattern
// (no dot, no dollar, no underscore) is checked before any route uses one
const stepId = t.String({ pattern: WORKFLOW_LIMITS.stepId.source });

// PUT /workflow: the owner's whole journey, in order. The step types, their
// settings and the other rules are portfolio-common's parseWorkflow, checked
// by the route. `config` is whatever the step's type takes: its manifest
// keeps what it knows and drops the rest. Unknown, not an object schema:
// Elysia would turn a string or an array into an object before checking it
// (a 1 MB string into a million keys); parseWorkflow refuses anything else
export const workflowRequest = t.Object({
  steps: t.Array(
    t.Object({
      id: stepId,
      type: t.String({ pattern: WORKFLOW_LIMITS.stepType.source }),
      config: t.Optional(t.Unknown())
    }),
    { maxItems: WORKFLOW_LIMITS.steps }
  )
});

// POST /workflow/domains/:domainName/steps/:stepId: what the visitor submits
// on a step, checked by the step's type (services/workflowSteps/)
export const workflowStepRequest = t.Object({
  input: t.Unknown()
});

// A portfolio's name, as the visitor's page has it (normalised by the route)
const domainName = t.String({ minLength: 1, maxLength: 253 });

export const domainNameParams = t.Object({ domainName });

export const workflowStepParams = t.Object({ domainName, stepId });
