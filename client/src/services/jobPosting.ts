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

/**
 * The form of a posting (to edit it) or of an imported draft (to complete it). A saved posting
 * (it has an `_id`) without openings keeps none: the new form's '1' would be saved over it
 */
export const jobToForm = (job: JobPostingLike): JobForm => {
	const empty = emptyJobForm();
	const saved = '_id' in job;
	return {
		title: job.title ?? '',
		description: job.description ?? '',
		company: job.company ?? '',
		status: job.status ?? empty.status,
		openings: job.openings === undefined ? (saved ? '' : empty.openings) : numberText(job.openings),
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

/**
 * Whether a field applies to the form as it is (the editor hides the others, and they are not
 * sent): the remote days of a hybrid job, the duration of a contract that has one, the hours
 * or the days of the working time arrangement chosen.
 */
export const jobFieldApplies = (form: JobForm, field: JobFormField): boolean => {
	switch (field) {
		case 'remoteDaysPerWeek':
			return form.workMode === 'hybrid';
		case 'durationMonths':
			return contractHasDuration(form.contractType);
		case 'hoursPerWeek':
			return form.arrangement === 'weekly_hours';
		case 'daysPerYear':
			return form.arrangement === 'annual_days';
		default:
			return true;
	}
};

/**
 * Errors of the form, one message per field (the first); empty when it can be saved. Fields
 * that do not apply (hidden, not sent) have none. orderedJobFormErrors lists them in form order.
 */
export const jobFormErrors = (form: JobForm): Partial<Record<JobFormField, string>> => {
	const errors: Partial<Record<JobFormField, string>> = {};
	for (const [field, label] of NUMBER_FIELDS) {
		if (!jobFieldApplies(form, field)) continue;
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

/** The editor's fields in the order it shows them */
export const JOB_FORM_FIELDS: readonly JobFormField[] = [
	'title',
	'company',
	'status',
	'openings',
	'description',
	'workMode',
	'city',
	'postalCode',
	'remoteDaysPerWeek',
	'contractType',
	'durationMonths',
	'startDate',
	'trialPeriodMonths',
	'collectiveAgreement',
	'arrangement',
	'hoursPerWeek',
	'daysPerYear',
	'rttDaysPerYear',
	'payMin',
	'payMax',
	'payPeriod',
	'payVariable',
	'directReports',
	'peers',
	'levelsToCeo',
	'seniority',
	'education',
	'skills',
	'languages',
	'benefits',
	'travel'
];

/** How the editor names each field (its label; the error summary's links) */
export const JOB_FIELD_LABELS: Record<JobFormField, string> = {
	title: 'Job title',
	company: 'Company',
	status: 'Status',
	openings: 'Openings',
	description: 'Description',
	workMode: 'Work mode',
	city: 'City',
	postalCode: 'Postal code',
	remoteDaysPerWeek: 'Remote days a week',
	contractType: 'Contract type',
	durationMonths: 'Duration',
	startDate: 'Start date',
	trialPeriodMonths: 'Trial period',
	collectiveAgreement: 'Collective agreement',
	arrangement: 'Working time',
	hoursPerWeek: 'Hours per week',
	daysPerYear: 'Days per year',
	rttDaysPerYear: 'RTT days per year',
	payMin: 'Minimum pay',
	payMax: 'Maximum pay',
	payPeriod: 'Pay period',
	payVariable: 'Variable pay',
	directReports: 'Direct reports',
	peers: 'Peers under the same manager',
	levelsToCeo: 'Levels to the CEO',
	seniority: 'Seniority',
	education: 'Education',
	skills: 'Skills',
	languages: 'Languages',
	benefits: 'Benefits',
	travel: 'Travel'
};

export type JobFieldError = { field: JobFormField; label: string; message: string };

/** The errors of jobFormErrors (or any per-field messages), in the editor's order */
export const orderedJobFormErrors = (
	errors: Partial<Record<JobFormField, string>>
): JobFieldError[] =>
	JOB_FORM_FIELDS.flatMap((field) => {
		const message = errors[field];
		return message ? [{ field, label: JOB_FIELD_LABELS[field], message }] : [];
	});

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

/**
 * '39 h/week', '28 h/week (part-time)', '218 days a year (forfait jours: …)', plus RTT days. The
 * French terms are explained where candidates read them
 */
export const formatWorkingTime = (workingTime: JobPostingLike['workingTime']): string => {
	if (!workingTime) return '';
	const parts: string[] = [];
	if (workingTime.arrangement === 'weekly_hours' && workingTime.hoursPerWeek !== undefined) {
		const hours = workingTime.hoursPerWeek;
		parts.push(`${hours} h/week${hours < FR_FULL_TIME_HOURS_PER_WEEK ? ' (part-time)' : ''}`);
	}
	if (workingTime.arrangement === 'annual_days' && workingTime.daysPerYear !== undefined) {
		parts.push(
			`${workingTime.daysPerYear} days a year (forfait jours: counted in days worked, no weekly hours)`
		);
	}
	if (workingTime.rttDaysPerYear) {
		const days = workingTime.rttDaysPerYear;
		parts.push(
			days === 1
				? '1 RTT day (an extra day off a year)'
				: `${days} RTT days (extra days off a year)`
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
		draft: 'preset-filled-surface-300-700',
		open: 'preset-filled-success-500',
		on_hold: 'preset-filled-warning-500',
		filled: 'preset-filled-primary-700-300',
		closed: 'preset-tonal-error'
	})[status];

export const seniorityLabel = (level: SeniorityLevel | undefined): string =>
	level ? SENIORITY_LABELS[level] : '';

export const educationLabel = (level: EducationLevel | undefined): string =>
	level ? EDUCATION_LABELS[level] : '';

export const travelLabel = (travel: TravelFrequency | undefined): string =>
	travel ? TRAVEL_LABELS[travel] : '';

/** One-word contracts, for one-line summaries: 'CDI', 'CDD', 'Internship' */
export const CONTRACT_SHORT_LABELS: Record<ContractType, string> = {
	cdi: 'CDI',
	cdd: 'CDD',
	interim: 'Temporary',
	apprenticeship: 'Apprenticeship',
	professionalisation: 'Work-study',
	internship: 'Internship',
	freelance: 'Freelance'
};

/** What the French contract names mean, for candidates who do not know them */
const CONTRACT_GLOSSES: Partial<Record<ContractType, string>> = {
	cdi: 'permanent',
	cdd: 'fixed-term'
};

/** 'CDI (permanent)', 'CDD (fixed-term, 6 months)', 'Internship (6 months)' */
export const formatContractShort = (contract: JobPostingLike['contract']): string => {
	if (!contract?.type) return '';
	const label = CONTRACT_SHORT_LABELS[contract.type];
	const details = [
		CONTRACT_GLOSSES[contract.type],
		contract.durationMonths ? months(contract.durationMonths) : ''
	].filter(Boolean);
	return details.length ? `${label} (${details.join(', ')})` : label;
};

/** '1 position', '3 positions' */
export const formatOpenings = (count: number | undefined): string =>
	count === undefined ? '' : `${count} ${count === 1 ? 'position' : 'positions'}`;

/**
 * The parts of a posting's one-line summary (a list item): city (or the work mode alone when
 * fully remote without one), work mode, contract, pay. 'Lyon · Hybrid · CDI · €45,000 – …'
 */
export const jobSummaryParts = (job: JobPostingLike): string[] => {
	const location = job.location;
	const mode = location?.workMode ? WORK_MODE_LABELS[location.workMode] : '';
	return [location?.city ?? '', mode, formatContractShort(job.contract), formatPay(job.pay)].filter(
		Boolean
	);
};

export type JobFactId =
	| 'place'
	| 'contract'
	| 'workingTime'
	| 'pay'
	| 'openings'
	| 'team'
	| 'profile'
	| 'skills'
	| 'languages'
	| 'benefits'
	| 'travel';

/**
 * One entry of a posting's facts: `lines` (the first is the main value) and/or `items` (shown
 * as chips: skills, languages, benefits).
 */
export type JobFact = { id: JobFactId; label: string; lines: string[]; items?: string[] };

/**
 * What a posting says about the job, in reading order, every value through the formatters
 * above; entries without anything to show are left out.
 */
export const jobFacts = (job: JobPostingLike): JobFact[] => {
	const { location, contract, workingTime, pay, organization, requirements } = job;
	const facts: JobFact[] = [
		{
			id: 'place',
			label: 'Location',
			lines: [formatPlace(location), formatWorkMode(location)]
		},
		{
			id: 'contract',
			label: 'Contract',
			lines: contract?.type
				? [
						formatContract(contract),
						formatStart(contract),
						formatTrialPeriod(contract.trialPeriodMonths),
						contract.collectiveAgreement
							? `Collective agreement: ${contract.collectiveAgreement}`
							: ''
					]
				: []
		},
		{ id: 'workingTime', label: 'Working time', lines: [formatWorkingTime(workingTime)] },
		{
			id: 'pay',
			label: 'Pay',
			lines: [formatPay(pay), pay?.variable ? `Variable: ${pay.variable}` : '']
		},
		{ id: 'openings', label: 'Openings', lines: [formatOpenings(job.openings)] },
		{
			id: 'team',
			label: 'Team',
			lines: [
				formatDirectReports(organization?.directReports),
				formatPeers(organization?.peers),
				formatLevelsToCeo(organization?.levelsToCeo)
			]
		},
		{
			id: 'profile',
			label: 'Profile',
			lines: [seniorityLabel(requirements?.seniority), educationLabel(requirements?.education)]
		},
		{ id: 'skills', label: 'Skills', lines: [], items: requirements?.skills ?? [] },
		{ id: 'languages', label: 'Languages', lines: [], items: requirements?.languages ?? [] },
		{ id: 'benefits', label: 'Benefits', lines: [], items: job.benefits ?? [] },
		{ id: 'travel', label: 'Travel', lines: [travelLabel(job.travel)] }
	];
	return facts
		.map((fact) => ({ ...fact, lines: fact.lines.filter(Boolean) }))
		.filter((fact) => fact.lines.length > 0 || (fact.items?.length ?? 0) > 0);
};

// --- Editor helpers ---------------------------------------------------------------------

/** What each status means for the posting's visibility (the editor's hint) */
export const JOB_STATUS_DESCRIPTIONS: Record<JobStatus, string> = {
	draft: 'Only you can see it.',
	open: 'Public: candidates can apply.',
	on_hold: 'Public, but not taking applications for now.',
	filled: 'Public, marked as filled: no more applications.',
	closed: 'Public, marked as closed: no more applications.'
};

export type ListAddProblem = 'duplicate' | 'full' | 'too_long';

/**
 * Adds what was typed (or pasted: one item per line) to a short list (skills, languages,
 * benefits): spaces tidied, blanks skipped, each item once (ignoring case), at most `max` items
 * of at most `maxLength` characters. `problem` is the first reason something was not added.
 */
export const addListItems = (
	list: readonly string[],
	text: string,
	{ max, maxLength }: { max: number; maxLength: number }
): { list: string[]; added: string[]; problem?: ListAddProblem } => {
	const next = [...list];
	const added: string[] = [];
	let problem: ListAddProblem | undefined;
	const items = text
		.split(/\r?\n/)
		.map((item) => item.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
	for (const item of items) {
		if (item.length > maxLength) {
			problem ??= 'too_long';
			continue;
		}
		if (next.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
			problem ??= 'duplicate';
			continue;
		}
		if (next.length >= max) {
			problem ??= 'full';
			break;
		}
		next.push(item);
		added.push(item);
	}
	return { list: next, added, problem };
};
