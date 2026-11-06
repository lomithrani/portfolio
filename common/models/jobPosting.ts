// Job postings of the recruiter space: the values, limits and rules shared by the API (request
// validation, PUT/POST /jobs) and the client (the job editor's validation and the display of a
// posting). Contract rules depend on the country of the job: France is the first one handled.
import { isCalendarDate } from './bookingDates';

// ── Values ──────────────────────────────────────────────────

/**
 * draft: only its recruiter sees it; open: public, takes applications; on_hold: public, paused
 * (no applications); filled: someone was hired; closed: withdrawn without hiring
 */
export const JOB_STATUSES = ['draft', 'open', 'on_hold', 'filled', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses anyone can see (GET /jobs/:id); a draft is its recruiter's alone */
export const PUBLIC_JOB_STATUSES: readonly JobStatus[] = ['open', 'on_hold', 'filled', 'closed'];

/** Candidates can apply to a posting only while it is open */
export const APPLICABLE_JOB_STATUS: JobStatus = 'open';

/** on_site: at the office; hybrid: some days remote; remote: fully remote (no office to name) */
export const WORK_MODES = ['on_site', 'hybrid', 'remote'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** ISO 3166-1 alpha-2 codes of the countries whose contracts are handled */
export const JOB_COUNTRIES = ['FR'] as const;
export type JobCountry = (typeof JOB_COUNTRIES)[number];

/**
 * French contracts: cdi (contrat à durée indéterminée, permanent), cdd (contrat à durée
 * déterminée, fixed-term), interim (contrat de travail temporaire), apprenticeship (contrat
 * d'apprentissage), professionalisation (contrat de professionnalisation), internship (stage,
 * under a convention de stage), freelance (independent contractor, portage included)
 */
export const FR_CONTRACT_TYPES = [
	'cdi',
	'cdd',
	'interim',
	'apprenticeship',
	'professionalisation',
	'internship',
	'freelance'
] as const;
export type ContractType = (typeof FR_CONTRACT_TYPES)[number];

/** Contracts with an end date: their duration (in months) is required */
export const FIXED_TERM_CONTRACT_TYPES: readonly ContractType[] = [
	'cdd',
	'interim',
	'apprenticeship',
	'professionalisation',
	'internship'
];

/** Contracts that may state a duration (a freelance mission's is optional) */
export const CONTRACT_TYPES_WITH_DURATION: readonly ContractType[] = [
	...FIXED_TERM_CONTRACT_TYPES,
	'freelance'
];

/**
 * How working time is counted: weekly_hours (35 h, 39 h... a week; under 35 h is part-time),
 * annual_days (forfait jours: 218 days a year at most by law, up to 235 when the employee gives
 * up rest days)
 */
export const WORKING_TIME_ARRANGEMENTS = ['weekly_hours', 'annual_days'] as const;
export type WorkingTimeArrangement = (typeof WORKING_TIME_ARRANGEMENTS)[number];

/** The weekly hours of a full-time job in France (durée légale) */
export const FR_FULL_TIME_HOURS_PER_WEEK = 35;
/** The legal ceiling of a forfait jours, without giving up rest days */
export const FR_FORFAIT_JOURS_STANDARD_DAYS = 218;

/** What the pay range is for: gross (brut) amounts per year, month, day or hour */
export const PAY_PERIODS = ['year', 'month', 'day', 'hour'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export const PAY_CURRENCIES = ['EUR'] as const;
export type PayCurrency = (typeof PAY_CURRENCIES)[number];

/** entry: no experience; junior: 0-2 years; mid: 2-5; senior: 5-10; lead: 10+ or leading; executive: management board */
export const SENIORITY_LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead', 'executive'] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

/** French education levels (niveau d'études): none, CAP/BEP, Bac, Bac+2, Bac+3, Bac+5, doctorate */
export const EDUCATION_LEVELS = [
	'none',
	'cap_bep',
	'bac',
	'bac_2',
	'bac_3',
	'bac_5',
	'doctorate'
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/** How much the job travels */
export const TRAVEL_FREQUENCIES = ['none', 'occasional', 'frequent'] as const;
export type TravelFrequency = (typeof TRAVEL_FREQUENCIES)[number];

// ── Limits ──────────────────────────────────────────────────

/** Inclusive bounds of a number */
export interface NumberRange {
	min: number;
	max: number;
}

/** Lengths, counts and numeric bounds of a job posting, enforced by the API and the editor */
export const JOB_LIMITS = {
	title: 200,
	/** Markdown */
	description: 20_000,
	company: 200,
	city: 120,
	postalCode: 10,
	collectiveAgreement: 200,
	variablePay: 300,
	/** Per item of the skills, languages and benefits lists */
	listItem: 100,
	skills: 30,
	languages: 10,
	benefits: 20,
	openings: { min: 1, max: 100 },
	remoteDaysPerWeek: { min: 1, max: 4 },
	durationMonths: { min: 1, max: 36 },
	trialPeriodMonths: { min: 1, max: 12 },
	hoursPerWeek: { min: 1, max: 48 },
	daysPerYear: { min: 1, max: 235 },
	rttDaysPerYear: { min: 0, max: 60 },
	/** Pay amounts, in the currency's units (cents allowed) */
	pay: { min: 0.01, max: 10_000_000 },
	directReports: { min: 0, max: 100_000 },
	peers: { min: 0, max: 100_000 },
	/** 0: the job is the CEO; 1: reports to the CEO */
	levelsToCeo: { min: 0, max: 30 },
	/** Postings a recruiter can keep */
	jobsPerRecruiter: 200,
	/** Applicants listed per posting */
	applicantsPerJob: 1_000
} as const;

// ── Shape ───────────────────────────────────────────────────

/**
 * A job posting as the client sends it (POST /jobs, PUT /jobs/:id) and the API returns it (with
 * its id and dates). Optional fields are left out when unknown. The API's TypeBox schema
 * (server/models/elysia/jobPostingRequest.models.ts) describes the same shape.
 */
export interface JobPostingInput {
	title: string;
	/** Markdown */
	description: string;
	/** The hiring company, when it can be named */
	company?: string;
	status: JobStatus;
	/** Positions to fill (default 1) */
	openings?: number;
	location: {
		country: JobCountry;
		/** Required unless the job is fully remote */
		city?: string;
		postalCode?: string;
		workMode: WorkMode;
		/** Hybrid only */
		remoteDaysPerWeek?: number;
	};
	contract: {
		type: ContractType;
		/** Required for fixed-term contracts, optional for freelance, never for a CDI */
		durationMonths?: number;
		/** YYYY-MM-DD; unset: as soon as possible */
		startDate?: string;
		/** Période d'essai */
		trialPeriodMonths?: number;
		/** Convention collective (e.g. Syntec) */
		collectiveAgreement?: string;
	};
	workingTime: {
		arrangement: WorkingTimeArrangement;
		/** weekly_hours only (required there) */
		hoursPerWeek?: number;
		/** annual_days only (required there) */
		daysPerYear?: number;
		/** Reduced working time days (RTT) per year */
		rttDaysPerYear?: number;
	};
	pay: {
		/** Gross amounts per period; min equal to max for a fixed pay */
		min: number;
		max: number;
		currency: PayCurrency;
		period: PayPeriod;
		/** Bonus, commission, profit-sharing... in words */
		variable?: string;
	};
	organization?: {
		/** People reporting to this job */
		directReports?: number;
		/** Colleagues reporting to the same manager */
		peers?: number;
		/** Management levels above the job (distance to the CEO) */
		levelsToCeo?: number;
	};
	requirements?: {
		seniority?: SeniorityLevel;
		education?: EducationLevel;
		skills?: string[];
		/** e.g. "English (C1)" */
		languages?: string[];
	};
	benefits?: string[];
	travel?: TravelFrequency;
}

// ── Normalisation ───────────────────────────────────────────

const trimmed = (value: string | undefined): string | undefined => {
	const text = value?.replace(/\s+/g, ' ').trim();
	return text ? text : undefined;
};

/** Markdown keeps its line breaks: only CRLF and surrounding blank space change */
const trimmedText = (value: string): string => value.replace(/\r\n?/g, '\n').trim();

/** Trimmed, without blanks, each item once (ignoring case; the first spelling is kept) */
export const normalizeList = (items: readonly string[] | undefined): string[] => {
	const seen = new Set<string>();
	const list: string[] = [];
	for (const item of items ?? []) {
		const text = trimmed(item);
		if (!text || seen.has(text.toLowerCase())) continue;
		seen.add(text.toLowerCase());
		list.push(text);
	}
	return list;
};

/** Drops the keys whose value is undefined; undefined when nothing is left */
const compact = <T extends object>(value: T): T | undefined => {
	const entries = Object.entries(value).filter(([, item]) => item !== undefined);
	return entries.length ? (Object.fromEntries(entries) as T) : undefined;
};

/**
 * A posting as it is stored: strings trimmed (blank optional ones left out), lists cleaned, and
 * the fields that do not apply dropped (a CDI's duration, the hours of a forfait jours, the
 * remote days of a job that is not hybrid). Run before validateJobPosting by the API and before
 * sending by the client.
 */
export function normalizeJobPosting(input: JobPostingInput): JobPostingInput {
	const { location, contract, workingTime, pay } = input;
	const workMode = location.workMode;
	const skills = normalizeList(input.requirements?.skills);
	const languages = normalizeList(input.requirements?.languages);
	const benefits = normalizeList(input.benefits);
	const organization = compact({
		directReports: input.organization?.directReports,
		peers: input.organization?.peers,
		levelsToCeo: input.organization?.levelsToCeo
	});
	const requirements = compact({
		seniority: input.requirements?.seniority,
		education: input.requirements?.education,
		skills: skills.length ? skills : undefined,
		languages: languages.length ? languages : undefined
	});
	const normalized: JobPostingInput = {
		title: trimmed(input.title) ?? '',
		description: trimmedText(input.description),
		company: trimmed(input.company),
		status: input.status,
		openings: input.openings,
		location: compact({
			country: location.country,
			city: trimmed(location.city),
			postalCode: trimmed(location.postalCode),
			workMode,
			remoteDaysPerWeek: workMode === 'hybrid' ? location.remoteDaysPerWeek : undefined
		})!,
		contract: compact({
			type: contract.type,
			durationMonths: CONTRACT_TYPES_WITH_DURATION.includes(contract.type)
				? contract.durationMonths
				: undefined,
			startDate: trimmed(contract.startDate),
			trialPeriodMonths: contract.trialPeriodMonths,
			collectiveAgreement: trimmed(contract.collectiveAgreement)
		})!,
		workingTime: compact({
			arrangement: workingTime.arrangement,
			hoursPerWeek:
				workingTime.arrangement === 'weekly_hours' ? workingTime.hoursPerWeek : undefined,
			daysPerYear: workingTime.arrangement === 'annual_days' ? workingTime.daysPerYear : undefined,
			rttDaysPerYear: workingTime.rttDaysPerYear
		})!,
		pay: compact({
			min: pay.min,
			max: pay.max,
			currency: pay.currency,
			period: pay.period,
			variable: trimmed(pay.variable)
		})!,
		organization,
		requirements,
		benefits: benefits.length ? benefits : undefined,
		travel: input.travel
	};
	return compact(normalized)!;
}

// ── Validation ──────────────────────────────────────────────

/** A rule a posting breaks: `field` is the dotted path of the field (e.g. `pay.max`) */
export interface JobPostingProblem {
	field: string;
	message: string;
}

const inRange = (value: number, { min, max }: NumberRange) =>
	Number.isFinite(value) && value >= min && value <= max;

const isWhole = (value: number) => Number.isInteger(value);

/** At most two decimals (cents) */
const hasCents = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

/**
 * Every rule a (normalised) posting breaks, in form order; empty when it can be saved. The
 * request schema already checks types and lengths: these are the rules it cannot express
 * (required fields that depend on others, ranges, min <= max), worded for the recruiter.
 */
export function validateJobPosting(job: JobPostingInput): JobPostingProblem[] {
	const problems: JobPostingProblem[] = [];
	const problem = (field: string, message: string) => problems.push({ field, message });
	const wholeNumber = (
		field: string,
		value: number | undefined,
		range: NumberRange,
		label: string
	) => {
		if (value === undefined) return;
		if (!isWhole(value) || !inRange(value, range)) {
			problem(field, `${label} must be a whole number from ${range.min} to ${range.max}`);
		}
	};

	if (!job.title.trim()) problem('title', 'Title is required');
	if (job.title.length > JOB_LIMITS.title) {
		problem('title', `Title must be at most ${JOB_LIMITS.title} characters`);
	}
	if (!job.description.trim()) problem('description', 'Description is required');
	if (job.description.length > JOB_LIMITS.description) {
		problem('description', `Description must be at most ${JOB_LIMITS.description} characters`);
	}
	if (job.company !== undefined && job.company.length > JOB_LIMITS.company) {
		problem('company', `Company must be at most ${JOB_LIMITS.company} characters`);
	}
	if (!JOB_STATUSES.includes(job.status)) problem('status', 'Unknown status');
	wholeNumber('openings', job.openings, JOB_LIMITS.openings, 'Openings');

	// Location
	const { location } = job;
	if (!JOB_COUNTRIES.includes(location.country)) {
		problem('location.country', 'Only jobs in France are supported for now');
	}
	if (!WORK_MODES.includes(location.workMode)) problem('location.workMode', 'Unknown work mode');
	if (location.workMode !== 'remote' && !location.city?.trim()) {
		problem('location.city', 'City is required unless the job is fully remote');
	}
	if (location.city !== undefined && location.city.length > JOB_LIMITS.city) {
		problem('location.city', `City must be at most ${JOB_LIMITS.city} characters`);
	}
	if (location.postalCode !== undefined && !/^[0-9A-Za-z -]{2,10}$/.test(location.postalCode)) {
		problem('location.postalCode', 'Postal code is not valid');
	}
	if (location.workMode === 'hybrid') {
		wholeNumber(
			'location.remoteDaysPerWeek',
			location.remoteDaysPerWeek,
			JOB_LIMITS.remoteDaysPerWeek,
			'Remote days per week'
		);
	}

	// Contract
	const { contract } = job;
	if (!FR_CONTRACT_TYPES.includes(contract.type)) problem('contract.type', 'Unknown contract type');
	if (FIXED_TERM_CONTRACT_TYPES.includes(contract.type) && contract.durationMonths === undefined) {
		problem('contract.durationMonths', 'Duration is required for this contract');
	}
	wholeNumber(
		'contract.durationMonths',
		contract.durationMonths,
		JOB_LIMITS.durationMonths,
		'Duration'
	);
	if (contract.startDate !== undefined && !isCalendarDate(contract.startDate)) {
		problem('contract.startDate', 'Start date must be a date (YYYY-MM-DD)');
	}
	wholeNumber(
		'contract.trialPeriodMonths',
		contract.trialPeriodMonths,
		JOB_LIMITS.trialPeriodMonths,
		'Trial period'
	);
	if (
		contract.collectiveAgreement !== undefined &&
		contract.collectiveAgreement.length > JOB_LIMITS.collectiveAgreement
	) {
		problem(
			'contract.collectiveAgreement',
			`Collective agreement must be at most ${JOB_LIMITS.collectiveAgreement} characters`
		);
	}

	// Working time
	const { workingTime } = job;
	if (!WORKING_TIME_ARRANGEMENTS.includes(workingTime.arrangement)) {
		problem('workingTime.arrangement', 'Unknown working time arrangement');
	}
	if (workingTime.arrangement === 'weekly_hours') {
		const hours = workingTime.hoursPerWeek;
		if (hours === undefined) problem('workingTime.hoursPerWeek', 'Hours per week are required');
		else if (!inRange(hours, JOB_LIMITS.hoursPerWeek) || !Number.isInteger(hours * 2)) {
			problem(
				'workingTime.hoursPerWeek',
				`Hours per week must be from ${JOB_LIMITS.hoursPerWeek.min} to ${JOB_LIMITS.hoursPerWeek.max} (half hours allowed)`
			);
		}
	}
	if (workingTime.arrangement === 'annual_days') {
		if (workingTime.daysPerYear === undefined) {
			problem('workingTime.daysPerYear', 'Days per year are required');
		} else {
			wholeNumber(
				'workingTime.daysPerYear',
				workingTime.daysPerYear,
				JOB_LIMITS.daysPerYear,
				'Days per year'
			);
		}
	}
	wholeNumber(
		'workingTime.rttDaysPerYear',
		workingTime.rttDaysPerYear,
		JOB_LIMITS.rttDaysPerYear,
		'RTT days per year'
	);

	// Pay
	const { pay } = job;
	const amount = (field: 'pay.min' | 'pay.max', value: number, label: string) => {
		if (!inRange(value, JOB_LIMITS.pay) || !hasCents(value)) {
			problem(field, `${label} must be a positive amount (at most 2 decimals)`);
			return false;
		}
		return true;
	};
	const validMin = amount('pay.min', pay.min, 'Minimum pay');
	const validMax = amount('pay.max', pay.max, 'Maximum pay');
	if (validMin && validMax && pay.max < pay.min) {
		problem('pay.max', 'Maximum pay must not be below the minimum');
	}
	if (!PAY_CURRENCIES.includes(pay.currency)) problem('pay.currency', 'Unknown currency');
	if (!PAY_PERIODS.includes(pay.period)) problem('pay.period', 'Unknown pay period');
	if (pay.variable !== undefined && pay.variable.length > JOB_LIMITS.variablePay) {
		problem('pay.variable', `Variable pay must be at most ${JOB_LIMITS.variablePay} characters`);
	}

	// Team and organisation
	const organization = job.organization ?? {};
	wholeNumber(
		'organization.directReports',
		organization.directReports,
		JOB_LIMITS.directReports,
		'Direct reports'
	);
	wholeNumber('organization.peers', organization.peers, JOB_LIMITS.peers, 'Peers');
	wholeNumber(
		'organization.levelsToCeo',
		organization.levelsToCeo,
		JOB_LIMITS.levelsToCeo,
		'Levels to the CEO'
	);

	// Requirements and conditions
	const requirements = job.requirements ?? {};
	if (requirements.seniority !== undefined && !SENIORITY_LEVELS.includes(requirements.seniority)) {
		problem('requirements.seniority', 'Unknown seniority');
	}
	if (requirements.education !== undefined && !EDUCATION_LEVELS.includes(requirements.education)) {
		problem('requirements.education', 'Unknown education level');
	}
	const list = (field: string, items: string[] | undefined, max: number, label: string) => {
		if (!items) return;
		if (items.length > max) problem(field, `${label}: at most ${max}`);
		if (items.some((item) => item.length > JOB_LIMITS.listItem)) {
			problem(field, `${label}: each one must be at most ${JOB_LIMITS.listItem} characters`);
		}
	};
	list('requirements.skills', requirements.skills, JOB_LIMITS.skills, 'Skills');
	list('requirements.languages', requirements.languages, JOB_LIMITS.languages, 'Languages');
	list('benefits', job.benefits, JOB_LIMITS.benefits, 'Benefits');
	if (job.travel !== undefined && !TRAVEL_FREQUENCIES.includes(job.travel)) {
		problem('travel', 'Unknown travel frequency');
	}

	return problems;
}

// ── Display ─────────────────────────────────────────────────

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
	draft: 'Draft',
	open: 'Open',
	on_hold: 'On hold',
	filled: 'Filled',
	closed: 'Closed'
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
	on_site: 'On site',
	hybrid: 'Hybrid',
	remote: 'Full remote'
};

export const COUNTRY_LABELS: Record<JobCountry, string> = { FR: 'France' };

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
	cdi: 'CDI (permanent)',
	cdd: 'CDD (fixed-term)',
	interim: 'Temporary (intérim)',
	apprenticeship: 'Apprenticeship (apprentissage)',
	professionalisation: 'Work-study (professionnalisation)',
	internship: 'Internship (stage)',
	freelance: 'Freelance'
};

export const WORKING_TIME_LABELS: Record<WorkingTimeArrangement, string> = {
	weekly_hours: 'Hours per week',
	annual_days: 'Days per year (forfait jours)'
};

export const PAY_PERIOD_LABELS: Record<PayPeriod, string> = {
	year: 'per year',
	month: 'per month',
	day: 'per day',
	hour: 'per hour'
};

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
	entry: 'Entry level',
	junior: 'Junior (0-2 years)',
	mid: 'Mid-level (2-5 years)',
	senior: 'Senior (5-10 years)',
	lead: 'Lead / Principal (10+ years)',
	executive: 'Executive'
};

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
	none: 'No diploma required',
	cap_bep: 'CAP / BEP',
	bac: 'Bac',
	bac_2: 'Bac+2',
	bac_3: 'Bac+3 (Licence)',
	bac_5: 'Bac+5 (Master)',
	doctorate: 'Doctorate'
};

export const TRAVEL_LABELS: Record<TravelFrequency, string> = {
	none: 'No travel',
	occasional: 'Occasional travel',
	frequent: 'Frequent travel'
};
