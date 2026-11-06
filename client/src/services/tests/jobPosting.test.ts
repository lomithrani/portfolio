import { describe, it, expect } from 'vitest';
import {
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
	jobFormSignature,
	jobToForm,
	parseFormNumber,
	startDateKey,
	type JobForm
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
		).toBe('39 h/week · 10 RTT days');
		expect(formatWorkingTime({ arrangement: 'weekly_hours', hoursPerWeek: 28 })).toBe(
			'28 h/week (part-time)'
		);
		expect(formatWorkingTime({ arrangement: 'annual_days', daysPerYear: 218 })).toBe(
			'218 days/year (forfait jours)'
		);
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
