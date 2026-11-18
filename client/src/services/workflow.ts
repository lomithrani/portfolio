import {
	APPLICABLE_JOB_STATUS,
	DEFAULT_JOB_MATCH_MIN_SCORE,
	JOB_MATCH_STEP_LIMITS,
	JOB_STATUS_LABELS,
	PERFECT_JOB_CRITERIA,
	WORKFLOW_LIMITS,
	isValidDomainName,
	newWorkflowStep,
	normalizeDomainName,
	openWorkflowSteps,
	stepManifest,
	type JobStatus,
	type PerfectJobCriterion,
	type WorkflowProblem,
	type WorkflowStep,
	type WorkflowStepManifest,
	type WorkflowStepStatus
} from 'portfolio-common';
import { isNetworkFailure, networkError } from './recruiter';
import { m } from './workflow.messages';

// The hiring journey of a portfolio (portfolio-common's workflow.ts): the steps its owner
// chooses in the admin tab (GET/PUT /workflow), and the visitor's way through them on the Hire
// page (GET /workflow/domains/:domainName, POST .../steps/:stepId). Pure helpers: the API calls
// stay in the components, and what a step type shows is its entry in the client's registry
// (components/hire/steps/), which uses the helpers of its type below.

// --- Shapes ----------------------------------------------------------------------------

/** A step of a journey, as the caller stands on it */
export interface JourneyStep {
	id: string;
	type: string;
	status: WorkflowStepStatus;
	/** The step's settings its type shows to visitors, when it shows any */
	config?: unknown;
	/** What the step's type tells the visitor about their own progress */
	view?: unknown;
}

/** GET /workflow/domains/:domainName: the steps, and where the caller stands */
export interface Journey {
	steps: JourneyStep[];
	/** The caller owns the portfolio: a preview, where no step is locked */
	own?: true;
}

// --- The owner's editor ------------------------------------------------------------------

const isAccess = (type: string) => stepManifest(type)?.kind === 'access';

/**
 * The steps with a new one of `type`. A step that only opens the ones after it goes before
 * the last step the journey leads to (after it, it would open nothing); any other goes last.
 * `reserved`: ids the new step must not take either (the saved journey's: a step removed and
 * added again is a new one, which starts without the progress of the old one)
 */
export const addStep = (
	steps: readonly WorkflowStep[],
	type: string,
	reserved: readonly { id: string }[] = []
): WorkflowStep[] => {
	const step = newWorkflowStep(type, [...steps, ...reserved]);
	const goal = steps.findLastIndex((existing) => isAccess(existing.type));
	const at = isAccess(type) || goal === -1 ? steps.length : goal;
	return [...steps.slice(0, at), step, ...steps.slice(at)];
};

export const removeStep = (steps: readonly WorkflowStep[], id: string): WorkflowStep[] =>
	steps.filter((step) => step.id !== id);

/** The steps with the step `id` one place up (-1) or down (1); unchanged at either end */
export const moveStep = (
	steps: readonly WorkflowStep[],
	id: string,
	by: -1 | 1
): WorkflowStep[] => {
	const from = steps.findIndex((step) => step.id === id);
	const to = from + by;
	const moved = [...steps];
	if (from === -1 || to < 0 || to >= steps.length) return moved;
	[moved[from], moved[to]] = [moved[to], moved[from]];
	return moved;
};

/** The steps with the settings of the step `id` replaced */
export const withStepConfig = (
	steps: readonly WorkflowStep[],
	id: string,
	config: object
): WorkflowStep[] => steps.map((step) => (step.id === id ? { ...step, config } : step));

/** Why no step of this type can be added to `steps`; null when one can */
export const addStepProblem = (
	steps: readonly { type: string }[],
	manifest: Pick<WorkflowStepManifest<object>, 'type' | 'max'>
): string | null => {
	if (steps.length >= WORKFLOW_LIMITS.steps) {
		return m.addStep.journeyFull(WORKFLOW_LIMITS.steps);
	}
	if (manifest.max === undefined) return null;
	const used = steps.filter((step) => step.type === manifest.type).length;
	if (used < manifest.max) return null;
	return manifest.max === 1 ? m.addStep.usedOnce : m.addStep.usedMax(manifest.max);
};

/** Same value, whatever the order of an object's keys (settings are small plain data) */
const sameValue = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const keys = Object.keys(a);
	return (
		keys.length === Object.keys(b).length &&
		keys.every(
			(key) =>
				Object.hasOwn(b, key) &&
				sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
		)
	);
};

/** Same steps, in the same order, with the same settings */
export const sameSteps = (a: readonly WorkflowStep[], b: readonly WorkflowStep[]): boolean =>
	a.length === b.length &&
	a.every(
		(step, index) =>
			step.id === b[index].id &&
			step.type === b[index].type &&
			sameValue(step.config, b[index].config)
	);

/**
 * How a step is called: the name of its own when it has one (`title`: a note's), else its
 * type's label
 */
export const stepName = (step: { type: string }, title?: string): string =>
	title || (stepManifest(step.type)?.label ?? m.unknownStepName);

/**
 * What recruiters will go through, in one sentence (the editor's summary). `title`: the name
 * of its own a step has, when it has one
 */
export const journeySummary = <Step extends { type: string }>(
	steps: readonly Step[],
	title: (step: Step) => string | undefined = () => undefined
): string => {
	if (steps.length === 0) return m.summary.empty;
	const phrases = steps.map((step) => {
		const label = stepName(step);
		const phrase = label.charAt(0).toLowerCase() + label.slice(1);
		const own = title(step);
		return own ? m.summary.titled(phrase, own) : phrase;
	});
	return phrases.length === 1 ? m.summary.one(phrases[0]) : m.summary.many(phrases);
};

/**
 * What is wrong with the journey, from the API's 422 on PUT /workflow: the step and the setting
 * its `property` names (`steps.<index>`, `steps.<index>.config.<field>`) among the steps sent;
 * null when the answer is not about the steps
 */
export const savedWorkflowProblem = (
	value: unknown,
	sent: readonly { id: string }[]
): WorkflowProblem | null => {
	if (!value || typeof value !== 'object') return null;
	const { property, message } = value as { property?: unknown; message?: unknown };
	if (typeof property !== 'string' || typeof message !== 'string' || !message.trim()) return null;
	const path = /^steps(?:\.(\d+)(?:\.config\.(.+))?)?$/.exec(property);
	if (!path) return null;
	const step = path[1] === undefined ? undefined : sent[Number(path[1])];
	return {
		message: message.trim(),
		...(step ? { stepId: step.id } : {}),
		...(step && path[2] ? { field: path[2] } : {})
	};
};

// --- The visitor's journey ---------------------------------------------------------------

/**
 * done: succeeded (it can be visited again); open: the next one to do; failed: not passed, the
 * journey stops there; locked: a step before it did not succeed. The owner previews: nothing is
 * locked for them
 */
export type StepState = 'done' | 'open' | 'failed' | 'locked';

export const stepStates = (journey: Journey): StepState[] => {
	if (journey.own) return journey.steps.map(() => 'open');
	const open = openWorkflowSteps(journey.steps.map((step) => step.status));
	return journey.steps.map((step, index) => {
		if (!open[index]) return 'locked';
		if (step.status === 'succeeded') return 'done';
		return step.status === 'failed' ? 'failed' : 'open';
	});
};

/** The step the journey leads to (its last `access` step); -1 when it leads nowhere */
export const goalStepIndex = (steps: readonly { type: string }[]): number =>
	steps.findLastIndex((step) => isAccess(step.type));

/**
 * The step shown unfolded on arrival: the first one to do, else the last (the goal). The owner's
 * preview opens the step the journey leads to: the ones before it ask nothing of the owner.
 * -1 when there is none
 */
export const activeStepIndex = (journey: Journey): number => {
	if (journey.own) return goalStepIndex(journey.steps);
	const firstToDo = journey.steps.findIndex((step) => step.status !== 'succeeded');
	return firstToDo === -1 ? journey.steps.length - 1 : firstToDo;
};

/**
 * The journey is only the step it leads to: the Hire page is that step alone (the booking page,
 * as before journeys)
 */
export const isBareJourney = (journey: Journey): boolean =>
	journey.steps.length === 1 && isAccess(journey.steps[0].type);

/**
 * What the Hire page says under its title. `goal`: the step the journey leads to, when it leads
 * somewhere: how many steps come before it, and what its type says alone and after them
 */
export const journeyIntro = (
	ownerName: string,
	goal: { before: number; alone: string; after: string } | undefined
): string => {
	if (!goal) return m.intro.noGoal(ownerName);
	if (goal.before === 0) return goal.alone;
	return m.intro.stepsFirst(ownerName, goal.before, goal.after);
};

/**
 * The line under a step's name. `describe`: what the step's type says to a visitor it is open
 * to (what it asks, or what they did there); undefined for a type this version does not show.
 * `describeFailed`: what it says to a visitor who did not pass it, when it says more than that
 */
export const stepNote = (
	journey: Journey,
	index: number,
	state: StepState,
	describe: ((step: JourneyStep, state: 'open' | 'done') => string) | undefined,
	describeFailed?: (step: JourneyStep) => string
): string => {
	const step = journey.steps[index];
	if (!describe) return m.stepUnavailable;
	// The owner reads what the step asks of recruiters
	if (journey.own) return stepManifest(step.type)?.description ?? '';
	if (state === 'locked') return index === 1 ? m.completeStepAbove : m.completeStepsAbove;
	if (state === 'failed') return describeFailed?.(step) ?? m.notPassed;
	return describe(step, state);
};

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * What a failed submit of a step (POST .../steps/:stepId) means, whatever the step.
 * `signed-out`: the session ended; `locked`: a step before it is not done (anymore); `changed`:
 * the journey is not the one the page shows (the page loads it again for these three)
 */
export interface StepFailure<Kind extends string = never> {
	message: string;
	kind: 'signed-out' | 'locked' | 'changed' | 'error' | Kind;
}

/**
 * The journey's own refusals are told from their text (the API's messages, whose status a step's
 * refusal can share): anything else a step's type refused is shown as the API says it (its 4xx
 * messages are written for the visitor; a 422 names what is wrong with the input)
 */
export const submitFailure = (status: number | undefined, value: unknown): StepFailure => {
	if (isNetworkFailure(value)) return { message: networkError(), kind: 'error' };
	const text =
		bodyText(value) ||
		(value && typeof value === 'object' && 'message' in value ? bodyText(value.message) : '');
	const asTold: StepFailure = { message: text || m.submit.failed, kind: 'error' };
	switch (status) {
		case 401:
			return { message: m.submit.signedOut, kind: 'signed-out' };
		case 403:
			if (/your own hiring journey/i.test(text)) {
				return { message: m.submit.ownJourney, kind: 'error' };
			}
			return /earlier steps/i.test(text)
				? { message: m.completeStepsAbove, kind: 'locked' }
				: asTold;
		case 404:
			return /^domain not found$/i.test(text)
				? { message: m.submit.noPortfolio, kind: 'error' }
				: asTold;
		case 409:
			return /journey changed|nothing can be submitted/i.test(text)
				? { message: m.submit.journeyChanged, kind: 'changed' }
				: asTold;
		case 400:
		case 422:
			return asTold;
		default:
			return { message: m.submit.failed, kind: 'error' };
	}
};

// --- Job step ----------------------------------------------------------------------------

/** The job a visitor picked, as the job step's `view` has it */
export interface JourneyJob {
	_id: string;
	title: string;
	company?: string;
	status: JobStatus;
}

/** The job picked, from a job step's `view`; undefined when there is none (or it is not one) */
export const pickedJob = (view: unknown): JourneyJob | undefined => {
	const job = (view as { job?: Partial<Record<keyof JourneyJob, unknown>> } | null | undefined)
		?.job;
	if (!job || typeof job !== 'object') return undefined;
	const { _id, title, company, status } = job;
	if (typeof _id !== 'string' || typeof title !== 'string') return undefined;
	if (typeof status !== 'string' || !Object.hasOwn(JOB_STATUS_LABELS, status)) return undefined;
	return {
		_id,
		title,
		...(typeof company === 'string' && company ? { company } : {}),
		status: status as JobStatus
	};
};

/** Only an open posting can be picked (the API's rule) */
export const isPickable = (job: { status: JobStatus }): boolean =>
	job.status === APPLICABLE_JOB_STATUS;

/** Open postings first, each group in the order the API listed them (most recently updated) */
export const sortJobChoices = <T extends { status: JobStatus }>(jobs: readonly T[]): T[] => [
	...jobs.filter(isPickable),
	...jobs.filter((job) => !isPickable(job))
];

/**
 * The posting selected when the step shows: the one asked for in the address (back from creating
 * it), else the one picked before, else the only open one; null when none of them is pickable
 */
export const initialJobChoice = (
	jobs: readonly { _id: string; status: JobStatus }[],
	requested: string | null | undefined,
	picked: string | null | undefined
): string | null => {
	const pickable = jobs.filter(isPickable);
	for (const id of [requested, picked]) {
		if (id && pickable.some((job) => job._id === id)) return id;
	}
	return pickable.length === 1 ? pickable[0]._id : null;
};

/** "Senior Engineer · Acme" */
export const jobLine = (job: { title: string; company?: string }): string =>
	job.company ? `${job.title} · ${job.company}` : job.title;

/** The line under the job step's name: what it asks, or the job picked */
export const jobStepNote = (view: unknown, state: 'open' | 'done'): string => {
	const job = pickedJob(view);
	if (state === 'done' && job) return jobLine(job);
	if (job) return m.job.notOpen(job.title, JOB_STATUS_LABELS[job.status]);
	return m.job.ask;
};

/**
 * What a failed pick means. `reload-jobs`: the recruiter's jobs are not what the step shows
 * (it loads them again); `terms`: the recruiter has not accepted the terms in force (a 422 on
 * `consent`: the step asks for them, TermsAcceptance)
 */
export const pickJobFailure = (
	status: number | undefined,
	value: unknown
): StepFailure<'reload-jobs' | 'terms'> => {
	if (isNetworkFailure(value)) return submitFailure(status, value);
	const text = bodyText(value);
	switch (status) {
		case 422:
			return value &&
				typeof value === 'object' &&
				'property' in value &&
				value.property === 'consent'
				? { message: m.job.pick.terms, kind: 'terms' }
				: { message: m.job.pick.failed, kind: 'error' };
		case 401:
			return { message: m.job.pick.signedOut, kind: 'signed-out' };
		case 403:
			return /recruiter space/i.test(text)
				? { message: m.job.pick.noSpace, kind: 'reload-jobs' }
				: submitFailure(status, value);
		case 404:
			return /job posting/i.test(text)
				? { message: m.job.pick.gone, kind: 'reload-jobs' }
				: submitFailure(status, value);
		case 409:
			return /open job/i.test(text)
				? { message: m.job.pick.notOpen, kind: 'reload-jobs' }
				: { message: m.job.pick.journeyChanged, kind: 'changed' };
		default:
			return { message: m.job.pick.failed, kind: 'error' };
	}
};

// --- Creating a job from the journey -----------------------------------------------------

/** The parameter of /recruiter/jobs/new naming the portfolio whose journey to go back to */
export const JOURNEY_PARAM = 'journey';
/** The parameter of the Hire page naming the job just created, to select it */
export const JOB_PARAM = 'job';

/** The portfolio of a `?journey=` parameter, normalised; null when it is not a portfolio name */
export const journeyReturnDomain = (param: string | null | undefined): string | null => {
	const name = normalizeDomainName(param ?? '');
	return name && isValidDomainName(name) ? name : null;
};

/** The job id of a `?job=` parameter; null when it is not one */
export const requestedJobId = (param: string | null | undefined): string | null =>
	param && /^[0-9a-f]{24}$/i.test(param) ? param : null;

/** The job an address of the Hire page asks for (`?job=`, back from writing it); null without one */
export const requestedJob = (address: URL): string | null =>
	requestedJobId(address.searchParams.get(JOB_PARAM));

/**
 * The address asks for a job other than the one picked: the job step shows, on that job, even
 * when the step is done
 */
export const asksForAnotherJob = (view: unknown, address: URL): boolean => {
	const asked = requestedJob(address);
	return asked !== null && pickedJob(view)?._id !== asked;
};

// --- Note step ---------------------------------------------------------------------------

/** A note's title and text, from the step's settings (the owner's, or as visitors get them) */
export const noteContent = (config: unknown): { title: string; text: string } => {
	const { title, text } = (config && typeof config === 'object' ? config : {}) as Record<
		string,
		unknown
	>;
	return {
		title: typeof title === 'string' ? title : '',
		text: typeof text === 'string' ? text : ''
	};
};

// --- Job match step ----------------------------------------------------------------------

/** How a job does on one criterion of the owner's perfect job, as the visitor is told */
export interface JobMatchCriterion {
	criterion: PerfectJobCriterion;
	/** `unknown`: it could not be computed (a travel time), and does not count in the score */
	outcome: 'match' | 'partial' | 'miss' | 'unknown';
	/** The job description does not say what the criterion reads */
	notStated: boolean;
	/** A deal-breaker of the owner's that the job does not match: the score is 0 */
	dealBreaker: boolean;
}

/** The score of the visitor's job, as the job match step's `view` has it */
export interface JobMatch {
	/** Out of 100 */
	score: number;
	minScore: number;
	job: { _id: string; title: string };
	/** Only when the owner shows them */
	criteria?: JobMatchCriterion[];
	/** The service this site asks for public transport times, to credit with the commute */
	transit?: TransitProvider;
}

/** The services public transport times can come from (the API's COMMUTE_TRANSIT) */
export const TRANSIT_PROVIDERS = ['here', 'transitous'] as const;
export type TransitProvider = (typeof TRANSIT_PROVIDERS)[number];

const isScore = (value: unknown): value is number => {
	const { min, max } = JOB_MATCH_STEP_LIMITS.minScore;
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
};

const OUTCOMES: readonly JobMatchCriterion['outcome'][] = ['match', 'partial', 'miss', 'unknown'];

/** The score, from a job match step's `view`; undefined when there is none (or it is not one) */
export const jobMatch = (view: unknown): JobMatch | undefined => {
	if (!view || typeof view !== 'object') return undefined;
	const { score, minScore, job, criteria, transit } = view as Record<string, unknown>;
	const provider = TRANSIT_PROVIDERS.find((name) => name === transit);
	const { _id, title } = (job && typeof job === 'object' ? job : {}) as Record<string, unknown>;
	if (!isScore(score) || !isScore(minScore)) return undefined;
	if (typeof _id !== 'string' || typeof title !== 'string') return undefined;
	const listed = Array.isArray(criteria)
		? criteria.flatMap((entry): JobMatchCriterion[] => {
				const { criterion, outcome, notStated, dealBreaker } = (entry ?? {}) as Record<
					string,
					unknown
				>;
				const known = PERFECT_JOB_CRITERIA.find((name) => name === criterion);
				const result = OUTCOMES.find((name) => name === outcome);
				if (!known || !result) return [];
				return [
					{
						criterion: known,
						outcome: result,
						notStated: notStated === true,
						dealBreaker: dealBreaker === true
					}
				];
			})
		: undefined;
	return {
		score,
		minScore,
		job: { _id, title },
		...(listed ? { criteria: listed } : {}),
		...(provider ? { transit: provider } : {})
	};
};

/** The minimum score of a job match step, from its settings (the owner's, or as visitors get them) */
export const jobMatchMinScore = (config: unknown): number | undefined => {
	const minScore = (config && typeof config === 'object' ? config : {}) as { minScore?: unknown };
	return isScore(minScore.minScore) ? minScore.minScore : undefined;
};

/** A job match step's settings as its form shows them (what is not a setting: the defaults) */
export const jobMatchSettings = (config: unknown): { minScore: unknown; showDetails: boolean } => {
	const source = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
	return {
		minScore: Object.hasOwn(source, 'minScore') ? source.minScore : DEFAULT_JOB_MATCH_MIN_SCORE,
		showDetails: source.showDetails === true
	};
};

/** The score reached the minimum */
export const passesJobMatch = (match: JobMatch): boolean => match.score >= match.minScore;

/** The line under the job match step's name: what it asks, or the score of the job picked */
export const jobMatchNote = (step: { config?: unknown; view?: unknown }): string => {
	const match = jobMatch(step.view);
	if (match) {
		return passesJobMatch(match)
			? m.jobMatch.passed(match.job.title, match.score)
			: m.jobMatch.under(match.job.title, match.score, match.minScore);
	}
	const minScore = jobMatchMinScore(step.config);
	return minScore === undefined ? m.jobMatch.ask : m.jobMatch.askMin(minScore);
};

/** How a criterion's outcome reads in the details of a score */
export const jobMatchOutcomeText = (entry: JobMatchCriterion): string => {
	if (entry.outcome === 'unknown') return m.jobMatch.outcome.unknown;
	if (entry.notStated) return m.jobMatch.outcome.notStated;
	return m.jobMatch.outcome[entry.outcome];
};
