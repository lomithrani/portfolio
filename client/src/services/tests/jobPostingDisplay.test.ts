import { describe, it, expect } from 'vitest';
import {
	JOB_FIELD_LABELS,
	JOB_FORM_FIELDS,
	addListItems,
	emptyJobForm,
	formatContractShort,
	formatOpenings,
	jobFacts,
	jobFieldApplies,
	jobFormErrors,
	jobSummaryParts,
	orderedJobFormErrors,
	type JobForm
} from '../jobPosting';

const validForm = (overrides: Partial<JobForm> = {}): JobForm => ({
	...emptyJobForm(),
	title: 'Backend engineer',
	description: 'Build the billing service.',
	city: 'Lyon',
	payMin: '45000',
	payMax: '55000',
	...overrides
});

describe('JOB_FORM_FIELDS', () => {
	it('lists every field of the form once, each with a label', () => {
		const fields = Object.keys(emptyJobForm()).sort();
		expect([...JOB_FORM_FIELDS].sort()).toEqual(fields);
		expect(Object.keys(JOB_FIELD_LABELS).sort()).toEqual(fields);
	});
});

describe('jobFieldApplies', () => {
	it('follows the work mode, the contract and the working time arrangement', () => {
		const form = validForm();
		expect(jobFieldApplies(form, 'remoteDaysPerWeek')).toBe(false);
		expect(jobFieldApplies({ ...form, workMode: 'hybrid' }, 'remoteDaysPerWeek')).toBe(true);
		expect(jobFieldApplies(form, 'durationMonths')).toBe(false);
		expect(jobFieldApplies({ ...form, contractType: 'freelance' }, 'durationMonths')).toBe(true);
		expect(jobFieldApplies(form, 'hoursPerWeek')).toBe(true);
		expect(jobFieldApplies(form, 'daysPerYear')).toBe(false);
		expect(jobFieldApplies({ ...form, arrangement: 'annual_days' }, 'daysPerYear')).toBe(true);
		expect(jobFieldApplies(form, 'title')).toBe(true);
	});
});

describe('jobFormErrors of hidden fields', () => {
	it('ignores what was typed in a field that no longer applies', () => {
		const errors = jobFormErrors(
			validForm({
				remoteDaysPerWeek: 'two',
				durationMonths: 'six',
				daysPerYear: 'many',
				contractType: 'cdi',
				workMode: 'on_site'
			})
		);
		expect(errors).toEqual({});
	});

	it('still reports it once the field applies again', () => {
		const errors = jobFormErrors(validForm({ workMode: 'hybrid', remoteDaysPerWeek: 'two' }));
		expect(errors.remoteDaysPerWeek).toBe('Remote days per week must be a number');
	});
});

describe('orderedJobFormErrors', () => {
	it('lists the errors in the order of the form, with their labels', () => {
		const errors = orderedJobFormErrors(
			jobFormErrors(validForm({ title: '', payMin: '', peers: 'many', city: '' }))
		);
		expect(errors.map((error) => error.field)).toEqual(['title', 'city', 'payMin', 'peers']);
		expect(errors[0]).toEqual({
			field: 'title',
			label: 'Job title',
			message: 'Title is required'
		});
	});

	it('is empty without errors', () => {
		expect(orderedJobFormErrors({})).toEqual([]);
	});
});

describe('formatContractShort', () => {
	it.each([
		[{ type: 'cdi' as const }, 'CDI (permanent)'],
		[{ type: 'cdd' as const, durationMonths: 6 }, 'CDD (fixed-term, 6 months)'],
		[{ type: 'freelance' as const }, 'Freelance'],
		[{ type: 'internship' as const, durationMonths: 1 }, 'Internship (1 month)'],
		[undefined, ''],
		[{}, '']
	])('formats %j as %j', (contract, text) => {
		expect(formatContractShort(contract)).toBe(text);
	});
});

describe('formatOpenings', () => {
	it.each([
		[undefined, ''],
		[1, '1 position'],
		[3, '3 positions']
	])('formats %j as %j', (count, text) => {
		expect(formatOpenings(count)).toBe(text);
	});
});

describe('jobSummaryParts', () => {
	it('gives the city, work mode, contract and pay', () => {
		expect(
			jobSummaryParts({
				location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
				contract: { type: 'cdd', durationMonths: 6 },
				pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' }
			})
		).toEqual(['Lyon', 'Hybrid', 'CDD (fixed-term, 6 months)', '€45,000 – €55,000 gross per year']);
	});

	it('leaves out what a posting does not say', () => {
		expect(jobSummaryParts({ location: { country: 'FR', workMode: 'remote' } })).toEqual([
			'Full remote'
		]);
		expect(jobSummaryParts({})).toEqual([]);
	});
});

describe('jobFacts', () => {
	it('lists what a complete posting says, in reading order', () => {
		const facts = jobFacts({
			openings: 2,
			location: { country: 'FR', city: 'Lyon', postalCode: '69003', workMode: 'on_site' },
			contract: {
				type: 'cdi',
				startDate: '2027-01-04',
				trialPeriodMonths: 3,
				collectiveAgreement: 'Syntec'
			},
			workingTime: { arrangement: 'annual_days', daysPerYear: 218, rttDaysPerYear: 10 },
			pay: { min: 50000, max: 50000, currency: 'EUR', period: 'year', variable: '10% bonus' },
			organization: { directReports: 4, peers: 0, levelsToCeo: 1 },
			requirements: { seniority: 'senior', skills: ['Go', 'Kafka'], languages: ['English (C1)'] },
			benefits: ['Meal vouchers'],
			travel: 'occasional'
		});
		expect(facts.map((fact) => fact.id)).toEqual([
			'place',
			'contract',
			'workingTime',
			'pay',
			'openings',
			'team',
			'profile',
			'skills',
			'languages',
			'benefits',
			'travel'
		]);
		const byId = Object.fromEntries(facts.map((fact) => [fact.id, fact]));
		expect(byId.place.lines).toEqual(['Lyon (69003), France', 'On site']);
		expect(byId.contract.lines).toEqual([
			'CDI (permanent)',
			'Starts 4 Jan 2027',
			'3 months trial period',
			'Collective agreement: Syntec'
		]);
		expect(byId.workingTime.lines).toEqual([
			'218 days a year (forfait jours: counted in days worked, no weekly hours) · 10 RTT days (extra days off a year)'
		]);
		expect(byId.pay.lines).toEqual(['€50,000 gross per year', 'Variable: 10% bonus']);
		expect(byId.openings.lines).toEqual(['2 positions']);
		expect(byId.team.lines).toEqual([
			'4 direct reports',
			'No peers under the same manager',
			'Reports to the CEO'
		]);
		expect(byId.profile.lines).toEqual(['Senior (5-10 years)']);
		expect(byId.skills.items).toEqual(['Go', 'Kafka']);
		expect(byId.travel.lines).toEqual(['Occasional travel']);
	});

	it('leaves out the entries a posting has nothing for', () => {
		const facts = jobFacts({
			location: { country: 'FR', workMode: 'remote' },
			contract: { type: 'cdi' }
		});
		expect(facts.map((fact) => fact.id)).toEqual(['place', 'contract']);
		expect(facts[1].lines).toEqual(['CDI (permanent)', 'Starts as soon as possible']);
	});
});

describe('addListItems', () => {
	const limits = { max: 3, maxLength: 10 };

	it('adds a tidied item', () => {
		expect(addListItems(['Go'], '  Type   Sc ', limits)).toEqual({
			list: ['Go', 'Type Sc'],
			added: ['Type Sc'],
			problem: undefined
		});
	});

	it('adds one item per pasted line, skipping blanks', () => {
		expect(addListItems([], 'Go\n\nRust\r\nSQL', limits).added).toEqual(['Go', 'Rust', 'SQL']);
	});

	it('skips duplicates (ignoring case), too long items and what does not fit', () => {
		expect(addListItems(['Go'], 'go', limits)).toEqual({
			list: ['Go'],
			added: [],
			problem: 'duplicate'
		});
		expect(addListItems([], 'Kubernetes cluster', limits).problem).toBe('too_long');
		const full = addListItems(['A', 'B'], 'C\nD\nE', limits);
		expect(full.list).toEqual(['A', 'B', 'C']);
		expect(full.problem).toBe('full');
	});

	it('does nothing for blank text', () => {
		expect(addListItems(['Go'], '   ', limits)).toEqual({ list: ['Go'], added: [] });
	});
});
