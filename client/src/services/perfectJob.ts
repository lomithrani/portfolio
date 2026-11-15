import {
	DEFAULT_IMPORTANCE,
	PERFECT_JOB_CRITERIA,
	PERFECT_JOB_CRITERION_LABELS,
	WORK_DAYS_PER_WEEK,
	parsePerfectJob,
	type CommuteMode,
	type ContractType,
	type GeoPlace,
	type Importance,
	type ManagementRole,
	type PerfectJob,
	type PerfectJobCriterion,
	type PerfectJobProblem,
	type SeniorityLevel,
	type TravelFrequency,
	type WorkMode,
	type WorkingTimeArrangement
} from 'portfolio-common';
import { m } from './perfectJob.messages';

// The owner's perfect job (portfolio-common's perfectJob.ts), as the admin tab "Perfect job"
// edits it (GET, PUT /perfect-job). Pure helpers: the form the tab keeps (every criterion, on or
// off, numbers as typed), what it sends, and what is wrong with it. The rules are
// portfolio-common's parsePerfectJob, the ones the API enforces.

// --- The form ------------------------------------------------------------------------------

/** What every criterion of the form has: whether it counts, and how much */
export interface CriterionForm {
	enabled: boolean;
	importance: Importance;
	dealBreaker: boolean;
}

/** Every criterion, with what was typed for it (numbers as text); only the enabled ones are sent */
export interface PerfectJobForm {
	titles: CriterionForm & { keywords: string[] };
	seniority: CriterionForm & { levels: SeniorityLevel[] };
	management: CriterionForm & { role: ManagementRole | '' };
	workMode: CriterionForm & { modes: WorkMode[]; minRemoteDays: string };
	cities: CriterionForm & { places: string[] };
	/** The time accepted a week is typed as hours and minutes */
	commute: CriterionForm & { from: string; modes: CommuteMode[]; hours: string; minutes: string };
	contractTypes: CriterionForm & { types: ContractType[] };
	workingTime: CriterionForm & { arrangements: WorkingTimeArrangement[]; maxHoursPerWeek: string };
	rttDays: CriterionForm & { min: string };
	pay: CriterionForm & { perYear: string; perDay: string };
	skills: CriterionForm & { names: string[] };
	avoidedSkills: CriterionForm & { names: string[] };
	travel: CriterionForm & { max: TravelFrequency | '' };
}

const rating = (stored?: { importance: Importance; dealBreaker?: true }): CriterionForm => ({
	enabled: stored !== undefined,
	importance: stored?.importance ?? DEFAULT_IMPORTANCE,
	dealBreaker: stored?.dealBreaker === true
});

const numberText = (value: number | undefined): string =>
	value === undefined ? '' : String(value);

/** A number of minutes as the form shows it: '5' hours and '30' minutes; blanks for none */
const hoursAndMinutes = (total: number | undefined): { hours: string; minutes: string } => {
	if (total === undefined) return { hours: '', minutes: '' };
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	return { hours: hours ? String(hours) : '', minutes: minutes ? String(minutes) : '' };
};

/**
 * The minutes typed as hours and minutes: NaN when neither was typed or one of them is not a
 * whole number (the rules then say what is expected)
 */
export const typedDuration = (hours: string, minutes: string): number => {
	const [h, m] = [typedNumber(hours), typedNumber(minutes)];
	return h === undefined && m === undefined ? Number.NaN : (h ?? 0) * 60 + (m ?? 0);
};

/** The form showing `criteria` (the stored ones: none for an owner who never saved) */
export const perfectJobForm = (criteria: PerfectJob = {}): PerfectJobForm => ({
	titles: { ...rating(criteria.titles), keywords: [...(criteria.titles?.keywords ?? [])] },
	seniority: { ...rating(criteria.seniority), levels: [...(criteria.seniority?.levels ?? [])] },
	management: { ...rating(criteria.management), role: criteria.management?.role ?? '' },
	workMode: {
		...rating(criteria.workMode),
		modes: [...(criteria.workMode?.modes ?? [])],
		minRemoteDays: numberText(criteria.workMode?.minRemoteDays)
	},
	cities: { ...rating(criteria.cities), places: [...(criteria.cities?.places ?? [])] },
	commute: {
		...rating(criteria.commute),
		from: criteria.commute?.from ?? '',
		modes: [...(criteria.commute?.modes ?? [])],
		...hoursAndMinutes(criteria.commute?.maxMinutesPerWeek)
	},
	contractTypes: {
		...rating(criteria.contractTypes),
		types: [...(criteria.contractTypes?.types ?? [])]
	},
	workingTime: {
		...rating(criteria.workingTime),
		arrangements: [...(criteria.workingTime?.arrangements ?? [])],
		maxHoursPerWeek: numberText(criteria.workingTime?.maxHoursPerWeek)
	},
	rttDays: { ...rating(criteria.rttDays), min: numberText(criteria.rttDays?.min) },
	pay: {
		...rating(criteria.pay),
		perYear: numberText(criteria.pay?.perYear),
		perDay: numberText(criteria.pay?.perDay)
	},
	skills: { ...rating(criteria.skills), names: [...(criteria.skills?.names ?? [])] },
	avoidedSkills: {
		...rating(criteria.avoidedSkills),
		names: [...(criteria.avoidedSkills?.names ?? [])]
	},
	travel: { ...rating(criteria.travel), max: criteria.travel?.max ?? '' }
});

/**
 * A number as typed ("70 000", "70000"): undefined when nothing was typed, NaN when it is not a
 * whole number (the rules then say what is expected)
 */
export const typedNumber = (text: string): number | undefined => {
	const digits = text.replace(/\s/g, '');
	if (!digits) return undefined;
	return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
};

/**
 * What the form sends (PUT /perfect-job's `criteria`): the criteria that are on, as
 * parsePerfectJob reads them. Not checked: a setting left empty is sent empty
 */
export const perfectJobCriteria = (form: PerfectJobForm): Record<string, unknown> => {
	const values: Record<PerfectJobCriterion, Record<string, unknown>> = {
		titles: { keywords: form.titles.keywords },
		seniority: { levels: form.seniority.levels },
		management: { role: form.management.role },
		workMode: {
			modes: form.workMode.modes,
			minRemoteDays: typedNumber(form.workMode.minRemoteDays)
		},
		cities: { places: form.cities.places },
		// Its place is the API's to find: none is sent
		commute: {
			from: form.commute.from,
			modes: form.commute.modes,
			maxMinutesPerWeek: typedDuration(form.commute.hours, form.commute.minutes)
		},
		contractTypes: { types: form.contractTypes.types },
		workingTime: {
			arrangements: form.workingTime.arrangements,
			maxHoursPerWeek: typedNumber(form.workingTime.maxHoursPerWeek)
		},
		// Required: nothing typed is not a number either
		rttDays: { min: typedNumber(form.rttDays.min) ?? Number.NaN },
		pay: { perYear: typedNumber(form.pay.perYear), perDay: typedNumber(form.pay.perDay) },
		skills: { names: form.skills.names },
		avoidedSkills: { names: form.avoidedSkills.names },
		travel: { max: form.travel.max }
	};
	const criteria: Record<string, unknown> = {};
	for (const criterion of PERFECT_JOB_CRITERIA) {
		const { enabled, importance, dealBreaker } = form[criterion];
		if (!enabled) continue;
		criteria[criterion] = {
			importance,
			...(dealBreaker ? { dealBreaker: true } : {}),
			...values[criterion]
		};
	}
	return criteria;
};

/** The form checked with the API's rules: the criteria as they would be stored, and what is wrong */
export const checkPerfectJob = (
	form: PerfectJobForm
): { criteria: PerfectJob; problems: PerfectJobProblem[] } =>
	parsePerfectJob(perfectJobCriteria(form));

/** The message about `field` (`pay.perYear`, or a whole criterion: `pay`), when there is one */
export const problemAt = (
	problems: readonly PerfectJobProblem[],
	field: string
): string | undefined => problems.find((problem) => problem.field === field)?.message;

/** The criterion a problem is about */
export const problemCriterion = (problem: PerfectJobProblem): PerfectJobCriterion | undefined => {
	const [name] = problem.field.split('.');
	return PERFECT_JOB_CRITERIA.find((criterion) => criterion === name);
};

/**
 * What the API refused (a 422 of PUT /perfect-job, whose `property` is `criteria` or
 * `criteria.<criterion>.<setting>`); null when the answer is not about the criteria
 */
export const savedPerfectJobProblem = (value: unknown): PerfectJobProblem | null => {
	if (!value || typeof value !== 'object') return null;
	const { property, message } = value as { property?: unknown; message?: unknown };
	if (typeof property !== 'string' || typeof message !== 'string' || !message.trim()) return null;
	const path = /^criteria(?:\.(.+))?$/.exec(property);
	if (!path) return null;
	return { field: path[1] ?? 'criteria', message: message.trim() };
};

/**
 * Both forms send the same criteria: nothing to save. What was typed for a criterion that is off
 * is not sent, and is no change
 */
export const sameCriteria = (a: PerfectJobForm, b: PerfectJobForm): boolean =>
	JSON.stringify(perfectJobCriteria(a)) === JSON.stringify(perfectJobCriteria(b));

/**
 * The form after a save: the criteria as the API stored them (lists cleaned, settings that do
 * not apply dropped), and what was typed for the criteria that are off, which were not sent
 */
export const savedForm = (form: PerfectJobForm, stored: PerfectJob): PerfectJobForm => {
	const next = perfectJobForm(stored);
	const kept = Object.fromEntries(
		PERFECT_JOB_CRITERIA.filter((criterion) => !form[criterion].enabled).map((criterion) => [
			criterion,
			form[criterion]
		])
	);
	return { ...next, ...structuredClone(kept) };
};

// --- The commute -----------------------------------------------------------------------------

/** Whether the API computes travel times, and by which modes (GET /perfect-job's `commute`) */
export interface CommuteAvailability {
	enabled: boolean;
	modes: CommuteMode[];
	/** The service asked for public transport times, when `modes` has them */
	transit?: 'here' | 'transitous';
}

/** '45 minutes', '1 hour', '2 h 30' */
export const formatDuration = (minutes: number): string => {
	const whole = Math.round(minutes);
	if (whole < 60) return m.duration.minutes(whole);
	const [hours, rest] = [Math.floor(whole / 60), whole % 60];
	return rest === 0
		? m.duration.hours(hours)
		: m.duration.hoursAndMinutes(hours, String(rest).padStart(2, '0'));
};

/**
 * What a time accepted a week means for a job: how long the way can be, one way, going to the
 * office every day or once a week; '' when no time is typed yet
 */
export const commuteBudgetHint = (hours: string, minutes: string): string => {
	const total = typedDuration(hours, minutes);
	if (!Number.isFinite(total) || total <= 0) return '';
	const perTrip = (days: number) => formatDuration(total / (2 * days));
	return m.commuteBudget(perTrip(WORK_DAYS_PER_WEEK), perTrip(1));
};

/**
 * The place the API found for the address typed, while it is still the address saved; undefined
 * for an address not saved yet (it is looked up on save)
 */
export const commutePlace = (form: PerfectJobForm, saved: PerfectJob): GeoPlace | undefined => {
	const stored = saved.commute;
	return stored?.place && stored.from === form.commute.from.replace(/\s+/g, ' ').trim()
		? stored.place
		: undefined;
};

// --- What the criteria weigh -----------------------------------------------------------------

/**
 * How much of the score each criterion that is on counts for, in percent (its importance out of
 * the total)
 */
export const criterionShares = (
	form: PerfectJobForm
): Partial<Record<PerfectJobCriterion, number>> => {
	const enabled = PERFECT_JOB_CRITERIA.filter((criterion) => form[criterion].enabled);
	const total = enabled.reduce((sum, criterion) => sum + form[criterion].importance, 0);
	return Object.fromEntries(
		enabled.map((criterion) => [criterion, Math.round((form[criterion].importance / total) * 100)])
	);
};

/** What a job is scored on, in one sentence (the tab's summary) */
export const perfectJobSummary = (form: PerfectJobForm): string => {
	const enabled = PERFECT_JOB_CRITERIA.filter((criterion) => form[criterion].enabled);
	if (enabled.length === 0) return m.summary.none;
	// The ones that matter most first
	const labels = [...enabled]
		.sort((a, b) => form[b].importance - form[a].importance)
		.map((criterion) => PERFECT_JOB_CRITERION_LABELS[criterion]);
	const dealBreakers = enabled.filter((criterion) => form[criterion].dealBreaker).length;
	const scoredOn = m.summary.scoredOn(labels);
	return dealBreakers === 0 ? scoredOn : `${scoredOn} ${m.summary.dealBreakers(dealBreakers)}`;
};
