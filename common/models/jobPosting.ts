// Job postings of the recruiter space: the values, limits and rules shared by the API (request
// validation, PUT/POST /jobs) and the client (the job editor's validation and the display of a
// posting). Contract rules depend on the country of the job: France is the first one handled.
import { intlLocale } from '../i18n';
import { isCalendarDate } from './bookingDates';
import { jobPostingMessages as m } from './jobPosting.messages';

// ── Values ──────────────────────────────────────────────────

/**
 * draft: being written; open: hiring, the recruiter can pick it on a candidate's Hire page (the
 * job step); on_hold: paused; filled: someone was hired; closed: withdrawn without hiring. Only
 * an open posting can be picked. No status makes a posting public: its recruiter reads it, and
 * the candidates on whose Hire page they pick it
 */
export const JOB_STATUSES = ['draft', 'open', 'on_hold', 'filled', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** The status of a posting that is hiring: the only one the job step of a hiring journey takes */
export const OPEN_JOB_STATUS: JobStatus = 'open';

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
	/** The office's street and number */
	address: 200,
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
	/**
	 * Pay amounts, in the currency's units (cents allowed). maxRangeRatio: the top of a pay range
	 * is at most that many times its bottom (a candidate's pay criterion is matched by where it
	 * falls in the range, perfectJob.ts's PAY_MATCH)
	 */
	pay: { min: 0.01, max: 10_000_000, maxRangeRatio: 1.5 },
	/** Years a start date can fall in: a typo (0202) or a placeholder (0000) is refused */
	startDateYear: { min: 2000, max: 2100 },
	directReports: { min: 0, max: 100_000 },
	peers: { min: 0, max: 100_000 },
	/** 0: the job is the CEO; 1: reports to the CEO */
	levelsToCeo: { min: 0, max: 30 },
	/** Postings a recruiter can keep */
	jobsPerRecruiter: 200
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
		/**
		 * The office's street and number, when the job has one ("12 rue de la République"): the
		 * travel time of a candidate is computed to it, to the city's centre without it
		 */
		address?: string;
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

/**
 * The version of a job posting a recruiter shared with a candidate: the posting without its
 * status, which is the live posting's (a version shared stays shared when the posting is closed,
 * and holds only while it is open). The job step of a hiring journey keeps the version picked
 * (normalised, its pay range brought down to the top it is scored with): what the owner reads and
 * the job match scores, until the recruiter shares the posting again.
 */
export type JobSnapshot = Omit<JobPostingInput, 'status'>;

/** The dotted paths of an object's fields, down to the values (a list is a value) */
type FieldPaths<T> = {
	[K in keyof T & string]-?: NonNullable<T[K]> extends readonly unknown[]
		? K
		: NonNullable<T[K]> extends object
			? `${K}.${FieldPaths<NonNullable<T[K]>>}`
			: K;
}[keyof T & string];

/**
 * Every field of a job posting, as a dotted path (`location.city`, `pay.min`): what
 * validateJobPosting names, and what the perfect job says its criteria read (perfectJob.ts's
 * JOB_FIELD_CRITERIA, which must list each of them)
 */
export type JobFieldPath = FieldPaths<JobPostingInput>;

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

/** At most two decimals (cents), float noise aside (0.1 + 0.2) */
const hasCents = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

/** An amount of at most two decimals, in whole cents */
const cents = (value: number) => Math.round(value * 100);

/**
 * The highest maximum pay a minimum allows: JOB_LIMITS.pay.maxRangeRatio times it, rounded down
 * to cents
 */
export const highestPayMax = (min: number): number =>
	Math.floor(cents(min) * JOB_LIMITS.pay.maxRangeRatio) / 100;

/**
 * A pay range whose top is over JOB_LIMITS.pay.maxRangeRatio times its bottom: what
 * validateJobPosting refuses (compared in whole cents, where 1.5 times an amount is exact)
 */
export const isPayRangeTooWide = (pay: { min: number; max: number }): boolean =>
	cents(pay.max) > cents(highestPayMax(pay.min));

/**
 * A pay amount as the language in use writes it: '€67,500', '67 500 €', '€49.99' (a currency
 * that is not one of PAY_CURRENCIES is written in euros). The one formatter of pay amounts: the
 * problems of validateJobPosting and every page that shows a posting's pay
 */
export const formatPayAmount = (amount: number, currency: string = 'EUR'): string =>
	new Intl.NumberFormat(intlLocale(), {
		style: 'currency',
		currency: (PAY_CURRENCIES as readonly string[]).includes(currency) ? currency : 'EUR',
		minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
		maximumFractionDigits: 2
	}).format(amount);

/**
 * What validateJobPosting says of a pay range wider than JOB_LIMITS.pay.maxRangeRatio times its
 * bottom (on `pay.max`: the most its top can be, in the language in use); undefined for a range
 * that is not. Also what the API answers when a posting saved so before the cap is first opened
 */
export const payRangeTooWideMessage = (pay: {
	min: number;
	max: number;
	currency: string;
}): string | undefined =>
	isPayRangeTooWide(pay)
		? m.problems.payRangeTooWide(
				JOB_LIMITS.pay.maxRangeRatio,
				formatPayAmount(highestPayMax(pay.min), pay.currency)
			)
		: undefined;

/**
 * An amount of at most two decimals as exactly that (45000.000000001 is 45000): what is stored
 * never carries float noise. Other values are left for validation to refuse (45000.001, NaN).
 */
const roundedCents = (value: number) =>
	Number.isFinite(value) && hasCents(value) ? Math.round(value * 100) / 100 : value;

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
			address: trimmed(location.address),
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
			min: roundedCents(pay.min),
			max: roundedCents(pay.max),
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

/** A start date: a YYYY-MM-DD calendar date of a year JOB_LIMITS.startDateYear allows */
export const isJobStartDate = (value: string): boolean =>
	isCalendarDate(value) && inRange(Number(value.slice(0, 4)), JOB_LIMITS.startDateYear);

/**
 * Every rule a (normalised) posting breaks, in form order; empty when it can be saved. The
 * request schema already checks types and lengths: these are the rules it cannot express
 * (required fields that depend on others, ranges, min <= max), worded for the recruiter in the
 * language in use.
 */
export function validateJobPosting(job: JobPostingInput): JobPostingProblem[] {
	const problems: JobPostingProblem[] = [];
	const problem = (field: string, message: string) => problems.push({ field, message });
	const wholeNumber = (
		field: string,
		value: number | undefined,
		range: NumberRange,
		message: (min: number, max: number) => string
	) => {
		if (value === undefined) return;
		if (!isWhole(value) || !inRange(value, range)) problem(field, message(range.min, range.max));
	};
	const { tooLong } = m.problems;

	if (!job.title.trim()) problem('title', m.problems.titleRequired);
	if (job.title.length > JOB_LIMITS.title) problem('title', tooLong.title(JOB_LIMITS.title));
	if (!job.description.trim()) problem('description', m.problems.descriptionRequired);
	if (job.description.length > JOB_LIMITS.description) {
		problem('description', tooLong.description(JOB_LIMITS.description));
	}
	if (job.company !== undefined && job.company.length > JOB_LIMITS.company) {
		problem('company', tooLong.company(JOB_LIMITS.company));
	}
	if (!JOB_STATUSES.includes(job.status)) problem('status', m.problems.unknownStatus);
	wholeNumber('openings', job.openings, JOB_LIMITS.openings, m.problems.wholeNumber.openings);

	// Location
	const { location } = job;
	if (!JOB_COUNTRIES.includes(location.country)) {
		problem('location.country', m.problems.unsupportedCountry);
	}
	if (!WORK_MODES.includes(location.workMode)) {
		problem('location.workMode', m.problems.unknownWorkMode);
	}
	if (location.workMode !== 'remote' && !location.city?.trim()) {
		problem('location.city', m.problems.cityRequired);
	}
	if (location.city !== undefined && location.city.length > JOB_LIMITS.city) {
		problem('location.city', tooLong.city(JOB_LIMITS.city));
	}
	if (location.postalCode !== undefined && !/^[0-9A-Za-z -]{2,10}$/.test(location.postalCode)) {
		problem('location.postalCode', m.problems.invalidPostalCode);
	}
	if (location.address !== undefined && location.address.length > JOB_LIMITS.address) {
		problem('location.address', tooLong.address(JOB_LIMITS.address));
	}
	if (location.workMode === 'hybrid') {
		wholeNumber(
			'location.remoteDaysPerWeek',
			location.remoteDaysPerWeek,
			JOB_LIMITS.remoteDaysPerWeek,
			m.problems.wholeNumber.remoteDaysPerWeek
		);
	}

	// Contract
	const { contract } = job;
	if (!FR_CONTRACT_TYPES.includes(contract.type)) {
		problem('contract.type', m.problems.unknownContractType);
	}
	if (FIXED_TERM_CONTRACT_TYPES.includes(contract.type) && contract.durationMonths === undefined) {
		problem('contract.durationMonths', m.problems.durationRequired);
	}
	wholeNumber(
		'contract.durationMonths',
		contract.durationMonths,
		JOB_LIMITS.durationMonths,
		m.problems.wholeNumber.durationMonths
	);
	if (contract.startDate !== undefined && !isJobStartDate(contract.startDate)) {
		problem(
			'contract.startDate',
			m.problems.startDate(JOB_LIMITS.startDateYear.min, JOB_LIMITS.startDateYear.max)
		);
	}
	wholeNumber(
		'contract.trialPeriodMonths',
		contract.trialPeriodMonths,
		JOB_LIMITS.trialPeriodMonths,
		m.problems.wholeNumber.trialPeriodMonths
	);
	if (
		contract.collectiveAgreement !== undefined &&
		contract.collectiveAgreement.length > JOB_LIMITS.collectiveAgreement
	) {
		problem(
			'contract.collectiveAgreement',
			tooLong.collectiveAgreement(JOB_LIMITS.collectiveAgreement)
		);
	}

	// Working time
	const { workingTime } = job;
	if (!WORKING_TIME_ARRANGEMENTS.includes(workingTime.arrangement)) {
		problem('workingTime.arrangement', m.problems.unknownWorkingTime);
	}
	if (workingTime.arrangement === 'weekly_hours') {
		const hours = workingTime.hoursPerWeek;
		if (hours === undefined) {
			problem('workingTime.hoursPerWeek', m.problems.hoursPerWeekRequired);
		} else if (!inRange(hours, JOB_LIMITS.hoursPerWeek) || !Number.isInteger(hours * 2)) {
			problem(
				'workingTime.hoursPerWeek',
				m.problems.hoursPerWeek(JOB_LIMITS.hoursPerWeek.min, JOB_LIMITS.hoursPerWeek.max)
			);
		}
	}
	if (workingTime.arrangement === 'annual_days') {
		if (workingTime.daysPerYear === undefined) {
			problem('workingTime.daysPerYear', m.problems.daysPerYearRequired);
		} else {
			wholeNumber(
				'workingTime.daysPerYear',
				workingTime.daysPerYear,
				JOB_LIMITS.daysPerYear,
				m.problems.wholeNumber.daysPerYear
			);
		}
	}
	wholeNumber(
		'workingTime.rttDaysPerYear',
		workingTime.rttDaysPerYear,
		JOB_LIMITS.rttDaysPerYear,
		m.problems.wholeNumber.rttDaysPerYear
	);

	// Pay
	const { pay } = job;
	const amount = (field: 'pay.min' | 'pay.max', value: number, message: string) => {
		if (!inRange(value, JOB_LIMITS.pay) || !hasCents(value)) {
			problem(field, message);
			return false;
		}
		return true;
	};
	const validMin = amount('pay.min', pay.min, m.problems.amount.min);
	const validMax = amount('pay.max', pay.max, m.problems.amount.max);
	const tooWide = validMin && validMax ? payRangeTooWideMessage(pay) : undefined;
	if (validMin && validMax && pay.max < pay.min) {
		problem('pay.max', m.problems.payMaxBelowMin);
	} else if (tooWide) {
		problem('pay.max', tooWide);
	}
	if (!PAY_CURRENCIES.includes(pay.currency)) problem('pay.currency', m.problems.unknownCurrency);
	if (!PAY_PERIODS.includes(pay.period)) problem('pay.period', m.problems.unknownPayPeriod);
	if (pay.variable !== undefined && pay.variable.length > JOB_LIMITS.variablePay) {
		problem('pay.variable', tooLong.variablePay(JOB_LIMITS.variablePay));
	}

	// Team and organisation
	const organization = job.organization ?? {};
	wholeNumber(
		'organization.directReports',
		organization.directReports,
		JOB_LIMITS.directReports,
		m.problems.wholeNumber.directReports
	);
	wholeNumber(
		'organization.peers',
		organization.peers,
		JOB_LIMITS.peers,
		m.problems.wholeNumber.peers
	);
	wholeNumber(
		'organization.levelsToCeo',
		organization.levelsToCeo,
		JOB_LIMITS.levelsToCeo,
		m.problems.wholeNumber.levelsToCeo
	);

	// Requirements and conditions
	const requirements = job.requirements ?? {};
	if (requirements.seniority !== undefined && !SENIORITY_LEVELS.includes(requirements.seniority)) {
		problem('requirements.seniority', m.problems.unknownSeniority);
	}
	if (requirements.education !== undefined && !EDUCATION_LEVELS.includes(requirements.education)) {
		problem('requirements.education', m.problems.unknownEducation);
	}
	const list = (
		field: string,
		items: string[] | undefined,
		max: number,
		messages: { tooMany: (max: number) => string; itemTooLong: (max: number) => string }
	) => {
		if (!items) return;
		if (items.length > max) problem(field, messages.tooMany(max));
		if (items.some((item) => item.length > JOB_LIMITS.listItem)) {
			problem(field, messages.itemTooLong(JOB_LIMITS.listItem));
		}
	};
	list('requirements.skills', requirements.skills, JOB_LIMITS.skills, m.problems.list.skills);
	list(
		'requirements.languages',
		requirements.languages,
		JOB_LIMITS.languages,
		m.problems.list.languages
	);
	list('benefits', job.benefits, JOB_LIMITS.benefits, m.problems.list.benefits);
	if (job.travel !== undefined && !TRAVEL_FREQUENCIES.includes(job.travel)) {
		problem('travel', m.problems.unknownTravel);
	}

	return problems;
}

// ── Display ─────────────────────────────────────────────────

// The labels are messages (jobPosting.messages.ts): read one when it is shown
// (`JOB_STATUS_LABELS[status]`), it is in the language in use. A label kept in a module-level
// constant would stay in English.

export const JOB_STATUS_LABELS: Record<JobStatus, string> = m.status;

export const WORK_MODE_LABELS: Record<WorkMode, string> = m.workMode;

export const COUNTRY_LABELS: Record<JobCountry, string> = m.country;

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = m.contractType;

export const WORKING_TIME_LABELS: Record<WorkingTimeArrangement, string> = m.workingTime;

export const PAY_PERIOD_LABELS: Record<PayPeriod, string> = m.payPeriod;

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = m.seniority;

export const EDUCATION_LABELS: Record<EducationLevel, string> = m.education;

export const TRAVEL_LABELS: Record<TravelFrequency, string> = m.travel;

// ── Private page (web path) ─────────────────────────────────

/**
 * The web client's page of the job posting `jobId` for the people it was shared with
 * (/opportunities/:id): what the meeting invitation of a hiring journey links (the job step's
 * describe() in the API), and where the client sends the candidate. One path for both, so the
 * link and the route cannot drift apart. It is private: only the posting's recruiter and the
 * candidates whose journey it is picked on can open it, signed in (GET /opportunities/jobs/:id)
 */
export const opportunityPath = (jobId: string): string =>
	`/opportunities/${encodeURIComponent(jobId)}`;
