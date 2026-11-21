import {
	DEFAULT_JOB_MATCH_MIN_SCORE,
	JOB_MATCH_STEP_LIMITS,
	JOB_STATUS_LABELS,
	JOB_STEP_LIMITS,
	OPEN_JOB_STATUS,
	PERFECT_JOB_CRITERIA,
	WORKFLOW_LIMITS,
	isValidDomainName,
	newWorkflowStep,
	normalizeDomainName,
	openWorkflowSteps,
	plural,
	stepManifest,
	type JobStatus,
	type PerfectJobCriterion,
	type WorkflowProblem,
	type WorkflowStep,
	type WorkflowStepManifest,
	type WorkflowStepStatus
} from 'portfolio-common';
import { isConsentProblem } from './apiErrors';
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
	/**
	 * The caller (a recruiter) and the owner are both interested in one of the caller's jobs
	 * (matching): as the API answered it, read with journeyMatch
	 */
	match?: unknown;
}

/**
 * The mutual interest of matching between the owner and the signed-in visitor that leads into the
 * journey (the journey's `match`): the job they are both interested in, as the owner said yes to it,
 * when they both became interested (an ISO date: the journey's routes go through portfolioTextApi),
 * and whether the posting was edited since (each side keeps the version they said yes to)
 */
export interface JourneyMatch {
	_id: string;
	job: { _id: string; title: string; company?: string };
	matchedAt: string;
	changed?: true;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * The journey's mutual interest, from what the API answered (`match`); undefined without one, or
 * when it is not one (an id that is not one, a job without a title, a date that is not one): the
 * page then shows the journey as anyone's
 */
export const journeyMatch = (value: unknown): JourneyMatch | undefined => {
	if (!value || typeof value !== 'object') return undefined;
	const { _id, job, matchedAt, changed } = value as Record<string, unknown>;
	const {
		_id: jobId,
		title,
		company
	} = (job && typeof job === 'object' ? job : {}) as Record<string, unknown>;
	if (typeof _id !== 'string' || !OBJECT_ID.test(_id)) return undefined;
	if (typeof jobId !== 'string' || !OBJECT_ID.test(jobId)) return undefined;
	if (typeof title !== 'string' || !title.trim()) return undefined;
	if (typeof matchedAt !== 'string' || Number.isNaN(Date.parse(matchedAt))) return undefined;
	return {
		_id,
		job: {
			_id: jobId,
			title,
			...(typeof company === 'string' && company.trim() ? { company } : {})
		},
		matchedAt,
		...(changed === true ? { changed: true as const } : {})
	};
};

/** A step's `view` says it is held by a mutual interest (the job step's job, the frozen score) */
const heldByMutualInterest = (view: unknown): boolean =>
	!!view && typeof view === 'object' && (view as { matched?: unknown }).matched === true;

const STEP_STATUSES: readonly WorkflowStepStatus[] = ['pending', 'succeeded', 'failed'];

/**
 * The journey as anyone signed out stands in it, from GET /workflow/domains/:domainName asked
 * without a session (the Hire page's server render): each step's id, type, status and the
 * settings its type shows visitors, never a `view` or `own`, which are a signed-in caller's.
 * null when the answer is not a journey
 */
export const anonymousJourney = (answer: unknown): Journey | null => {
	const steps = (answer as { steps?: unknown } | null | undefined)?.steps;
	if (!Array.isArray(steps)) return null;
	const kept = steps.flatMap((entry): JourneyStep[] => {
		const { id, type, status, config } = (entry ?? {}) as Record<string, unknown>;
		const known = STEP_STATUSES.find((name) => name === status);
		if (typeof id !== 'string' || typeof type !== 'string' || !known) return [];
		return [{ id, type, status: known, ...(config === undefined ? {} : { config }) }];
	});
	return kept.length === steps.length ? { steps: kept } : null;
};

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
		const phrase = stepPhrase(step);
		const own = title(step);
		return own ? m.summary.titled(phrase, own) : phrase;
	});
	return phrases.length === 1 ? m.summary.one(phrases[0]) : m.summary.many(phrases);
};

/** A step's type label as a phrase in a sentence: "book a meeting" */
const stepPhrase = (step: { type: string }): string => {
	const label = stepName(step);
	return label.charAt(0).toLowerCase() + label.slice(1);
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
 * somewhere: how many steps come before it, and what its type says alone and after them.
 * `closed`: that step cannot be done now (a meeting nobody can book): the owner takes no meeting
 * requests online, and the steps before it wait until they do
 */
export const journeyIntro = (
	ownerName: string,
	goal: { before: number; alone: string; after: string } | undefined,
	{ closed = false }: { closed?: boolean } = {}
): string => {
	if (closed && goal && goal.before > 0) return m.intro.closedSteps(ownerName);
	if (!goal || closed) return m.intro.noGoal(ownerName);
	if (goal.before === 0) return goal.alone;
	return m.intro.stepsFirst(ownerName, goal.before, goal.after);
};

/**
 * What going through the steps takes, from each step's effort (undefined for a type this version
 * does not have): about how many minutes in all, one at least, and what to have at hand, each need
 * once, in the order the steps first need it
 */
export const journeyEffort = <Need extends string>(
	efforts: readonly ({ minutes: number; needs?: readonly Need[] } | undefined)[]
): { minutes: number; needs: Need[] } => ({
	minutes: Math.max(
		1,
		efforts.reduce((sum, effort) => sum + (effort?.minutes ?? 0), 0)
	),
	needs: [...new Set(efforts.flatMap((effort) => effort?.needs ?? []))]
});

/**
 * The Hire page's description (its meta description, and a shared link's): what the journey
 * asks, from the steps as anyone signed out gets them (the server's render), with `minutes`, about
 * how long they take (journeyEffort). `steps` undefined: the journey is not known (left to the
 * browser), the page's description names no step. `closed`: the step the journey leads to cannot
 * be done now (a meeting nobody can book: the owner's calendar has no meeting type), so no step is
 * named nor a duration said, only that the owner takes no meeting requests online
 */
export const journeyDescription = (
	ownerName: string,
	steps: readonly { type: string }[] | undefined,
	minutes: number,
	{ closed = false }: { closed?: boolean } = {}
): string => {
	if (!steps) return m.description.unknown(ownerName);
	if (steps.length === 0 || closed) return m.description.none(ownerName);
	const phrases = steps.map(stepPhrase);
	return plural(
		minutes,
		m.description.steps.one(ownerName, phrases),
		m.description.steps.other(ownerName, phrases, minutes)
	);
};

/**
 * The line under a step's name. `describe`: what the step's type says to a visitor it is open
 * to (what it asks, or what they did there); undefined for a type this version does not show.
 * `describeFailed`: what it says to a visitor who did not pass it, when it says more than that.
 * A step a mutual interest of matching holds (the job step's job, the frozen score) says what it
 * holds even while a step before it is to do (a note): it is done for the visitor, only not open yet;
 * the job step whose job does not hold now (on hold, or the terms in force not accepted) says what
 * brings it back, as it does once open
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
	if (state === 'locked' && heldByMutualInterest(step.view)) {
		return describe(step, step.status === 'succeeded' ? 'done' : 'open');
	}
	if (state === 'locked') return index === 1 ? m.completeStepAbove : m.completeStepsAbove;
	if (state === 'failed') return describeFailed?.(step) ?? m.notPassed;
	return describe(step, state);
};

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The message of a 422 the API answered (`{ type: 'validation', property, message }`) */
const validationMessage = (value: unknown): string =>
	value && typeof value === 'object' && 'message' in value ? bodyText(value.message) : '';

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
	const text = bodyText(value) || validationMessage(value);
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

/** The job a visitor shared, as the job step's `view` has it */
export interface JourneyJob {
	_id: string;
	/** The version shared's (the posting's own when the step keeps no version of it) */
	title: string;
	company?: string;
	/** The posting's, now */
	status: JobStatus;
	/**
	 * When the version the step keeps was shared (an ISO date: the journey's routes go through
	 * portfolioTextApi); unset when the step keeps none, a pick from before versions were kept,
	 * which is shared again to go on
	 */
	sharedAt?: string;
	/**
	 * The posting differs from the version shared, in anything the owner reads of it (its status
	 * aside): the owner still reads, and the job match still scores, the version shared
	 */
	outdated?: true;
	/**
	 * The job the owner and the visitor are both interested in (matching): the step holds it, the
	 * version the owner said yes to (`sharedAt`: when they both became interested), while their mutual
	 * interest lasts, and the visitor cannot share another. Never `outdated`
	 */
	matched?: true;
}

/** The job shared, from a job step's `view`; undefined when there is none (or it is not one) */
export const pickedJob = (view: unknown): JourneyJob | undefined => {
	const job = (view as { job?: Partial<Record<keyof JourneyJob, unknown>> } | null | undefined)
		?.job;
	if (!job || typeof job !== 'object') return undefined;
	const { _id, title, company, status, sharedAt, outdated } = job;
	if (typeof _id !== 'string' || typeof title !== 'string') return undefined;
	if (typeof status !== 'string' || !Object.hasOwn(JOB_STATUS_LABELS, status)) return undefined;
	const shared = typeof sharedAt === 'string' && !Number.isNaN(Date.parse(sharedAt));
	const matched = heldByMutualInterest(view);
	return {
		_id,
		title,
		...(typeof company === 'string' && company ? { company } : {}),
		status: status as JobStatus,
		...(shared ? { sharedAt } : {}),
		...(shared && outdated === true && !matched ? { outdated: true as const } : {}),
		...(matched ? { matched: true as const } : {})
	};
};

/** Only an open posting can be picked (the API's rule) */
export const isPickable = (job: { status: JobStatus }): boolean => job.status === OPEN_JOB_STATUS;

/**
 * The job shared whose new version the recruiter can share (the posting is open and differs from
 * the version shared); undefined otherwise
 */
export const outdatedShare = (view: unknown): JourneyJob | undefined => {
	const job = pickedJob(view);
	return job?.outdated && isPickable(job) ? job : undefined;
};

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

/**
 * The line under the job step's name: what it asks, or the job shared (and whether it changed
 * since). A job picked that does not hold: not open anymore, picked before versions were kept (to
 * share again), or open and shared but the recruiter has not accepted the terms in force. The job
 * of a mutual interest (matching) is said so, and, while it does not hold, what brings it back: the
 * posting open again (on hold: a job filled, closed or back to draft ends the mutual interest), or
 * the terms in force accepted; never to pick another, which the step does not take while it lasts
 */
export const jobStepNote = (view: unknown, state: 'open' | 'done'): string => {
	const job = pickedJob(view);
	if (state === 'done' && job?.matched) return m.job.matched(jobLine(job));
	if (state === 'done' && job) return job.outdated ? m.job.outdated(jobLine(job)) : jobLine(job);
	if (!job) return m.job.ask;
	if (!isPickable(job)) {
		const status = JOB_STATUS_LABELS[job.status];
		return job.matched ? m.job.matchedNotOpen(job.title, status) : m.job.notOpen(job.title, status);
	}
	// The job of a mutual interest is never shared again: open, only the terms are missing
	return job.sharedAt || job.matched ? m.job.acceptTerms(job.title) : m.job.shareAgain(job.title);
};

/**
 * The 409 of the job step's submit while a mutual interest of matching with the owner holds the
 * step with its job (JOB_OF_MUTUAL_INTEREST of server/protocol.ts, which a test keeps the same): an
 * English constant, whatever the visitor's language
 */
export const JOB_OF_MUTUAL_INTEREST = 'This step holds the job you are both interested in';

/**
 * What a failed pick (or share of a new version) means. `reload-jobs`: the recruiter's jobs are
 * not what the step shows (it loads them again); `terms`: the recruiter has not accepted the terms
 * in force (a 422 on `consent`: the step asks for them, TermsAcceptance); `matched`: a mutual
 * interest with the owner (matching) was made since the page loaded, and its job holds the step (the
 * page loads the journey again, which shows that job in place of the form). A 429: the journey
 * scores the jobs shared, and this recruiter shared as many as a day allows
 * (JOB_STEP_LIMITS.scoredSharesPerDay)
 */
export const pickJobFailure = (
	status: number | undefined,
	value: unknown
): StepFailure<'reload-jobs' | 'terms' | 'matched'> => {
	if (isNetworkFailure(value)) return submitFailure(status, value);
	const text = bodyText(value);
	switch (status) {
		case 422:
			// Else what is wrong with the job (a job saved under older rules): the API says it in the
			// visitor's language
			return isConsentProblem(status, value)
				? { message: m.job.pick.terms, kind: 'terms' }
				: { message: validationMessage(value) || m.job.pick.failed, kind: 'error' };
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
			// A mutual interest with the owner was made since the page loaded: the journey, loaded
			// again, shows its job, which holds the step
			if (text === JOB_OF_MUTUAL_INTEREST) {
				return { message: m.job.pick.mutualInterest, kind: 'matched' };
			}
			return /open job/i.test(text)
				? { message: m.job.pick.notOpen, kind: 'reload-jobs' }
				: { message: m.job.pick.journeyChanged, kind: 'changed' };
		case 429:
			return { message: m.job.pick.tooMany(JOB_STEP_LIMITS.scoredSharesPerDay), kind: 'error' };
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
 * when the step is done. Never while a mutual interest holds the step with its job: it takes no
 * other job then, whatever the address asks
 */
export const asksForAnotherJob = (view: unknown, address: URL): boolean => {
	const asked = requestedJob(address);
	const picked = pickedJob(view);
	return asked !== null && !picked?.matched && picked?._id !== asked;
};

// --- After a mutual interest (matching) -------------------------------------------------

/**
 * The job of the mutual interest as the journey's job step shows it (`view.matched`), and whether
 * the step holds it now (succeeded: the posting open, the terms in force accepted); undefined on a
 * journey whose job step does not show it (or that has none: the invitation names the job)
 */
export const mutualInterestJob = (
	journey: Journey
): { job: JourneyJob; holds: boolean } | undefined => {
	for (const step of journey.steps) {
		if (step.type !== 'job') continue;
		const job = pickedJob(step.view);
		if (job?.matched) return { job, holds: step.status === 'succeeded' };
	}
	return undefined;
};

/**
 * What is left of the journey for the recruiter of a mutual interest (the Hire page's banner), in
 * the order to read: while the job step does not hold the job of the mutual interest, what brings it
 * back (the posting open again, or the terms in force accepted); then, on a journey that leads to a
 * meeting they can book (`booking`: not when nobody can book, which the page says itself), the steps
 * still to do before it, by their type's phrase and the name of their own a step has (`title`: a
 * note's), or that nothing else is asked. Nothing once the meeting is booked: its step says so. The
 * steps the mutual interest holds (the job, the frozen score) are never counted as to do
 */
export const mutualInterestNext = (
	journey: Journey,
	{
		booking,
		title = () => undefined
	}: { booking: boolean; title?: (step: JourneyStep) => string | undefined }
): string[] => {
	const goal = goalStepIndex(journey.steps);
	const before = goal === -1 ? journey.steps : journey.steps.slice(0, goal);
	const lines: string[] = [];
	const held = mutualInterestJob({ steps: before });
	const jobWaits = held !== undefined && !held.holds;
	if (held && jobWaits) {
		lines.push(
			isPickable(held.job)
				? m.match.jobTerms
				: m.match.jobNotOpen(JOB_STATUS_LABELS[held.job.status])
		);
	}
	if (!booking || goal === -1 || journey.steps[goal].status === 'succeeded') return lines;
	// A step not passed stops the journey there: that step says why
	if (before.some((step) => step.status === 'failed')) return lines;
	const left = before
		.filter((step) => step.status !== 'succeeded' && !heldByMutualInterest(step.view))
		.map((step) => {
			const phrase = stepPhrase(step);
			const own = title(step);
			return own ? m.summary.titled(phrase, own) : phrase;
		});
	if (left.length > 0) lines.push(m.match.left(left));
	else if (!jobWaits) lines.push(m.match.bookNow);
	return lines;
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
	/**
	 * The job the owner and the visitor are both interested in (matching): its score is the one it
	 * had then, frozen while their mutual interest lasts (nothing to check again, nothing to change)
	 */
	matched?: true;
	/** When it was frozen, with `matched`: when they both became interested (an ISO date) */
	frozenAt?: string;
}

/** The services public transport times can come from (the API's COMMUTE_TRANSIT) */
export const TRANSIT_PROVIDERS = ['here', 'transitous'] as const;
export type TransitProvider = (typeof TRANSIT_PROVIDERS)[number];

/** The public transport service of an answer, when it is one this client knows */
export const transitProvider = (value: unknown): TransitProvider | undefined =>
	TRANSIT_PROVIDERS.find((name) => name === value);

/** A score out of 100, as the API gives it (a whole number from 0 to 100) */
export const isScore = (value: unknown): value is number => {
	const { min, max } = JOB_MATCH_STEP_LIMITS.minScore;
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
};

const OUTCOMES: readonly JobMatchCriterion['outcome'][] = ['match', 'partial', 'miss', 'unknown'];

/**
 * The outcome of each criterion, from a list the API gave (a job match step's `view`, an anonymous
 * card's outcomes, a job proposed to the candidate): an entry that is not one is left out, as is a
 * criterion given twice (the first stays)
 */
export const jobMatchCriteria = (value: unknown): JobMatchCriterion[] => {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	return value.flatMap((entry): JobMatchCriterion[] => {
		const { criterion, outcome, notStated, dealBreaker } = (
			entry && typeof entry === 'object' ? entry : {}
		) as Record<string, unknown>;
		const known = PERFECT_JOB_CRITERIA.find((name) => name === criterion);
		const result = OUTCOMES.find((name) => name === outcome);
		if (!known || !result || seen.has(known)) return [];
		seen.add(known);
		return [
			{
				criterion: known,
				outcome: result,
				notStated: notStated === true,
				dealBreaker: dealBreaker === true
			}
		];
	});
};

/** The score, from a job match step's `view`; undefined when there is none (or it is not one) */
export const jobMatch = (view: unknown): JobMatch | undefined => {
	if (!view || typeof view !== 'object') return undefined;
	const { score, minScore, job, criteria, transit, frozenAt } = view as Record<string, unknown>;
	const provider = transitProvider(transit);
	const { _id, title } = (job && typeof job === 'object' ? job : {}) as Record<string, unknown>;
	if (!isScore(score) || !isScore(minScore)) return undefined;
	if (typeof _id !== 'string' || typeof title !== 'string') return undefined;
	const matched = heldByMutualInterest(view);
	const frozen =
		matched && typeof frozenAt === 'string' && !Number.isNaN(Date.parse(frozenAt))
			? frozenAt
			: undefined;
	return {
		score,
		minScore,
		job: { _id, title },
		...(Array.isArray(criteria) ? { criteria: jobMatchCriteria(criteria) } : {}),
		...(provider ? { transit: provider } : {}),
		...(matched ? { matched: true as const } : {}),
		...(frozen ? { frozenAt: frozen } : {})
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

/**
 * The line under the job match step's name: what it asks, or the score of the job picked (the one
 * it had when both became interested, for the job of a mutual interest)
 */
export const jobMatchNote = (step: { config?: unknown; view?: unknown }): string => {
	const match = jobMatch(step.view);
	if (match) {
		if (!passesJobMatch(match)) {
			return m.jobMatch.under(match.job.title, match.score, match.minScore);
		}
		return match.matched
			? m.jobMatch.frozen(match.job.title, match.score)
			: m.jobMatch.passed(match.job.title, match.score);
	}
	const minScore = jobMatchMinScore(step.config);
	return minScore === undefined ? m.jobMatch.ask : m.jobMatch.askMin(minScore);
};

/**
 * Who reads how a job does on a candidate's criteria: the recruiter whose job it is (on the
 * candidate's page for recruiters, beside an anonymous card), or the candidate themselves
 */
export type OutcomeAudience = 'recruiter' | 'candidate';

/** How a criterion's outcome reads in the details of a score, for `audience` */
export const jobMatchOutcomeText = (
	entry: JobMatchCriterion,
	audience: OutcomeAudience = 'recruiter'
): string => {
	if (entry.outcome === 'unknown') return m.jobMatch.outcome.unknown;
	if (entry.notStated) {
		return audience === 'recruiter'
			? m.jobMatch.outcome.notStated
			: m.jobMatch.outcome.notStatedForCandidate;
	}
	return m.jobMatch.outcome[entry.outcome];
};
