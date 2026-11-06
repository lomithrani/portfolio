import {
	CONTRACT_TYPES_WITH_DURATION,
	CONTRACT_TYPE_LABELS,
	COUNTRY_LABELS,
	EDUCATION_LABELS,
	FIXED_TERM_CONTRACT_TYPES,
	FR_FULL_TIME_HOURS_PER_WEEK,
	JOB_STATUS_LABELS,
	PAY_PERIOD_LABELS,
	SENIORITY_LABELS,
	TRAVEL_LABELS,
	WORK_MODE_LABELS,
	normalizeJobPosting,
	validateJobPosting,
	type ContractType,
	type EducationLevel,
	type JobPostingInput,
	type JobStatus,
	type PayPeriod,
	type SeniorityLevel,
	type TravelFrequency,
	type WorkMode,
	type WorkingTimeArrangement
} from 'portfolio-common';

// Pure helpers of the job posting editor and of every page showing a posting (recruiter
// dashboard, public job page). The rules live in portfolio-common (normalizeJobPosting,
// validateJobPosting), shared with the API: the editor shows the API's own messages before
// saving. Nothing here knows the UI.

// --- Shapes ----------------------------------------------------------------------------

/**
 * A posting as the API returns it, or a draft of the PDF import (any field may be missing).
 * Eden Treaty turns every JSON string that looks like a date into a Date, plain YYYY-MM-DD
 * included: `contract.startDate` can arrive as a Date although the API sends a string.
 */
export type JobPostingLike = DeepPartial<Omit<JobPostingInput, 'contract'>> & {
	contract?: DeepPartial<Omit<JobPostingInput['contract'], 'startDate'>> & {
		startDate?: string | Date;
	};
};

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * The editor's state: one flat field per input. Numbers are kept as typed (French users write
 * "45 000" or "11,88"), parsed when the form is checked or sent.
 */
export type JobForm = {
	title: string;
	/** Markdown */
	description: string;
	company: string;
	status: JobStatus;
	openings: string;
	city: string;
	postalCode: string;
	workMode: WorkMode;
	remoteDaysPerWeek: string;
	contractType: ContractType;
	durationMonths: string;
	/** YYYY-MM-DD or '' (as soon as possible) */
	startDate: string;
	trialPeriodMonths: string;
	collectiveAgreement: string;
	arrangement: WorkingTimeArrangement;
	hoursPerWeek: string;
	daysPerYear: string;
	rttDaysPerYear: string;
	payMin: string;
	payMax: string;
	payPeriod: PayPeriod;
	payVariable: string;
	directReports: string;
	peers: string;
	levelsToCeo: string;
	seniority: SeniorityLevel | '';
	education: EducationLevel | '';
	skills: string[];
	languages: string[];
	benefits: string[];
	travel: TravelFrequency | '';
};

export type JobFormField = keyof JobForm;

/** A new posting: a draft of a full-time CDI on site, paid per year */
export const emptyJobForm = (): JobForm => ({
	title: '',
	description: '',
	company: '',
	status: 'draft',
	openings: '1',
	city: '',
	postalCode: '',
	workMode: 'on_site',
	remoteDaysPerWeek: '',
	contractType: 'cdi',
	durationMonths: '',
	startDate: '',
	trialPeriodMonths: '',
	collectiveAgreement: '',
	arrangement: 'weekly_hours',
	hoursPerWeek: String(FR_FULL_TIME_HOURS_PER_WEEK),
	daysPerYear: '',
	rttDaysPerYear: '',
	payMin: '',
	payMax: '',
	payPeriod: 'year',
	payVariable: '',
	directReports: '',
	peers: '',
	levelsToCeo: '',
	seniority: '',
	education: '',
	skills: [],
	languages: [],
	benefits: [],
	travel: ''
});

// --- Numbers ----------------------------------------------------------------------------

/**
 * A number as typed: spaces (thin and non-breaking ones too) ignored, a decimal comma accepted.
 * undefined when blank, NaN when it is not a number.
 */
export const parseFormNumber = (text: string): number | undefined => {
	const compact = text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
	if (!compact) return undefined;
	return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(compact) ? Number(compact) : Number.NaN;
};

const numberText = (value: number | undefined): string =>
	value === undefined || !Number.isFinite(value) ? '' : String(value);

/** YYYY-MM-DD of a start date, whether it arrived as a string or (through Eden) as a Date */
export const startDateKey = (value: string | Date | undefined | null): string => {
	if (!value) return '';
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
	}
	return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
};

// --- Conversions ------------------------------------------------------------------------

/** The form of a posting (to edit it) or of an imported draft (to complete it) */
export const jobToForm = (job: JobPostingLike): JobForm => {
	const empty = emptyJobForm();
	return {
		title: job.title ?? '',
		description: job.description ?? '',
		company: job.company ?? '',
		status: job.status ?? empty.status,
		openings: job.openings === undefined ? empty.openings : numberText(job.openings),
		city: job.location?.city ?? '',
		postalCode: job.location?.postalCode ?? '',
		workMode: job.location?.workMode ?? empty.workMode,
		remoteDaysPerWeek: numberText(job.location?.remoteDaysPerWeek),
		contractType: job.contract?.type ?? empty.contractType,
		durationMonths: numberText(job.contract?.durationMonths),
		startDate: startDateKey(job.contract?.startDate),
		trialPeriodMonths: numberText(job.contract?.trialPeriodMonths),
		collectiveAgreement: job.contract?.collectiveAgreement ?? '',
		arrangement: job.workingTime?.arrangement ?? empty.arrangement,
		// A posting without weekly hours (e.g. a forfait jours) does not get the 35 h default
		hoursPerWeek: job.workingTime ? numberText(job.workingTime.hoursPerWeek) : empty.hoursPerWeek,
		daysPerYear: numberText(job.workingTime?.daysPerYear),
		rttDaysPerYear: numberText(job.workingTime?.rttDaysPerYear),
		payMin: numberText(job.pay?.min),
		payMax: numberText(job.pay?.max),
		payPeriod: job.pay?.period ?? empty.payPeriod,
		payVariable: job.pay?.variable ?? '',
		directReports: numberText(job.organization?.directReports),
		peers: numberText(job.organization?.peers),
		levelsToCeo: numberText(job.organization?.levelsToCeo),
		seniority: job.requirements?.seniority ?? '',
		education: job.requirements?.education ?? '',
		skills: [...(job.requirements?.skills ?? [])],
		languages: [...(job.requirements?.languages ?? [])],
		benefits: [...(job.benefits ?? [])],
		travel: job.travel ?? ''
	};
};

/** Blank text -> undefined; NaN stays (the API refuses it: the form never sends it) */
const optionalNumber = (text: string) => parseFormNumber(text);

/**
 * The request body of POST /jobs and PUT /jobs/:id, normalised like the API does (fields that do
 * not apply dropped). Check jobFormErrors first: it never holds an unparsable number then.
 */
export const formToJobInput = (form: JobForm): JobPostingInput =>
	normalizeJobPosting({
		title: form.title,
		description: form.description,
		company: form.company,
		status: form.status,
		openings: optionalNumber(form.openings),
		location: {
			country: 'FR',
			city: form.city,
			postalCode: form.postalCode,
			workMode: form.workMode,
			remoteDaysPerWeek: optionalNumber(form.remoteDaysPerWeek)
		},
		contract: {
			type: form.contractType,
			durationMonths: optionalNumber(form.durationMonths),
			startDate: form.startDate,
			trialPeriodMonths: optionalNumber(form.trialPeriodMonths),
			collectiveAgreement: form.collectiveAgreement
		},
		workingTime: {
			arrangement: form.arrangement,
			hoursPerWeek: optionalNumber(form.hoursPerWeek),
			daysPerYear: optionalNumber(form.daysPerYear),
			rttDaysPerYear: optionalNumber(form.rttDaysPerYear)
		},
		pay: {
			// Required: a blank one is NaN, which validation reports
			min: optionalNumber(form.payMin) ?? Number.NaN,
			max: optionalNumber(form.payMax) ?? Number.NaN,
			currency: 'EUR',
			period: form.payPeriod,
			variable: form.payVariable
		},
		organization: {
			directReports: optionalNumber(form.directReports),
			peers: optionalNumber(form.peers),
			levelsToCeo: optionalNumber(form.levelsToCeo)
		},
		requirements: {
			seniority: form.seniority || undefined,
			education: form.education || undefined,
			skills: form.skills,
			languages: form.languages
		},
		benefits: form.benefits,
		travel: form.travel || undefined
	});

// --- Validation -------------------------------------------------------------------------

/** The form field of a posting field path (validateJobPosting's, or a 422's `property`) */
const FIELD_OF_PATH: Record<string, JobFormField> = {
	title: 'title',
	description: 'description',
	company: 'company',
	status: 'status',
	openings: 'openings',
	'location.city': 'city',
	'location.postalCode': 'postalCode',
	'location.workMode': 'workMode',
	'location.remoteDaysPerWeek': 'remoteDaysPerWeek',
	'contract.type': 'contractType',
	'contract.durationMonths': 'durationMonths',
	'contract.startDate': 'startDate',
	'contract.trialPeriodMonths': 'trialPeriodMonths',
	'contract.collectiveAgreement': 'collectiveAgreement',
	'workingTime.arrangement': 'arrangement',
	'workingTime.hoursPerWeek': 'hoursPerWeek',
	'workingTime.daysPerYear': 'daysPerYear',
	'workingTime.rttDaysPerYear': 'rttDaysPerYear',
	'pay.min': 'payMin',
	'pay.max': 'payMax',
	'pay.period': 'payPeriod',
	'pay.variable': 'payVariable',
	'organization.directReports': 'directReports',
	'organization.peers': 'peers',
	'organization.levelsToCeo': 'levelsToCeo',
	'requirements.seniority': 'seniority',
	'requirements.education': 'education',
	'requirements.skills': 'skills',
	'requirements.languages': 'languages',
	benefits: 'benefits',
	travel: 'travel'
};

/**
 * The form field a 422's `property` names (dotted, or with list indexes: `requirements.skills.3`
 * is the skills field); undefined when it names none.
 */
export const jobFieldOfProperty = (property: string | undefined): JobFormField | undefined => {
	if (!property) return undefined;
	const path = property.replace(/^\//, '').replace(/\//g, '.');
	if (FIELD_OF_PATH[path]) return FIELD_OF_PATH[path];
	const withoutIndex = path.replace(/\.\d+$/, '');
	return FIELD_OF_PATH[withoutIndex];
};

/** The number fields, with how they are named in messages */
const NUMBER_FIELDS: [JobFormField, string][] = [
	['openings', 'Openings'],
	['remoteDaysPerWeek', 'Remote days per week'],
	['durationMonths', 'Duration'],
	['trialPeriodMonths', 'Trial period'],
	['hoursPerWeek', 'Hours per week'],
	['daysPerYear', 'Days per year'],
	['rttDaysPerYear', 'RTT days'],
	['payMin', 'Minimum pay'],
	['payMax', 'Maximum pay'],
	['directReports', 'Direct reports'],
	['peers', 'Peers'],
	['levelsToCeo', 'Levels to the CEO']
];

/** Errors of the form, one message per field (the first), in form order; empty when it can be saved */
export const jobFormErrors = (form: JobForm): Partial<Record<JobFormField, string>> => {
	const errors: Partial<Record<JobFormField, string>> = {};
	for (const [field, label] of NUMBER_FIELDS) {
		if (Number.isNaN(parseFormNumber(form[field] as string))) {
			errors[field] = `${label} must be a number`;
		}
	}
	if (parseFormNumber(form.payMin) === undefined) errors.payMin ??= 'Minimum pay is required';
	if (parseFormNumber(form.payMax) === undefined) errors.payMax ??= 'Maximum pay is required';
	const input = formToJobInput(form);
	for (const problem of validateJobPosting(input)) {
		const field = jobFieldOfProperty(problem.field);
		if (field) errors[field] ??= problem.message;
	}
	return errors;
};

/** Whether the contract type needs a duration (and whether the field is shown at all) */
export const contractNeedsDuration = (type: ContractType): boolean =>
	FIXED_TERM_CONTRACT_TYPES.includes(type);

export const contractHasDuration = (type: ContractType): boolean =>
	CONTRACT_TYPES_WITH_DURATION.includes(type);

/** Same posting, ignoring how numbers and blanks were typed: to warn about unsaved changes */
export const jobFormSignature = (form: JobForm): string => JSON.stringify(formToJobInput(form));

// --- Display ----------------------------------------------------------------------------

const LOCALE = 'en-GB';

/** '€45,000', '€11.88' */
export const formatAmount = (amount: number, currency = 'EUR'): string =>
	new Intl.NumberFormat(LOCALE, {
		style: 'currency',
		currency,
		minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
		maximumFractionDigits: 2
	}).format(amount);

/** '€45,000 – €55,000 gross per year', '€500 gross per day' (min equal to max: a fixed pay) */
export const formatPay = (pay: JobPostingLike['pay']): string => {
	if (pay?.min === undefined || pay.max === undefined) return '';
	const currency = pay.currency ?? 'EUR';
	const range =
		pay.min === pay.max
			? formatAmount(pay.min, currency)
			: `${formatAmount(pay.min, currency)} – ${formatAmount(pay.max, currency)}`;
	return `${range} gross${pay.period ? ` ${PAY_PERIOD_LABELS[pay.period]}` : ''}`;
};

/** '39 h/week', '28 h/week (part-time)', '218 days/year (forfait jours)', plus RTT days */
export const formatWorkingTime = (workingTime: JobPostingLike['workingTime']): string => {
	if (!workingTime) return '';
	const parts: string[] = [];
	if (workingTime.arrangement === 'weekly_hours' && workingTime.hoursPerWeek !== undefined) {
		const hours = workingTime.hoursPerWeek;
		parts.push(`${hours} h/week${hours < FR_FULL_TIME_HOURS_PER_WEEK ? ' (part-time)' : ''}`);
	}
	if (workingTime.arrangement === 'annual_days' && workingTime.daysPerYear !== undefined) {
		parts.push(`${workingTime.daysPerYear} days/year (forfait jours)`);
	}
	if (workingTime.rttDaysPerYear) {
		parts.push(
			`${workingTime.rttDaysPerYear} RTT ${workingTime.rttDaysPerYear === 1 ? 'day' : 'days'}`
		);
	}
	return parts.join(' · ');
};

/** 'Lyon (69003), France', 'France' (fully remote without a city) */
export const formatPlace = (location: JobPostingLike['location']): string => {
	if (!location) return '';
	const country = location.country ? COUNTRY_LABELS[location.country] : '';
	const city = location.city
		? `${location.city}${location.postalCode ? ` (${location.postalCode})` : ''}`
		: '';
	return [city, country].filter(Boolean).join(', ');
};

/** 'Hybrid (2 days remote a week)', 'Full remote', 'On site' */
export const formatWorkMode = (location: JobPostingLike['location']): string => {
	if (!location?.workMode) return '';
	const label = WORK_MODE_LABELS[location.workMode];
	const days = location.remoteDaysPerWeek;
	return location.workMode === 'hybrid' && days
		? `${label} (${days} ${days === 1 ? 'day' : 'days'} remote a week)`
		: label;
};

/** '1 Dec 2026' (a calendar date: no time zone shift) */
export const formatStartDate = (value: string | Date | undefined): string => {
	const key = startDateKey(value);
	if (!key) return '';
	return new Date(`${key}T00:00:00Z`).toLocaleDateString(LOCALE, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
};

const months = (count: number) => `${count} ${count === 1 ? 'month' : 'months'}`;

/** 'CDD (fixed-term) · 6 months', 'CDI (permanent)' */
export const formatContract = (contract: JobPostingLike['contract']): string => {
	if (!contract?.type) return '';
	const parts = [CONTRACT_TYPE_LABELS[contract.type]];
	if (contract.durationMonths) parts.push(months(contract.durationMonths));
	return parts.join(' · ');
};

/** 'Starts 1 Dec 2026', 'Starts as soon as possible' */
export const formatStart = (contract: JobPostingLike['contract']): string => {
	const date = formatStartDate(contract?.startDate);
	return date ? `Starts ${date}` : 'Starts as soon as possible';
};

export const formatTrialPeriod = (count: number | undefined): string =>
	count ? `${months(count)} trial period` : '';

/** 'Reports to the CEO', '3 levels below the CEO', 'Is the CEO' */
export const formatLevelsToCeo = (levels: number | undefined): string => {
	if (levels === undefined) return '';
	if (levels === 0) return 'Is the CEO';
	if (levels === 1) return 'Reports to the CEO';
	return `${levels} levels below the CEO`;
};

/** '4 direct reports', 'No direct reports' */
export const formatDirectReports = (count: number | undefined): string => {
	if (count === undefined) return '';
	if (count === 0) return 'No direct reports';
	return `${count} direct ${count === 1 ? 'report' : 'reports'}`;
};

/** '5 peers (same manager)' */
export const formatPeers = (count: number | undefined): string => {
	if (count === undefined) return '';
	if (count === 0) return 'No peers under the same manager';
	return `${count} ${count === 1 ? 'peer' : 'peers'} under the same manager`;
};

export const statusLabel = (status: JobStatus): string => JOB_STATUS_LABELS[status];

/** Skeleton preset of a status badge */
export const statusBadgeClass = (status: JobStatus): string =>
	({
		draft: 'preset-tonal-surface',
		open: 'preset-filled-success-500',
		on_hold: 'preset-filled-warning-500',
		filled: 'preset-filled-primary-500',
		closed: 'preset-tonal-error'
	})[status];

export const seniorityLabel = (level: SeniorityLevel | undefined): string =>
	level ? SENIORITY_LABELS[level] : '';

export const educationLabel = (level: EducationLevel | undefined): string =>
	level ? EDUCATION_LABELS[level] : '';

export const travelLabel = (travel: TravelFrequency | undefined): string =>
	travel ? TRAVEL_LABELS[travel] : '';
