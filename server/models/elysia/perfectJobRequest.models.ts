import { t } from 'elysia';

// PUT /perfect-job: the criteria the owner rated. Their rules are
// portfolio-common's parsePerfectJob, checked by the route, which keeps what
// it knows and drops the rest. Unknown, not an object schema: Elysia would
// turn a string or an array into an object before checking it (see
// workflowRequest); parsePerfectJob refuses anything else
export const perfectJobRequest = t.Object({
  criteria: t.Unknown()
});
