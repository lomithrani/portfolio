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
import type {
	ContractType,
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
	pay: { min: 1, max: JOB_LIMITS.pay.max }
} as const;

// ── Shape ───────────────────────────────────────────────────

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

// ── Display ─────────────────────────────────────────────────

export const IMPORTANCE_LABELS: Record<Importance, string> = {
	1: 'Nice to have',
	2: 'Matters a little',
	3: 'Important',
	4: 'Very important',
	5: 'Essential'
};

/** A criterion's name, for the owner's editor and for the recruiter reading their job's score */
export const PERFECT_JOB_CRITERION_LABELS: Record<PerfectJobCriterion, string> = {
	titles: 'Job title',
	seniority: 'Seniority',
	management: 'Management',
	workMode: 'Work mode',
	cities: 'Location',
	contractTypes: 'Contract',
	workingTime: 'Working time',
	rttDays: 'RTT days',
	pay: 'Pay',
	skills: 'Skills',
	avoidedSkills: 'Skills to avoid',
	travel: 'Travel'
};

export const MANAGEMENT_ROLE_LABELS: Record<ManagementRole, string> = {
	manager: 'Managing people (direct reports)',
	contributor: 'No direct reports'
};

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

const textList =
	<Key extends string>(setting: Key, max: number, what: string): CriterionParser<Record<Key, string[]>> =>
	(source, problem) => {
		const raw = source[setting];
		if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
			problem(setting, `Add at least one ${what}.`);
			return undefined;
		}
		const list = normalizeList(raw as string[]);
		if (list.length === 0) problem(setting, `Add at least one ${what}.`);
		else if (list.length > max) problem(setting, `At most ${max} ${what}s.`);
		else if (list.some((item) => item.length > PERFECT_JOB_LIMITS.listItem)) {
			problem(setting, `Each ${what} must be at most ${PERFECT_JOB_LIMITS.listItem} characters.`);
		} else return { [setting]: list } as Record<Key, string[]>;
		return undefined;
	};

const choices =
	<Key extends string, T extends string>(
		setting: Key,
		allowed: readonly T[],
		message: string
	): CriterionParser<Record<Key, T[]>> =>
	(source, problem) => {
		const picked = subset(source[setting], allowed);
		if (!picked || picked.length === 0) {
			problem(setting, message);
			return undefined;
		}
		return { [setting]: picked } as Record<Key, T[]>;
	};

/** An optional whole number: undefined when unset, a problem when it is not one in `range` */
const optionalNumber = (
	source: Source,
	setting: string,
	range: NumberRange,
	label: string,
	problem: (setting: string, message: string) => void
): number | undefined => {
	const raw = source[setting];
	if (raw === undefined || raw === null) return undefined;
	if (inRange(raw, range)) return raw;
	problem(setting, `${label} must be a whole number from ${range.min} to ${range.max}.`);
	return undefined;
};

type CriterionValue<K extends PerfectJobCriterion> = Omit<
	NonNullable<PerfectJob[K]>,
	keyof CriterionRating
>;

const PARSERS: { [K in PerfectJobCriterion]: CriterionParser<CriterionValue<K>> } = {
	titles: textList('keywords', PERFECT_JOB_LIMITS.titles, 'job title'),
	seniority: choices('levels', SENIORITY_LEVELS, 'Pick at least one seniority level.'),
	management: (source, problem) => {
		const role = source.role as ManagementRole;
		if (MANAGEMENT_ROLES.includes(role)) return { role };
		problem('role', 'Say whether you want to manage people.');
		return undefined;
	},
	workMode: (source, problem) => {
		const picked = choices('modes', WORK_MODES, 'Pick at least one work mode.')(source, problem);
		const days = optionalNumber(
			source,
			'minRemoteDays',
			PERFECT_JOB_LIMITS.minRemoteDays,
			'Remote days a week',
			problem
		);
		if (!picked) return undefined;
		// Remote days only mean something for a hybrid job
		return picked.modes.includes('hybrid') && days !== undefined
			? { ...picked, minRemoteDays: days }
			: picked;
	},
	cities: textList('places', PERFECT_JOB_LIMITS.cities, 'place'),
	contractTypes: choices('types', FR_CONTRACT_TYPES, 'Pick at least one contract.'),
	workingTime: (source, problem) => {
		const picked = choices(
			'arrangements',
			WORKING_TIME_ARRANGEMENTS,
			'Pick at least one way of counting working time.'
		)(source, problem);
		const hours = optionalNumber(
			source,
			'maxHoursPerWeek',
			PERFECT_JOB_LIMITS.maxHoursPerWeek,
			'Hours per week',
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
		problem('min', `RTT days must be a whole number from ${low} to ${high}.`);
		return undefined;
	},
	pay: (source, problem) => {
		const before = { failed: false };
		const amount = (setting: 'perYear' | 'perDay', label: string) => {
			const raw = source[setting];
			if (raw === undefined || raw === null) return undefined;
			if (inRange(raw, PERFECT_JOB_LIMITS.pay)) return raw;
			before.failed = true;
			problem(setting, `${label} must be a whole number of euros, above 0.`);
			return undefined;
		};
		const perYear = amount('perYear', 'Pay per year');
		const perDay = amount('perDay', 'Pay per day');
		if (before.failed) return undefined;
		if (perYear === undefined && perDay === undefined) {
			problem('perYear', 'Give the pay you ask for: per year, per day, or both.');
			return undefined;
		}
		return {
			...(perYear === undefined ? {} : { perYear }),
			...(perDay === undefined ? {} : { perDay })
		};
	},
	skills: textList('names', PERFECT_JOB_LIMITS.skills, 'skill'),
	avoidedSkills: textList('names', PERFECT_JOB_LIMITS.avoidedSkills, 'skill'),
	travel: (source, problem) => {
		const max = source.max as TravelFrequency;
		if (TRAVEL_FREQUENCIES.includes(max)) return { max };
		problem('max', 'Pick how much travel you accept.');
		return undefined;
	}
};

function parseCriterion<K extends PerfectJobCriterion>(
	criterion: K,
	raw: unknown
): Parsed<NonNullable<PerfectJob[K]>> {
	const problems: PerfectJobProblem[] = [];
	if (!isObject(raw)) {
		return { problems: [{ field: criterion, message: 'This criterion is not valid.' }] };
	}
	const { importance } = raw;
	if (!IMPORTANCE_LEVELS.includes(importance as Importance)) {
		problems.push({
			field: `${criterion}.importance`,
			message: `Say how much it matters, from ${IMPORTANCE_LEVELS[0]} to ${IMPORTANCE_LEVELS.at(-1)}.`
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
		return { criteria: {}, problems: [{ field: 'criteria', message: 'Criteria must be an object.' }] };
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
		.replace(/[̀-ͯ]/g, '')
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

type Outcome = number | { match: number; stated: boolean };
const NOT_STATED: Outcome = { match: 0, stated: false };

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
	[K in PerfectJobCriterion]: (wanted: NonNullable<PerfectJob[K]>, job: ScoredJob) => Outcome;
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
	job: ScoredJob
): CriterionScore => {
	const outcome = SCORERS[criterion](wanted, job);
	const { match, stated } = typeof outcome === 'number' ? { match: outcome, stated: true } : outcome;
	return {
		criterion,
		importance: wanted.importance,
		dealBreaker: wanted.dealBreaker === true,
		match: clamp(match),
		stated
	};
};

/**
 * A job posting scored against a perfect job, out of 100: each criterion counts for its
 * importance, by how well the job matches it, and what the posting does not say counts as not
 * matching. A deal-breaker that is not matched at all brings the score to 0. Without any
 * criterion, nothing is asked: every job scores 100.
 */
export function scorePerfectJob(perfectJob: PerfectJob, job: ScoredJob): PerfectJobScore {
	const criteria = ratedCriteria(perfectJob).map((criterion) =>
		scoreCriterion(criterion, perfectJob[criterion]!, job)
	);
	const broken = criteria.some((entry) => entry.dealBreaker && entry.match === 0);
	const weight = criteria.reduce((sum, entry) => sum + entry.importance, 0);
	const earned = criteria.reduce((sum, entry) => sum + entry.importance * entry.match, 0);
	const score = broken ? 0 : weight === 0 ? 100 : Math.round((earned / weight) * 100);
	return { score, criteria, broken };
}
