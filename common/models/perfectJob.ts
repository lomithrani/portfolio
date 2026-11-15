// The perfect job of a portfolio's owner (a candidate): what they look for in a job, criterion by
// criterion, each with how much it matters to them. A recruiter's job posting is scored against it
// out of 100 (scorePerfectJob), which the "Match the perfect job" step of the hiring journey uses
// (workflowSteps/jobMatch.ts). The rules here are shared by the API (PUT /perfect-job, the step)
// and the owner's editor (the admin tab "Perfect job").
//
// A criterion reads the fields a recruiter fills in for a posting (jobPosting.ts): it says what
// the candidate wants there, never free text to interpret.
import {
	FR_CONTRACT_TYPES,
	FR_FORFAIT_JOURS_STANDARD_DAYS,
	FR_FULL_TIME_HOURS_PER_WEEK,
	JOB_LIMITS,
	SENIORITY_LEVELS,
	TRAVEL_FREQUENCIES,
	WORKING_TIME_ARRANGEMENTS,
	WORK_MODES,
	normalizeList
} from './jobPosting';
import { perfectJobMessages as m } from './perfectJob.messages';
import type {
	ContractType,
	JobFieldPath,
	JobPostingInput,
	NumberRange,
	SeniorityLevel,
	TravelFrequency,
	WorkMode,
	WorkingTimeArrangement
} from './jobPosting';

// ── Values ──────────────────────────────────────────────────

/** Every criterion, in the order the editor and a score's details list them */
export const PERFECT_JOB_CRITERIA = [
	'titles',
	'seniority',
	'management',
	'workMode',
	'cities',
	'commute',
	'contractTypes',
	'workingTime',
	'rttDays',
	'pay',
	'skills',
	'avoidedSkills',
	'travel'
] as const;
export type PerfectJobCriterion = (typeof PERFECT_JOB_CRITERIA)[number];

/** How much a criterion matters: its weight in the score */
export const IMPORTANCE_LEVELS = [1, 2, 3, 4, 5] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

/** The importance a criterion starts with in the editor */
export const DEFAULT_IMPORTANCE: Importance = 3;

/** manager: the job has direct reports; contributor: it has none */
export const MANAGEMENT_ROLES = ['manager', 'contributor'] as const;
export type ManagementRole = (typeof MANAGEMENT_ROLES)[number];

/**
 * How far under the pay asked a job stops matching at all: at 20% under or less the pay
 * criterion scores nothing, in between it scores in proportion
 */
export const PAY_TOLERANCE = 0.2;

/**
 * How a candidate travels to the office. transit: public transport, door to door; the travel
 * time by bike is estimated from the distance on foot (BIKE_METERS_PER_MINUTE)
 */
export const COMMUTE_MODES = ['transit', 'bike', 'car', 'walk'] as const;
export type CommuteMode = (typeof COMMUTE_MODES)[number];

/** Days a week a full-time job is worked: a job on site is a commute on each of them */
export const WORK_DAYS_PER_WEEK = 5;

/**
 * How far over the weekly travel time accepted a job stops matching at all: at 50% over or
 * more the commute scores nothing, in between it scores in proportion
 */
export const COMMUTE_TOLERANCE = 0.5;

/** The speed a bike ride is estimated at: 15 km/h */
export const BIKE_METERS_PER_MINUTE = 250;

/** How many hours over the weekly maximum a job stops matching at all (35 asked: 39 is half, 43 nothing) */
export const HOURS_TOLERANCE = 8;

export const PERFECT_JOB_LIMITS = {
	titles: 10,
	cities: 20,
	skills: 50,
	avoidedSkills: 30,
	/** Per item of the lists */
	listItem: JOB_LIMITS.listItem,
	minRemoteDays: JOB_LIMITS.remoteDaysPerWeek,
	maxHoursPerWeek: JOB_LIMITS.hoursPerWeek,
	rttDays: { min: 1, max: JOB_LIMITS.rttDaysPerYear.max },
	/** Gross pay asked, in whole euros */
	pay: { min: 1, max: JOB_LIMITS.pay.max },
	/** The address travelled from */
	address: 200,
	/** The name the address was found under */
	placeLabel: 300,
	/** Travel time accepted a week, there and back, in minutes (up to 50 hours) */
	commuteMinutesPerWeek: { min: 10, max: 3000 }
} as const;

// ── Shape ───────────────────────────────────────────────────

/** Where an address was found (WGS 84), and the name it was found under */
export interface GeoPlace {
	label: string;
	lat: number;
	lon: number;
}

/** What every criterion carries next to what it asks */
export interface CriterionRating {
	importance: Importance;
	/** A job that does not match the criterion at all scores 0, whatever the rest */
	dealBreaker?: true;
}

/**
 * The criteria a candidate rated, as PUT /perfect-job takes and stores them. A criterion that is
 * left out does not count.
 */
export interface PerfectJob {
	/** Job titles looked for: one of them must be in the posting's title, as whole words */
	titles?: CriterionRating & { keywords: string[] };
	seniority?: CriterionRating & { levels: SeniorityLevel[] };
	/** Leading people (direct reports) or not */
	management?: CriterionRating & { role: ManagementRole };
	workMode?: CriterionRating & {
		modes: WorkMode[];
		/** For a hybrid job (only kept when hybrid is accepted): remote days a week wanted */
		minRemoteDays?: number;
	};
	/**
	 * Where the office can be: city names, or the first digits of a postal code ("69"). A fully
	 * remote job has no office and matches
	 */
	cities?: CriterionRating & { places: string[] };
	/**
	 * The time accepted on the way to the office and back, over a week: a job that asks to come
	 * once a week can be further away than one on site every day. The travel time is computed by
	 * the API from `from` to the job's address (one way, by the fastest of `modes`), and counted
	 * twice for each day at the office (officeDaysPerWeek). A fully remote job has no commute
	 */
	commute?: CriterionRating & {
		/** The address travelled from, as typed (a nearby place does as well as a home address) */
		from: string;
		/** Where the API found `from`: set by the API when it saves, whatever the client sends */
		place?: GeoPlace;
		modes: CommuteMode[];
		maxMinutesPerWeek: number;
	};
	contractTypes?: CriterionRating & { types: ContractType[] };
	workingTime?: CriterionRating & {
		arrangements: WorkingTimeArrangement[];
		/** For a job counted in weekly hours (only kept when those are accepted) */
		maxHoursPerWeek?: number;
	};
	/** Reduced working time days a year, at least */
	rttDays?: CriterionRating & { min: number };
	/**
	 * Gross pay asked, in euros: per year (salaried jobs) and/or per day (day rates). With one of
	 * them only, the other kind of job is converted (FR_FORFAIT_JOURS_STANDARD_DAYS days a year)
	 */
	pay?: CriterionRating & { perYear?: number; perDay?: number };
	/** Skills the candidate wants to work with: a job scores by the share of its skills among them */
	skills?: CriterionRating & { names: string[] };
	/** Skills the candidate does not want to work with: a job asking for one does not match */
	avoidedSkills?: CriterionRating & { names: string[] };
	/** The most travel accepted */
	travel?: CriterionRating & { max: TravelFrequency };
}

// ── What the criteria read ──────────────────────────────────

/**
 * For every field of a job posting, the criteria that read it: none for a field no criterion
 * looks at. The one place that ties the two sides together, so that neither changes without the
 * other:
 *   - a field added to JobPostingInput does not compile until it is listed here, with the
 *     criteria that read it or with none on purpose;
 *   - a criterion must be read from at least one field, and its scorer may read these fields
 *     only (server/tests/perfectJobScore.test.ts checks both, and that the API and the job
 *     editor carry every field: a recruiter can state everything a candidate can ask for).
 */
export const JOB_FIELD_CRITERIA: Record<JobFieldPath, readonly PerfectJobCriterion[]> = {
	title: ['titles'],
	description: [],
	company: [],
	status: [],
	openings: [],
	'location.country': [],
	'location.city': ['cities', 'commute'],
	'location.postalCode': ['cities', 'commute'],
	'location.address': ['commute'],
	'location.workMode': ['workMode', 'cities', 'commute'],
	'location.remoteDaysPerWeek': ['workMode', 'commute'],
	'contract.type': ['contractTypes'],
	'contract.durationMonths': [],
	'contract.startDate': [],
	'contract.trialPeriodMonths': [],
	'contract.collectiveAgreement': [],
	'workingTime.arrangement': ['workingTime'],
	// The pay of a job paid by the hour or by the day is brought to a year with them
	'workingTime.hoursPerWeek': ['workingTime', 'pay'],
	'workingTime.daysPerYear': ['pay'],
	'workingTime.rttDaysPerYear': ['rttDays'],
	'pay.min': ['pay'],
	'pay.max': ['pay'],
	'pay.currency': [],
	'pay.period': ['pay'],
	'pay.variable': [],
	'organization.directReports': ['management'],
	'organization.peers': [],
	'organization.levelsToCeo': [],
	'requirements.seniority': ['seniority'],
	'requirements.education': [],
	'requirements.skills': ['skills', 'avoidedSkills'],
	'requirements.languages': [],
	benefits: [],
	travel: ['travel']
};

/** Every field of a job posting, in the order of the posting */
export const JOB_FIELD_PATHS = Object.keys(JOB_FIELD_CRITERIA) as JobFieldPath[];

/** The fields of a job posting a criterion is read from */
export const criterionJobFields = (criterion: PerfectJobCriterion): JobFieldPath[] =>
	JOB_FIELD_PATHS.filter((field) => JOB_FIELD_CRITERIA[field].includes(criterion));

// ── Display ─────────────────────────────────────────────────

// The labels are messages (perfectJob.messages.ts): read one when it is shown
// (`IMPORTANCE_LABELS[level]`), it is in the language in use. A label kept in a module-level
// constant would stay in English.

export const IMPORTANCE_LABELS: Record<Importance, string> = m.importance;

/** A criterion's name, for the owner's editor and for the recruiter reading their job's score */
export const PERFECT_JOB_CRITERION_LABELS: Record<PerfectJobCriterion, string> = m.criterion;

export const COMMUTE_MODE_LABELS: Record<CommuteMode, string> = m.commuteMode;

export const MANAGEMENT_ROLE_LABELS: Record<ManagementRole, string> = m.managementRole;

// ── Parsing ─────────────────────────────────────────────────

/** A rule the criteria break: `field` is `<criterion>` or `<criterion>.<setting>` (e.g. `pay.perYear`) */
export interface PerfectJobProblem {
	field: string;
	message: string;
}

type Source = Record<string, unknown>;
type Parsed<Value> = { value?: Value; problems: PerfectJobProblem[] };

const isObject = (value: unknown): value is Source =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const inRange = (value: unknown, { min, max }: NumberRange): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** The members of `allowed` that `raw` names, in the order of `allowed`; undefined when it is not a list of them */
const subset = <T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined => {
	if (!Array.isArray(raw) || raw.some((item) => !allowed.includes(item as T))) return undefined;
	return allowed.filter((item) => raw.includes(item));
};

/**
 * One criterion's parser: reads its settings from `source`, reports what is wrong under
 * `<criterion>.<setting>` and returns the settings (without the rating) when nothing is
 */
type CriterionParser<Value> = (
	source: Source,
	problem: (setting: string, message: string) => void
) => Value | undefined;

// The parsers below are built once, when this module loads, and a message is in the language in
// use when it is read: they are given where to find their messages (a group of them, or a
// function), and read them when they report a problem.

/** What a list of texts says when it is wrong: a group of perfectJob.messages.ts's `lists` */
type ListMessages = {
	readonly empty: string;
	readonly tooMany: (max: number) => string;
	readonly itemTooLong: (max: number) => string;
};

const textList =
	<Key extends string>(
		setting: Key,
		max: number,
		messages: ListMessages
	): CriterionParser<Record<Key, string[]>> =>
	(source, problem) => {
		const raw = source[setting];
		if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
			problem(setting, messages.empty);
			return undefined;
		}
		const list = normalizeList(raw as string[]);
		if (list.length === 0) problem(setting, messages.empty);
		else if (list.length > max) problem(setting, messages.tooMany(max));
		else if (list.some((item) => item.length > PERFECT_JOB_LIMITS.listItem)) {
			problem(setting, messages.itemTooLong(PERFECT_JOB_LIMITS.listItem));
		} else return { [setting]: list } as Record<Key, string[]>;
		return undefined;
	};

const choices =
	<Key extends string, T extends string>(
		setting: Key,
		allowed: readonly T[],
		message: () => string
	): CriterionParser<Record<Key, T[]>> =>
	(source, problem) => {
		const picked = subset(source[setting], allowed);
		if (!picked || picked.length === 0) {
			problem(setting, message());
			return undefined;
		}
		return { [setting]: picked } as Record<Key, T[]>;
	};

/** An optional whole number: undefined when unset, a problem when it is not one in `range` */
const optionalNumber = (
	source: Source,
	setting: string,
	range: NumberRange,
	message: (min: number, max: number) => string,
	problem: (setting: string, message: string) => void
): number | undefined => {
	const raw = source[setting];
	if (raw === undefined || raw === null) return undefined;
	if (inRange(raw, range)) return raw;
	problem(setting, message(range.min, range.max));
	return undefined;
};

/** A place as the API stored it; undefined for anything else */
const geoPlace = (raw: unknown): GeoPlace | undefined => {
	if (!isObject(raw)) return undefined;
	const { label, lat, lon } = raw;
	const coordinate = (value: unknown, max: number): value is number =>
		typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
	if (typeof label !== 'string' || label.length > PERFECT_JOB_LIMITS.placeLabel) return undefined;
	return coordinate(lat, 90) && coordinate(lon, 180) ? { label, lat, lon } : undefined;
};

type CriterionValue<K extends PerfectJobCriterion> = Omit<
	NonNullable<PerfectJob[K]>,
	keyof CriterionRating
>;

const PARSERS: { [K in PerfectJobCriterion]: CriterionParser<CriterionValue<K>> } = {
	titles: textList('keywords', PERFECT_JOB_LIMITS.titles, m.problems.lists.jobTitle),
	seniority: choices('levels', SENIORITY_LEVELS, () => m.problems.seniorityRequired),
	management: (source, problem) => {
		const role = source.role as ManagementRole;
		if (MANAGEMENT_ROLES.includes(role)) return { role };
		problem('role', m.problems.managementRequired);
		return undefined;
	},
	workMode: (source, problem) => {
		const picked = choices(
			'modes',
			WORK_MODES,
			() => m.problems.workModeRequired
		)(source, problem);
		const days = optionalNumber(
			source,
			'minRemoteDays',
			PERFECT_JOB_LIMITS.minRemoteDays,
			m.problems.minRemoteDays,
			problem
		);
		if (!picked) return undefined;
		// Remote days only mean something for a hybrid job
		return picked.modes.includes('hybrid') && days !== undefined
			? { ...picked, minRemoteDays: days }
			: picked;
	},
	cities: textList('places', PERFECT_JOB_LIMITS.cities, m.problems.lists.place),
	commute: (source, problem) => {
		const from = typeof source.from === 'string' ? source.from.replace(/\s+/g, ' ').trim() : '';
		if (!from) problem('from', m.problems.commuteFromRequired);
		else if (from.length > PERFECT_JOB_LIMITS.address) {
			problem('from', m.problems.commuteFromTooLong(PERFECT_JOB_LIMITS.address));
		}
		const picked = choices(
			'modes',
			COMMUTE_MODES,
			() => m.problems.commuteModeRequired
		)(source, problem);
		const minutes = source.maxMinutesPerWeek;
		if (!inRange(minutes, PERFECT_JOB_LIMITS.commuteMinutesPerWeek)) {
			problem('maxMinutesPerWeek', m.problems.commuteTime);
			return undefined;
		}
		if (!picked || !from || from.length > PERFECT_JOB_LIMITS.address) return undefined;
		const place = geoPlace(source.place);
		return { from, ...(place ? { place } : {}), ...picked, maxMinutesPerWeek: minutes };
	},
	contractTypes: choices('types', FR_CONTRACT_TYPES, () => m.problems.contractRequired),
	workingTime: (source, problem) => {
		const picked = choices(
			'arrangements',
			WORKING_TIME_ARRANGEMENTS,
			() => m.problems.workingTimeRequired
		)(source, problem);
		const hours = optionalNumber(
			source,
			'maxHoursPerWeek',
			PERFECT_JOB_LIMITS.maxHoursPerWeek,
			m.problems.maxHoursPerWeek,
			problem
		);
		if (!picked) return undefined;
		return picked.arrangements.includes('weekly_hours') && hours !== undefined
			? { ...picked, maxHoursPerWeek: hours }
			: picked;
	},
	rttDays: (source, problem) => {
		const min = source.min;
		if (inRange(min, PERFECT_JOB_LIMITS.rttDays)) return { min };
		const { min: low, max: high } = PERFECT_JOB_LIMITS.rttDays;
		problem('min', m.problems.rttDays(low, high));
		return undefined;
	},
	pay: (source, problem) => {
		const before = { failed: false };
		const amount = (setting: 'perYear' | 'perDay', message: string) => {
			const raw = source[setting];
			if (raw === undefined || raw === null) return undefined;
			if (inRange(raw, PERFECT_JOB_LIMITS.pay)) return raw;
			before.failed = true;
			problem(setting, message);
			return undefined;
		};
		const perYear = amount('perYear', m.problems.payPerYear);
		const perDay = amount('perDay', m.problems.payPerDay);
		if (before.failed) return undefined;
		if (perYear === undefined && perDay === undefined) {
			problem('perYear', m.problems.payRequired);
			return undefined;
		}
		return {
			...(perYear === undefined ? {} : { perYear }),
			...(perDay === undefined ? {} : { perDay })
		};
	},
	skills: textList('names', PERFECT_JOB_LIMITS.skills, m.problems.lists.skill),
	avoidedSkills: textList('names', PERFECT_JOB_LIMITS.avoidedSkills, m.problems.lists.skill),
	travel: (source, problem) => {
		const max = source.max as TravelFrequency;
		if (TRAVEL_FREQUENCIES.includes(max)) return { max };
		problem('max', m.problems.travelRequired);
		return undefined;
	}
};

function parseCriterion<K extends PerfectJobCriterion>(
	criterion: K,
	raw: unknown
): Parsed<NonNullable<PerfectJob[K]>> {
	const problems: PerfectJobProblem[] = [];
	if (!isObject(raw)) {
		return { problems: [{ field: criterion, message: m.problems.invalidCriterion }] };
	}
	const { importance } = raw;
	if (!IMPORTANCE_LEVELS.includes(importance as Importance)) {
		problems.push({
			field: `${criterion}.importance`,
			message: m.problems.importance(
				IMPORTANCE_LEVELS[0],
				IMPORTANCE_LEVELS[IMPORTANCE_LEVELS.length - 1]
			)
		});
	}
	const settings = PARSERS[criterion](raw, (setting, message) =>
		problems.push({ field: `${criterion}.${setting}`, message })
	);
	if (problems.length > 0 || !settings) return { problems };
	return {
		value: {
			importance: importance as Importance,
			...(raw.dealBreaker === true ? { dealBreaker: true as const } : {}),
			...settings
		} as NonNullable<PerfectJob[K]>,
		problems
	};
}

/**
 * The criteria as they are stored (lists cleaned, settings that do not apply and unknown keys
 * dropped) and every rule they break, in the editor's order; they can be saved when `problems`
 * is empty. `raw` is whatever the client sent
 */
export function parsePerfectJob(raw: unknown): {
	criteria: PerfectJob;
	problems: PerfectJobProblem[];
} {
	if (!isObject(raw)) {
		return { criteria: {}, problems: [{ field: 'criteria', message: m.problems.notAnObject }] };
	}
	const source = raw;
	const criteria: PerfectJob = {};
	const problems: PerfectJobProblem[] = [];
	const keep = <K extends PerfectJobCriterion>(criterion: K) => {
		if (!Object.hasOwn(source, criterion)) return;
		const value = source[criterion];
		if (value === undefined || value === null) return;
		const parsed = parseCriterion(criterion, value);
		problems.push(...parsed.problems);
		if (parsed.value) criteria[criterion] = parsed.value;
	};
	PERFECT_JOB_CRITERIA.forEach(keep);
	return { criteria, problems };
}

/**
 * Stored criteria as they can be scored: each criterion that still is one. What an older version
 * wrote and this one does not understand is left out, criterion by criterion
 */
export const storedPerfectJob = (raw: unknown): PerfectJob => parsePerfectJob(raw).criteria;

/** The criteria that count, in order */
export const ratedCriteria = (perfectJob: PerfectJob): PerfectJobCriterion[] =>
	PERFECT_JOB_CRITERIA.filter((criterion) => perfectJob[criterion] !== undefined);

// ── Scoring ─────────────────────────────────────────────────

/** The fields of a posting the criteria read */
export type ScoredJob = Pick<
	JobPostingInput,
	'title' | 'location' | 'contract' | 'workingTime' | 'pay' | 'organization' | 'requirements' | 'travel'
>;

/** How a job does on one criterion */
export interface CriterionScore {
	criterion: PerfectJobCriterion;
	importance: Importance;
	dealBreaker: boolean;
	/** From 0 (does not match at all) to 1 (matches) */
	match: number;
	/**
	 * false when the posting does not say what the criterion reads (no seniority, no skills...):
	 * it then counts as not matching
	 */
	stated: boolean;
	/**
	 * The criterion could not be computed (the commute, when no travel time is known): it is
	 * left out of the score
	 */
	unavailable?: true;
}

export interface PerfectJobScore {
	/** Out of 100, a whole number */
	score: number;
	/** One entry per criterion that counts, in order */
	criteria: CriterionScore[];
	/** A deal-breaker is not matched at all: the score is 0 */
	broken: boolean;
}

/** The words of a text, lowercased and without accents ("Développeur C++ / Node.js": developpeur, c++, node, js) */
const words = (text: string): string[] =>
	text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.split(/[^\p{L}\p{N}+#]+/u)
		.filter(Boolean);

/** `needle`'s words are in `haystack`, next to each other and in order ("CTO" is not in "Director") */
const hasWords = (haystack: readonly string[], needle: readonly string[]): boolean => {
	if (needle.length === 0) return false;
	for (let start = 0; start + needle.length <= haystack.length; start++) {
		if (needle.every((word, index) => haystack[start + index] === word)) return true;
	}
	return false;
};

/** A skill as it is compared: "Node.js", "NodeJS" and "node js" are the same */
const skillKey = (name: string): string => words(name).join('');

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

type Outcome = number | { match: number; stated: boolean } | 'unavailable';
const NOT_STATED: Outcome = { match: 0, stated: false };

/** What scoring a job needs that is not in the posting or the criteria: computed by the API */
export interface ScoreContext {
	/**
	 * The way from the candidate's address to the job's. `minutes`: one way, by the fastest of
	 * the modes the candidate accepts (Infinity when none of them leads there). `located: false`:
	 * the job's address could not be found on a map, which counts like a posting that does not
	 * say where it is. Undefined when the travel time was not computed (travel times are off, or
	 * the service did not answer): the commute then does not count
	 */
	commute?: { minutes: number } | { located: false };
}

/**
 * Where a job's office is, as the posting says it: what the API looks up on a map to compute
 * the commute. The street when the posting gives one, the town otherwise
 */
export const officeAddress = (
	location: ScoredJob['location']
): { address?: string; postalCode?: string; city?: string } => ({
	...(location.address ? { address: location.address } : {}),
	...(location.postalCode ? { postalCode: location.postalCode } : {}),
	...(location.city ? { city: location.city } : {})
});

/** The days a week a job is worked at the office: none when fully remote, all of them on site */
export const officeDaysPerWeek = (location: ScoredJob['location']): number => {
	if (location.workMode === 'remote') return 0;
	if (location.workMode === 'on_site') return WORK_DAYS_PER_WEEK;
	// A hybrid job that does not say: the fewest remote days a hybrid job can have
	const remote = location.remoteDaysPerWeek ?? PERFECT_JOB_LIMITS.minRemoteDays.min;
	return Math.max(0, WORK_DAYS_PER_WEEK - remote);
};

/** What the job pays in the middle of its range, converted to a year or a day */
const jobPay = (job: ScoredJob, per: 'year' | 'day'): number => {
	const { pay, workingTime } = job;
	const middle = (pay.min + pay.max) / 2;
	const daysPerYear = workingTime.daysPerYear ?? FR_FORFAIT_JOURS_STANDARD_DAYS;
	const hoursPerWeek = workingTime.hoursPerWeek ?? FR_FULL_TIME_HOURS_PER_WEEK;
	const perYear =
		pay.period === 'year'
			? middle
			: pay.period === 'month'
				? middle * 12
				: pay.period === 'day'
					? middle * daysPerYear
					: middle * hoursPerWeek * 52;
	if (per === 'year') return perYear;
	return pay.period === 'day' ? middle : perYear / daysPerYear;
};

const TRAVEL_RANK: Record<TravelFrequency, number> = { none: 0, occasional: 1, frequent: 2 };

const SCORERS: {
	[K in PerfectJobCriterion]: (
		wanted: NonNullable<PerfectJob[K]>,
		job: ScoredJob,
		context: ScoreContext
	) => Outcome;
} = {
	titles: ({ keywords }, job) => {
		const title = words(job.title);
		return keywords.some((keyword) => hasWords(title, words(keyword))) ? 1 : 0;
	},
	seniority: ({ levels }, job) => {
		const level = job.requirements?.seniority;
		if (level === undefined) return NOT_STATED;
		return levels.includes(level) ? 1 : 0;
	},
	management: ({ role }, job) => {
		const reports = job.organization?.directReports;
		if (reports === undefined) return NOT_STATED;
		return (reports > 0) === (role === 'manager') ? 1 : 0;
	},
	workMode: ({ modes, minRemoteDays }, job) => {
		const { workMode, remoteDaysPerWeek } = job.location;
		if (!modes.includes(workMode)) return 0;
		if (workMode !== 'hybrid' || minRemoteDays === undefined) return 1;
		if (remoteDaysPerWeek === undefined) return NOT_STATED;
		return clamp(remoteDaysPerWeek / minRemoteDays);
	},
	cities: ({ places }, job) => {
		const { workMode, city, postalCode } = job.location;
		// No office to go to
		if (workMode === 'remote') return 1;
		const cityWords = words(city ?? '');
		const code = (postalCode ?? '').replace(/\s+/g, '');
		return places.some((place) =>
			/^\d{2,5}$/.test(place) ? code.startsWith(place) : hasWords(cityWords, words(place))
		)
			? 1
			: 0;
	},
	commute: ({ maxMinutesPerWeek }, job, { commute }) => {
		const days = officeDaysPerWeek(job.location);
		// Nowhere to go
		if (days === 0) return 1;
		if (commute === undefined) return 'unavailable';
		if (!('minutes' in commute)) return NOT_STATED;
		const perWeek = commute.minutes * 2 * days;
		if (perWeek <= maxMinutesPerWeek) return 1;
		return clamp(1 - (perWeek - maxMinutesPerWeek) / (maxMinutesPerWeek * COMMUTE_TOLERANCE));
	},
	contractTypes: ({ types }, job) => (types.includes(job.contract.type) ? 1 : 0),
	workingTime: ({ arrangements, maxHoursPerWeek }, job) => {
		const { arrangement, hoursPerWeek } = job.workingTime;
		if (!arrangements.includes(arrangement)) return 0;
		if (arrangement !== 'weekly_hours' || maxHoursPerWeek === undefined) return 1;
		if (hoursPerWeek === undefined) return NOT_STATED;
		return clamp(1 - (hoursPerWeek - maxHoursPerWeek) / HOURS_TOLERANCE);
	},
	rttDays: ({ min }, job) => {
		const days = job.workingTime.rttDaysPerYear;
		if (days === undefined) return NOT_STATED;
		return clamp(days / min);
	},
	pay: ({ perYear, perDay }, job) => {
		// A day rate is compared to the day rate asked when there is one, anything else to the year's
		const per = perDay !== undefined && (job.pay.period === 'day' || perYear === undefined) ? 'day' : 'year';
		const asked = per === 'day' ? perDay : perYear;
		if (asked === undefined) return 1;
		const offered = jobPay(job, per);
		if (offered >= asked) return 1;
		return clamp((offered - asked * (1 - PAY_TOLERANCE)) / (asked * PAY_TOLERANCE));
	},
	skills: ({ names }, job) => {
		const asked = (job.requirements?.skills ?? []).map(skillKey).filter(Boolean);
		if (asked.length === 0) return NOT_STATED;
		const wanted = new Set(names.map(skillKey));
		return asked.filter((skill) => wanted.has(skill)).length / asked.length;
	},
	avoidedSkills: ({ names }, job) => {
		const asked = (job.requirements?.skills ?? []).map(skillKey).filter(Boolean);
		if (asked.length === 0) return NOT_STATED;
		const avoided = new Set(names.map(skillKey));
		return asked.some((skill) => avoided.has(skill)) ? 0 : 1;
	},
	travel: ({ max }, job) => {
		if (job.travel === undefined) return NOT_STATED;
		return TRAVEL_RANK[job.travel] <= TRAVEL_RANK[max] ? 1 : 0;
	}
};

const scoreCriterion = <K extends PerfectJobCriterion>(
	criterion: K,
	wanted: NonNullable<PerfectJob[K]>,
	job: ScoredJob,
	context: ScoreContext
): CriterionScore => {
	const outcome = SCORERS[criterion](wanted, job, context);
	const rating = {
		criterion,
		importance: wanted.importance,
		dealBreaker: wanted.dealBreaker === true
	};
	if (outcome === 'unavailable') return { ...rating, match: 0, stated: true, unavailable: true };
	const { match, stated } = typeof outcome === 'number' ? { match: outcome, stated: true } : outcome;
	return { ...rating, match: clamp(match), stated };
};

/**
 * A job posting scored against a perfect job, out of 100: each criterion counts for its
 * importance, by how well the job matches it, and what the posting does not say counts as not
 * matching. A deal-breaker that is not matched at all brings the score to 0. A criterion that
 * could not be computed (the commute, without a travel time in `context`) is left out: it
 * neither adds to the score nor takes from it. Without any criterion that counts, nothing is
 * asked: every job scores 100.
 */
export function scorePerfectJob(
	perfectJob: PerfectJob,
	job: ScoredJob,
	context: ScoreContext = {}
): PerfectJobScore {
	const criteria = ratedCriteria(perfectJob).map((criterion) =>
		scoreCriterion(criterion, perfectJob[criterion]!, job, context)
	);
	const counted = criteria.filter((entry) => !entry.unavailable);
	const broken = counted.some((entry) => entry.dealBreaker && entry.match === 0);
	const weight = counted.reduce((sum, entry) => sum + entry.importance, 0);
	const earned = counted.reduce((sum, entry) => sum + entry.importance * entry.match, 0);
	const score = broken ? 0 : weight === 0 ? 100 : Math.round((earned / weight) * 100);
	return { score, criteria, broken };
}
