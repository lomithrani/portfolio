// The hiring journey of a portfolio: the steps a visitor (a recruiter) goes through on its Hire
// page, in the order its owner chose. A step opens once every step before it succeeded.
//
// A journey is a list of steps, each with an id of its own, a type and that type's settings. A
// step type is defined in three places, one per workspace, under the same `type` name (see
// docs/WORKFLOW_STEPS.md, "Adding a step"):
//   - its manifest here (common/models/workflowSteps/): name, kind, settings and their rules,
//     shared by the API (which enforces them) and the owner's editor (which shows them);
//   - its behaviour in the API (server/services/workflowSteps/): where a visitor stands on it,
//     and what they can submit;
//   - its components in the client (client/src/lib/components/hire/steps/): what the visitor
//     sees, and the settings form of the owner's editor.
//
// Steps are stored with ids because a visitor's progress is kept per step id: reordering a
// journey keeps it, and the same type can appear more than once (two notes to read). The order of
// the list is the path today; branches (where to go when a step succeeded or failed) will be
// transitions between step ids, added to this shape.
import { workflowMessages as m } from './workflow.messages';
import { WORKFLOW_STEP_MANIFESTS } from './workflowSteps';

/**
 * requirement: something the visitor does (pick a job, read a note), which gives nothing by
 * itself and only opens the steps after it; access: what the journey leads to (book a meeting)
 */
export type WorkflowStepKind = 'requirement' | 'access';

/**
 * Where a visitor stands on a step: pending (not done yet, or to do again), succeeded (the next
 * step opens) or failed (the journey stops there; no step fails yet, branches will use it)
 */
export const WORKFLOW_STEP_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

/** The settings of a step as stored, or what is wrong with the ones given */
export type StepConfigResult<Config> =
	| { ok: true; config: Config }
	/** `field`: the setting the message is about, when it is about one */
	| { ok: false; message: string; field?: string };

/** What a step type is, for the API and the owner's editor alike */
export interface WorkflowStepManifest<Config extends object = Record<string, never>> {
	/** Unique name of the type: lowercase letters, digits and hyphens */
	type: string;
	kind: WorkflowStepKind;
	/**
	 * The step's name, for the owner and the visitor. A message, like `description`: a manifest
	 * gives it with a getter, so it is in the language in use when it is read
	 */
	label: string;
	/** What the step asks of visitors, as the owner reads it when choosing the steps */
	description: string;
	/** How many steps of this type a journey can have; any number when unset */
	max?: number;
	/**
	 * The step types a step of this type needs earlier in the journey: it works on what the
	 * visitor did there (the job match scores the job picked in the job step)
	 */
	needs?: readonly string[];
	/** The settings a new step of this type starts with (possibly incomplete: the owner fills them in) */
	defaultConfig(): Config;
	/**
	 * Checks and normalises the settings of a step (trimmed text...). Only what it returns is
	 * stored: unknown keys are dropped
	 */
	parseConfig(raw: unknown): StepConfigResult<Config>;
}

/** A step of a journey, as the owner saves it (PUT /workflow) and as it is stored */
export interface WorkflowStepInput {
	/** Unique in the journey (WORKFLOW_LIMITS.stepId); progress is kept under it */
	id: string;
	type: string;
	/** The type's settings; `{}` when it has none */
	config?: unknown;
}

/** A step whose settings went through its manifest's parseConfig */
export interface WorkflowStep {
	id: string;
	type: string;
	config: object;
}

export const WORKFLOW_LIMITS = {
	/** Steps per journey */
	steps: 12,
	/** A step id, also a key of the progress stored per step: no dot, no dollar */
	stepId: /^[a-z0-9][a-z0-9-]{0,39}$/,
	/** A step type name */
	stepType: /^[a-z][a-z0-9-]{0,39}$/
} as const;

/** The journey of a portfolio whose owner never chose one: anyone can book a meeting */
export const DEFAULT_WORKFLOW_STEPS: readonly WorkflowStep[] = [
	{ id: 'meeting', type: 'meeting', config: {} }
];

/** The manifest of a step type; undefined for a type this version does not have */
export const stepManifest = (type: string): WorkflowStepManifest<object> | undefined =>
	Object.hasOwn(WORKFLOW_STEP_MANIFESTS, type) ? WORKFLOW_STEP_MANIFESTS[type] : undefined;

/** Every step type, in the order the editor offers them */
export const stepManifests = (): WorkflowStepManifest<object>[] =>
	Object.values(WORKFLOW_STEP_MANIFESTS);

/** A new step of `type` with its default settings and an id no step of `steps` has */
export function newWorkflowStep(type: string, steps: readonly { id: string }[]): WorkflowStep {
	const taken = new Set(steps.map((step) => step.id));
	let id = type;
	for (let n = 2; taken.has(id); n++) id = `${type}-${n}`;
	return { id, type, config: stepManifest(type)?.defaultConfig() ?? {} };
}

/** Why a journey cannot be saved, and the step it is about when it is about one */
export interface WorkflowProblem {
	message: string;
	stepId?: string;
	/** The setting of that step the message is about */
	field?: string;
}

export type WorkflowResult =
	| { ok: true; steps: WorkflowStep[] }
	| { ok: false; problem: WorkflowProblem };

/**
 * The journey as it is stored (each step's settings normalised by its type), or the first rule
 * it breaks: too many steps, an id used twice or not an id, a type this version does not have,
 * too many steps of one type, settings their type refuses, a step without a step it needs
 * before it, or a requirement step with no access step after it (it would open nothing)
 */
export function parseWorkflow(input: readonly WorkflowStepInput[]): WorkflowResult {
	const fail = (problem: WorkflowProblem): WorkflowResult => ({ ok: false, problem });
	if (input.length > WORKFLOW_LIMITS.steps) {
		return fail({ message: m.tooManySteps(WORKFLOW_LIMITS.steps) });
	}
	const steps: WorkflowStep[] = [];
	const ids = new Set<string>();
	const perType = new Map<string, number>();
	for (const step of input) {
		if (typeof step.id !== 'string' || !WORKFLOW_LIMITS.stepId.test(step.id)) {
			return fail({ message: m.invalidStepId });
		}
		if (ids.has(step.id)) return fail({ message: m.duplicateStepId, stepId: step.id });
		ids.add(step.id);
		const manifest = typeof step.type === 'string' ? stepManifest(step.type) : undefined;
		if (!manifest) {
			return fail({ message: m.unknownStepType, stepId: step.id });
		}
		const count = (perType.get(manifest.type) ?? 0) + 1;
		perType.set(manifest.type, count);
		if (manifest.max !== undefined && count > manifest.max) {
			return fail({
				message:
					manifest.max === 1
						? m.usedOnce(manifest.label)
						: m.usedTooOften(manifest.label, manifest.max),
				stepId: step.id
			});
		}
		const settings = step.config ?? {};
		if (typeof settings !== 'object' || Array.isArray(settings)) {
			return fail({ message: m.settingsNotAnObject, stepId: step.id });
		}
		const parsed = manifest.parseConfig(settings);
		if (!parsed.ok) {
			return fail({ message: parsed.message, stepId: step.id, field: parsed.field });
		}
		steps.push({ id: step.id, type: manifest.type, config: parsed.config });
	}
	for (const [index, step] of steps.entries()) {
		const manifest = stepManifest(step.type);
		const missing = manifest?.needs?.find(
			(type) => !steps.slice(0, index).some((earlier) => earlier.type === type)
		);
		if (!manifest || missing === undefined) continue;
		const needed = stepManifest(missing)?.label ?? missing;
		return fail({
			message: steps.some((other) => other.type === missing)
				? m.neededStepBelow(manifest.label, needed)
				: m.neededStepMissing(manifest.label, needed),
			stepId: step.id
		});
	}
	const lastAccess = steps.findLastIndex((step) => stepManifest(step.type)?.kind === 'access');
	const dangling = steps.find(
		(step, index) => stepManifest(step.type)?.kind === 'requirement' && index > lastAccess
	);
	if (dangling) {
		const label = stepManifest(dangling.type)?.label ?? dangling.type;
		// The journey has a step it could open, above it: the fix is to move, not to add
		const above = lastAccess === -1 ? undefined : stepManifest(steps[lastAccess].type)?.label;
		const access = stepManifests()
			.filter((manifest) => manifest.kind === 'access')
			.map((manifest) => manifest.label);
		return fail({
			message: above
				? m.opensNothingMove(label, above)
				: m.opensNothingAdd(label, access),
			stepId: dangling.id
		});
	}
	return { ok: true, steps };
}

/**
 * Which steps a visitor can act on, from their status on each, in order: a step is open when
 * every step before it succeeded. The same rule for the API (which enforces it) and the page
 */
export const openWorkflowSteps = (statuses: readonly WorkflowStepStatus[]): boolean[] => {
	let open = true;
	return statuses.map((status) => {
		const stepOpen = open;
		if (status !== 'succeeded') open = false;
		return stepOpen;
	});
};
