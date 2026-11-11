import type { ServerStep } from './types';
import { jobStep } from './job';
import { meetingStep } from './meeting';
import { noteStep } from './note';

// The API's side of every step type of the hiring journey, under the name of
// its manifest in portfolio-common (common/models/workflowSteps/index.ts): a
// new type is added in both, and in the client's registry
// (docs/WORKFLOW_STEPS.md). tests/workflows.test.ts fails when the two
// registries differ.
// (any: each step has its own settings and data types)
const steps: ServerStep<any, any, any>[] = [noteStep, jobStep, meetingStep];

const SERVER_STEPS: Record<string, ServerStep> = Object.fromEntries(steps.map((step) => [step.type, step]));

/** What a step type does in the API; undefined for a type this version does not have */
export const serverStep = (type: string): ServerStep | undefined =>
  Object.hasOwn(SERVER_STEPS, type) ? SERVER_STEPS[type] : undefined;

/** Every step type the API has */
export const serverStepTypes = (): string[] => Object.keys(SERVER_STEPS);

export type { ServerStep, StepContext } from './types';
export type { JourneyJobDto, JobStepData, JobStepView } from './job';
export type { MeetingStepData } from './meeting';
export type { NoteStepData } from './note';
