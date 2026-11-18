import { describe, it, expect } from 'vitest';
import {
	JOB_FIELD_CRITERIA,
	JOB_FIELD_PATHS,
	LOCKED_JOB_FIELDS,
	changedLockedFields,
	jobTermsLocked,
	locksJobTerms,
	withLocale
} from 'portfolio-common';
import {
	JOB_FIELD_LABELS,
	JOB_FORM_FIELDS,
	LOCKED_FORM_FIELDS,
	duplicateJobForm,
	emptyJobForm,
	formToJobInput,
	formatContract,
	formatLevelsToCeo,
	formatPay,
	formatPlace,
	formatStart,
	formatWorkMode,
	formatWorkingTime,
	jobFieldOfProperty,
	jobFormErrors,
	jobFormFieldOf,
	jobFormSignature,
	jobToForm,
	openedJobForm,
	parseFormNumber,
	startDateKey,
	withLockedTerms,
	type JobForm,
	type JobPostingLike
} from '../jobPosting';

/** A complete posting: a hybrid CDI in Lyon, 39 h a week, €45,000 to €55,000 a year */
const validForm = (overrides: Partial<JobForm> = {}): JobForm => ({
	...emptyJobForm(),
	title: 'Backend engineer',
	description: '## Mission\n\nBuild the billing service.',
	company: 'Acme',
	city: 'Lyon',
	postalCode: '69003',
	workMode: 'hybrid',
	remoteDaysPerWeek: '2',
	hoursPerWeek: '39',
	payMin: '45 000',
	payMax: '55000',
	...overrides
});

describe('parseFormNumber', () => {
	it.each([
		['', undefined],
		['   ', undefined],
		['45000', 45000],
		['45 000', 45000],
		['45\u00a0000', 45000],
		['45\u202f000', 45000],
		['11,88', 11.88],
		['11.88', 11.88],
		['-3', -3]
	])('reads %j as %j', (text, value) => {
		expect(parseFormNumber(text)).toBe(value);
	});

	it.each(['45k', 'abc', '1.2.3', '4e5', '0x10'])('rejects %j', (text) => {
		expect(parseFormNumber(text)).toBeNaN();
	});
});

describe('startDateKey', () => {
	it('keeps a YYYY-MM-DD string', () => {
		expect(startDateKey('2026-12-01')).toBe('2026-12-01');
	});

	it('reads a Date (Eden parses YYYY-MM-DD strings into dates) as its UTC day', () => {
		expect(startDateKey(new Date('2026-12-01'))).toBe('2026-12-01');
	});

	it.each([undefined, null, '', 'soon', new Date('invalid')])('is empty for %j', (value) => {
		expect(startDateKey(value)).toBe('');
	});
});

describe('formToJobInput', () => {
	it('builds the request body of a complete form', () => {
		expect(
			formToJobInput(validForm({ startDate: '2026-12-01', skills: [' Go ', 'go', ''] }))
		).toEqual({
			title: 'Backend engineer',
			description: '## Mission\n\nBuild the billing service.',
			company: 'Acme',
			status: 'draft',
			openings: 1,
			location: {
				country: 'FR',
				city: 'Lyon',
				postalCode: '69003',
				workMode: 'hybrid',
				remoteDaysPerWeek: 2
			},
			contract: { type: 'cdi', startDate: '2026-12-01' },
			workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 39 },
			pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' },
			requirements: { skills: ['Go'] }
		});
	});

	it('drops the fields that do not apply', () => {
		const input = formToJobInput(
			validForm({
				workMode: 'on_site',
				remoteDaysPerWeek: '2',
				contractType: 'cdi',
				durationMonths: '6',
				arrangement: 'annual_days',
				hoursPerWeek: '39',
				daysPerYear: '218'
			})
		);
		expect(input.location.remoteDaysPerWeek).toBeUndefined();
		expect(input.contract.durationMonths).toBeUndefined();
		expect(input.workingTime).toEqual({ arrangement: 'annual_days', daysPerYear: 218 });
	});
});

describe('jobFormErrors', () => {
	it('has none for a complete form', () => {
		expect(jobFormErrors(validForm())).toEqual({});
	});

	it('requires the title, description, city (unless remote) and pay range', () => {
		const errors = jobFormErrors(
			validForm({ title: ' ', description: '', city: '', payMin: '', payMax: '' })
		);
		expect(errors).toMatchObject({
			title: 'Title is required',
			description: 'Description is required',
			city: 'City is required unless the job is fully remote',
			payMin: 'Minimum pay is required',
			payMax: 'Maximum pay is required'
		});
		expect(jobFormErrors(validForm({ workMode: 'remote', city: '' })).city).toBeUndefined();
	});

	it('requires the duration of a fixed-term contract and the hours or days', () => {
		expect(jobFormErrors(validForm({ contractType: 'cdd' })).durationMonths).toBe(
			'Duration is required for this contract'
		);
		expect(jobFormErrors(validForm({ hoursPerWeek: '' })).hoursPerWeek).toBe(
			'Hours per week are required'
		);
		expect(jobFormErrors(validForm({ arrangement: 'annual_days' })).daysPerYear).toBe(
			'Days per year are required'
		);
	});

	it('reports numbers that are not numbers, out of range or inverted', () => {
		const errors = jobFormErrors(
			validForm({ peers: 'many', hoursPerWeek: '60', payMin: '60000', payMax: '50000' })
		);
		expect(errors.peers).toBe('Peers must be a number');
		expect(errors.hoursPerWeek).toMatch(/^Hours per week must be from 1 to 48/);
		expect(errors.payMax).toBe('Maximum pay must not be below the minimum');
	});

	it('reports a pay range whose top is over 1.5 times its bottom, with the most it can be', () => {
		expect(jobFormErrors(validForm({ payMin: '45 000', payMax: '67 500' })).payMax).toBeUndefined();
		expect(jobFormErrors(validForm({ payMin: '45 000', payMax: '67 501' })).payMax).toBe(
			'Maximum pay must be at most €67,500 (1.5 times the minimum)'
		);
		// In cents, rounded down: 1.5 × €33.33 is €49.995
		expect(
			jobFormErrors(validForm({ payMin: '33,33', payMax: '50', payPeriod: 'hour' })).payMax
		).toBe('Maximum pay must be at most €49.99 (1.5 times the minimum)');
		expect(
			withLocale('fr', () => jobFormErrors(validForm({ payMin: '45000', payMax: '90000' })).payMax)
		).toBe(
			'Rémunération maximale\u00a0: indiquez 67\u202f500\u00a0€ au maximum (1,5 fois la minimale)'
		);
	});
});

describe('jobFieldOfProperty', () => {
	it.each([
		['pay.max', 'payMax'],
		['/pay/max', 'payMax'],
		['location.city', 'city'],
		['requirements.skills.3', 'skills'],
		['benefits.0', 'benefits'],
		['title', 'title']
	])('maps %j to %j', (property, field) => {
		expect(jobFieldOfProperty(property)).toBe(field);
	});

	it.each([undefined, '', 'root', 'unknown.field'])('is undefined for %j', (property) => {
		expect(jobFieldOfProperty(property)).toBeUndefined();
	});
});

describe('jobToForm', () => {
	it('round-trips a posting', () => {
		const form = validForm({
			startDate: '2026-12-01',
			levelsToCeo: '2',
			benefits: ['Meal vouchers'],
			seniority: 'senior',
			travel: 'occasional'
		});
		const input = formToJobInput(form);
		expect(formToJobInput(jobToForm(input))).toEqual(input);
	});

	it('round-trips a saved posting without openings, which the editor does not fill in', () => {
		const input = formToJobInput(validForm({ openings: '' }));
		expect(input).not.toHaveProperty('openings');
		const form = jobToForm({ ...input, _id: '65aaaaaaaaaaaaaaaaaaaaaa' } as JobPostingLike);
		expect(form.openings).toBe('');
		expect(formToJobInput(form)).toEqual(input);
		// A new or imported posting starts from 1
		expect(jobToForm(input).openings).toBe('1');
	});

	it('reads a start date that arrived as a Date', () => {
		const form = jobToForm({ contract: { type: 'cdd', startDate: new Date('2027-01-04') } });
		expect(form.startDate).toBe('2027-01-04');
		expect(form.contractType).toBe('cdd');
	});

	it('fills the defaults of what an imported draft lacks', () => {
		const form = jobToForm({ title: 'Data analyst', workingTime: {} });
		expect(form).toMatchObject({
			title: 'Data analyst',
			status: 'draft',
			contractType: 'cdi',
			workMode: 'on_site',
			arrangement: 'weekly_hours',
			hoursPerWeek: '',
			payPeriod: 'year'
		});
	});
});

describe('jobFormSignature', () => {
	it('ignores how numbers and blanks are typed', () => {
		expect(jobFormSignature(validForm({ payMin: '45000', city: 'Lyon ' }))).toBe(
			jobFormSignature(validForm({ payMin: '45 000', city: 'Lyon' }))
		);
	});
});

describe('display', () => {
	it('formats the pay range', () => {
		expect(formatPay({ min: 45000, max: 55000, currency: 'EUR', period: 'year' })).toBe(
			'€45,000 – €55,000 gross per year'
		);
		expect(formatPay({ min: 500, max: 500, currency: 'EUR', period: 'day' })).toBe(
			'€500 gross per day'
		);
		expect(formatPay({ min: 11.88, max: 13.5, currency: 'EUR', period: 'hour' })).toBe(
			'€11.88 – €13.50 gross per hour'
		);
		expect(formatPay(undefined)).toBe('');
	});

	it('formats the working time', () => {
		expect(
			formatWorkingTime({ arrangement: 'weekly_hours', hoursPerWeek: 39, rttDaysPerYear: 10 })
		).toBe('39 h/week · 10 RTT days (extra days off a year)');
		expect(formatWorkingTime({ arrangement: 'weekly_hours', hoursPerWeek: 28 })).toBe(
			'28 h/week (part-time)'
		);
		expect(formatWorkingTime({ arrangement: 'annual_days', daysPerYear: 218 })).toBe(
			'218 days a year (forfait jours: counted in days worked, no weekly hours)'
		);
		expect(
			formatWorkingTime({ arrangement: 'weekly_hours', hoursPerWeek: 35, rttDaysPerYear: 1 })
		).toBe('35 h/week · 1 RTT day (an extra day off a year)');
	});

	it('formats the place and work mode', () => {
		expect(formatPlace({ country: 'FR', city: 'Lyon', postalCode: '69003' })).toBe(
			'Lyon (69003), France'
		);
		expect(formatPlace({ country: 'FR', workMode: 'remote' })).toBe('France');
		expect(formatWorkMode({ workMode: 'hybrid', remoteDaysPerWeek: 2 })).toBe(
			'Hybrid (2 days remote a week)'
		);
		expect(formatWorkMode({ workMode: 'remote' })).toBe('Full remote');
	});

	it('formats the contract and its start', () => {
		expect(formatContract({ type: 'cdd', durationMonths: 6 })).toBe('CDD (fixed-term) · 6 months');
		expect(formatContract({ type: 'cdi' })).toBe('CDI (permanent)');
		expect(formatStart({ type: 'cdi', startDate: '2026-12-01' })).toBe('Starts 1 Dec 2026');
		expect(formatStart({ type: 'cdi' })).toBe('Starts as soon as possible');
	});

	it('formats the distance to the CEO', () => {
		expect(formatLevelsToCeo(0)).toBe('Is the CEO');
		expect(formatLevelsToCeo(1)).toBe('Reports to the CEO');
		expect(formatLevelsToCeo(3)).toBe('3 levels below the CEO');
		expect(formatLevelsToCeo(undefined)).toBe('');
	});
});

// A candidate's perfect job is read from the fields of a posting (portfolio-common's
// JOB_FIELD_CRITERIA; the API's tests check the scoring and the storage): the editor must have an
// input for each of them, or a recruiter could not state what a candidate asks for
describe('the fields a perfect job is scored on', () => {
	const scored = JOB_FIELD_PATHS.filter((path) => JOB_FIELD_CRITERIA[path].length > 0);

	it('each have an input in the editor, shown and named', () => {
		expect(scored.length).toBeGreaterThan(10);
		for (const path of scored) {
			const field = jobFormFieldOf(path);
			expect({ path, field: field !== undefined }).toEqual({ path, field: true });
			expect(JOB_FORM_FIELDS, path).toContain(field);
			expect(JOB_FIELD_LABELS[field!], path).toBeTruthy();
		}
	});

	it('leaves no field of a posting without an input, but the country and the currency', () => {
		expect(JOB_FIELD_PATHS.filter((path) => jobFormFieldOf(path) === undefined)).toEqual([
			'location.country',
			'pay.currency'
		]);
		expect(jobFormFieldOf('toString')).toBeUndefined();
	});

	it('go from the form to the posting sent, and back', () => {
		const form: JobForm = {
			...emptyJobForm(),
			title: 'Staff Engineer',
			description: 'Build things.',
			city: 'Lyon',
			postalCode: '69003',
			address: ' 12 rue de la République ',
			workMode: 'hybrid',
			remoteDaysPerWeek: '2'
		};
		const sent = formToJobInput(form);
		expect(sent.location).toEqual({
			country: 'FR',
			city: 'Lyon',
			postalCode: '69003',
			address: '12 rue de la République',
			workMode: 'hybrid',
			remoteDaysPerWeek: 2
		});
		expect(jobToForm(sent).address).toBe('12 rue de la République');
		expect(formatPlace(sent.location)).toBe('12 rue de la République, Lyon (69003), France');
		expect(jobFieldOfProperty('location.address')).toBe('address');
	});
});

// Once opened, a posting's terms (the fields the perfect job scores) are locked: the API refuses to
// change them (409, its tests check it), the editor shows their inputs read-only
describe('the terms of an opened posting', () => {
	const opened = {
		_id: 'j1',
		...formToJobInput(validForm({ skills: ['Go'], travel: 'occasional' })),
		status: 'open' as const,
		publishedAt: '2026-11-03T10:00:00.000Z'
	};

	it('are every field a criterion reads, and only those', () => {
		const scored = JOB_FIELD_PATHS.filter((path) => JOB_FIELD_CRITERIA[path].length > 0);
		expect([...LOCKED_JOB_FIELDS]).toEqual(scored);
		expect(LOCKED_FORM_FIELDS).toEqual(scored.map((path) => jobFormFieldOf(path)));
		for (const field of ['description', 'company', 'status', 'benefits', 'payVariable'] as const) {
			expect(LOCKED_FORM_FIELDS).not.toContain(field);
		}
	});

	it('lock once the posting was opened, whatever its status since', () => {
		expect(jobTermsLocked(opened)).toBe(true);
		const backToDraft = { ...opened, status: 'draft' as const };
		expect(jobTermsLocked(backToDraft)).toBe(true);
		expect(jobTermsLocked({ publishedAt: undefined })).toBe(false);
		expect(jobTermsLocked(null)).toBe(false);
		// What the editor and the status control confirm: a posting never opened leaving the drafts
		expect(locksJobTerms('open', null)).toBe(true);
		expect(locksJobTerms('closed', { publishedAt: null })).toBe(true);
		expect(locksJobTerms('draft', null)).toBe(false);
		expect(locksJobTerms('open', opened)).toBe(false);
	});

	it('are compared normalised, each field on its own', () => {
		const stored = formToJobInput(jobToForm(opened));
		const edit = (overrides: Partial<JobForm>) =>
			formToJobInput({ ...jobToForm(opened), ...overrides });
		// The whole posting sent back, typed differently: nothing changed
		expect(changedLockedFields(stored, edit({ title: '  Backend   engineer ' }))).toEqual([]);
		// What no criterion reads changes freely
		expect(
			changedLockedFields(
				stored,
				edit({ description: 'Other.', company: 'Other', benefits: ['Gym'], status: 'closed' })
			)
		).toEqual([]);
		expect(
			changedLockedFields(stored, edit({ title: 'Staff engineer', payMin: '46000', skills: [] }))
		).toEqual(['title', 'pay.min', 'requirements.skills']);
		// The remote days go with a job that is no longer hybrid
		expect(changedLockedFields(stored, edit({ workMode: 'on_site' }))).toEqual([
			'location.workMode',
			'location.remoteDaysPerWeek'
		]);
		expect(changedLockedFields(stored, edit({ travel: '' }))).toEqual(['travel']);
	});

	it('take the top of a range saved wider than the cap down to the top it was scored with only', () => {
		const wide = {
			...opened,
			pay: { min: 40000, max: 80000, currency: 'EUR' as const, period: 'year' as const }
		};
		const { form, capped } = openedJobForm(wide);
		expect([capped, form.payMax]).toEqual([true, '60000']);
		const stored = formToJobInput(jobToForm(wide));
		expect(changedLockedFields(stored, formToJobInput(form))).toEqual([]);
		expect(changedLockedFields(stored, formToJobInput({ ...form, payMax: '59000' }))).toEqual([
			'pay.max'
		]);
		// Within the cap: as it is
		expect(openedJobForm(opened)).toEqual({ form: jobToForm(opened), capped: false });
	});

	it('are what a draft of the opened posting keeps of the posting', () => {
		const posting = jobToForm(opened);
		const draft = {
			...posting,
			title: 'Changed',
			payMin: '1',
			skills: ['Rust'],
			description: 'New.'
		};
		expect(withLockedTerms(draft, posting)).toEqual({ ...posting, description: 'New.' });
	});
});

describe('duplicateJobForm', () => {
	it('copies every field of the posting, as a new draft', () => {
		const job = {
			_id: 'j1',
			...formToJobInput(validForm({ status: 'open', skills: ['Go'], benefits: ['Gym'] })),
			publishedAt: '2026-11-03T10:00:00.000Z'
		};
		const copy = duplicateJobForm(job);
		expect(copy).toEqual({ ...jobToForm(job), status: 'draft' });
		expect(copy).toMatchObject({ title: 'Backend engineer', payMin: '45000', skills: ['Go'] });
		// Its lists are its own
		copy.skills.push('Rust');
		expect(job.requirements?.skills).toEqual(['Go']);
		// A posting without openings: the copy has none either
		expect(duplicateJobForm({ ...job, openings: undefined }).openings).toBe('');
	});

	it('starts a copy of an opened posting saved wider than the cap from the top it is scored with', () => {
		// Saved at €80,000 for a €40,000 bottom, before the cap: its editor shows €60,000
		const wide = {
			_id: 'j2',
			...formToJobInput(validForm({ status: 'open', payMin: '40000', payMax: '60000' })),
			publishedAt: '2026-11-03T10:00:00.000Z'
		};
		wide.pay = { ...wide.pay, max: 80000 };
		const copy = duplicateJobForm(wide);
		expect(copy).toEqual({ ...openedJobForm(wide).form, status: 'draft' });
		expect([copy.payMin, copy.payMax]).toEqual(['40000', '60000']);
		// ...which it can be saved with
		expect(jobFormErrors(copy)).toEqual({});
		// A draft never opened is copied as it is: its own editor shows the same range
		expect(duplicateJobForm({ ...wide, publishedAt: undefined }).payMax).toBe('80000');
	});
});
