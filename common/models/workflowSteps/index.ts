import type { WorkflowStepManifest } from '../workflow';
import { jobStep } from './job';
import { meetingStep } from './meeting';
import { noteStep } from './note';

// Every step type of the hiring journey, in the order the owner's editor offers them. A new type
// is added here, in the API's registry (server/services/workflowSteps/index.ts) and in the
// client's (client/src/lib/components/hire/steps/index.ts): docs/WORKFLOW_STEPS.md
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each manifest has its own settings type
const manifests: WorkflowStepManifest<any>[] = [noteStep, jobStep, meetingStep];

export const WORKFLOW_STEP_MANIFESTS: Record<string, WorkflowStepManifest<object>> =
	Object.fromEntries(manifests.map((manifest) => [manifest.type, manifest]));

export { NOTE_STEP_LIMITS } from './note';
export type { NoteStepConfig } from './note';
