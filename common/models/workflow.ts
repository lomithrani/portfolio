// The hiring journey of a portfolio: the steps a visitor (a recruiter) goes through on its Hire
// page, in order. A step opens once every step before it is done. The portfolio's owner picks
// the steps (PUT /workflow); a portfolio whose owner never did has DEFAULT_WORKFLOW_STEPS
// (booking a meeting only, open to anyone).

/** Every step a journey can have; each one at most once */
export const WORKFLOW_STEP_TYPES = ['job', 'meeting'] as const;
export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];

/**
 * requirement: something the visitor does (pick a job), which gives nothing by itself and only
 * opens the steps after it; access: what the journey leads to (book a meeting)
 */
export type WorkflowStepKind = 'requirement' | 'access';

export interface WorkflowStepInfo {
	kind: WorkflowStepKind;
	/** The step's name, for the owner and the visitor */
	label: string;
	/** What the step asks of visitors, as the owner reads it when choosing the steps */
	description: string;
}

export const WORKFLOW_STEPS: Record<WorkflowStepType, WorkflowStepInfo> = {
	job: {
		kind: 'requirement',
		label: 'Select or create a job',
		description:
			'Recruiters pick one of their open job descriptions, or write a new one, before going further. You find it in the meeting invitation.'
	},
	meeting: {
		kind: 'access',
		label: 'Book a meeting',
		description:
			'Recruiters book a slot in your calendar, with the meeting types of the Appointments tab.'
	}
};

/** A step of a journey (an object: room for per-step settings) */
export interface WorkflowStepInput {
	type: WorkflowStepType;
}

/** The journey of a portfolio whose owner never chose one: anyone can book a meeting */
export const DEFAULT_WORKFLOW_STEPS: readonly WorkflowStepType[] = ['meeting'];

export const isWorkflowStepType = (value: unknown): value is WorkflowStepType =>
	(WORKFLOW_STEP_TYPES as readonly unknown[]).includes(value);

/**
 * Why a journey cannot be saved (null when it can): a step used twice, or a requirement step
 * with no access step after it (it would open nothing)
 */
export function workflowStepsProblem(steps: readonly WorkflowStepType[]): string | null {
	if (new Set(steps).size !== steps.length) return 'Each step can be used only once.';
	const lastAccess = steps.findLastIndex((type) => WORKFLOW_STEPS[type].kind === 'access');
	const dangling = steps.find(
		(type, index) => WORKFLOW_STEPS[type].kind === 'requirement' && index > lastAccess
	);
	if (dangling) {
		const access = WORKFLOW_STEP_TYPES.filter((type) => WORKFLOW_STEPS[type].kind === 'access')
			.map((type) => `“${WORKFLOW_STEPS[type].label}”`)
			.join(' or ');
		return `“${WORKFLOW_STEPS[dangling].label}” must come before a step it opens: add ${access} after it.`;
	}
	return null;
}
