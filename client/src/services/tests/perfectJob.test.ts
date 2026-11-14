import { describe, it, expect } from 'vitest';
import { parsePerfectJob, type PerfectJob } from 'portfolio-common';
import {
	checkPerfectJob,
	criterionShares,
	perfectJobCriteria,
	perfectJobForm,
	perfectJobSummary,
	problemAt,
	problemCriterion,
	sameCriteria,
	savedForm,
	savedPerfectJobProblem,
	typedNumber
} from '../perfectJob';

const CRITERIA: PerfectJob = {
	workMode: { importance: 5, dealBreaker: true, modes: ['hybrid', 'remote'], minRemoteDays: 3 },
	workingTime: { importance: 2, arrangements: ['weekly_hours'], maxHoursPerWeek: 35 },
	pay: { importance: 4, perYear: 70000 },
	skills: { importance: 3, names: ['TypeScript', 'Go'] }
};

describe('the form of the perfect job', () => {
	it('starts with every criterion off, at the default importance', () => {
		const form = perfectJobForm();
		expect(form.pay).toEqual({
			enabled: false,
			importance: 3,
			dealBreaker: false,
			perYear: '',
			perDay: ''
		});
		expect(Object.values(form).some((criterion) => criterion.enabled)).toBe(false);
		expect(perfectJobCriteria(form)).toEqual({});
		expect(checkPerfectJob(form)).toEqual({ criteria: {}, problems: [] });
	});

	it('shows the stored criteria and sends them back as they were', () => {
		const form = perfectJobForm(CRITERIA);
		expect(form.workMode).toEqual({
			enabled: true,
			importance: 5,
			dealBreaker: true,
			modes: ['hybrid', 'remote'],
			minRemoteDays: '3'
		});
		expect(form.pay.perYear).toBe('70000');
		expect(form.travel.enabled).toBe(false);
		expect(checkPerfectJob(form)).toEqual({ criteria: CRITERIA, problems: [] });
		// Its own lists: editing the form does not change what it was made from
		form.skills.names.push('Rust');
		expect(CRITERIA.skills?.names).toEqual(['TypeScript', 'Go']);
	});

	it('reads numbers as they are typed', () => {
		expect(typedNumber('70000')).toBe(70000);
		expect(typedNumber(' 70 000 ')).toBe(70000);
		expect(typedNumber('70 000')).toBe(70000);
		expect(typedNumber('')).toBeUndefined();
		expect(typedNumber('   ')).toBeUndefined();
		for (const text of ['70k', '70.5', '-3', '1e3']) expect(typedNumber(text)).toBeNaN();
	});

	it('sends only the criteria that are on, and says what is wrong with them', () => {
		const form = perfectJobForm();
		form.pay.enabled = true;
		form.rttDays.enabled = true;
		form.titles.enabled = true;
		form.travel.max = 'none';
		expect(Object.keys(perfectJobCriteria(form))).toEqual(['titles', 'rttDays', 'pay']);
		const { problems } = checkPerfectJob(form);
		expect(problems.map((problem) => problem.field)).toEqual([
			'titles.keywords',
			'rttDays.min',
			'pay.perYear'
		]);
		expect(problemAt(problems, 'pay.perYear')).toBe(
			'Give the pay you ask for: per year, per day, or both.'
		);
		expect(problemAt(problems, 'pay.perDay')).toBeUndefined();
		expect(problems.map(problemCriterion)).toEqual(['titles', 'rttDays', 'pay']);
		expect(problemCriterion({ field: 'criteria', message: 'Not an object' })).toBeUndefined();

		form.pay.perYear = 'a lot';
		form.pay.perDay = '600';
		expect(checkPerfectJob(form).problems.map((problem) => problem.field)).toContain('pay.perYear');
		form.pay.perYear = '70 000';
		form.rttDays.min = '10';
		form.titles.keywords = ['Staff Engineer'];
		expect(checkPerfectJob(form)).toEqual({
			criteria: {
				titles: { importance: 3, keywords: ['Staff Engineer'] },
				rttDays: { importance: 3, min: 10 },
				pay: { importance: 3, perYear: 70000, perDay: 600 }
			},
			problems: []
		});
	});

	it('has nothing to save while only criteria that are off change', () => {
		const saved = perfectJobForm(CRITERIA);
		const form = perfectJobForm(CRITERIA);
		expect(sameCriteria(form, saved)).toBe(true);
		form.travel.max = 'occasional';
		form.titles.keywords = ['CTO'];
		expect(sameCriteria(form, saved)).toBe(true);
		form.travel.enabled = true;
		expect(sameCriteria(form, saved)).toBe(false);
		form.travel.enabled = false;
		form.pay.importance = 5;
		expect(sameCriteria(form, saved)).toBe(false);
	});

	it('keeps what was typed for the criteria that are off after a save', () => {
		const form = perfectJobForm(CRITERIA);
		form.travel.max = 'occasional';
		form.skills.names = [' Go ', 'go', 'Rust'];
		// A hybrid job is not accepted anymore: its remote days go
		form.workMode.modes = ['remote'];
		const { criteria } = parsePerfectJob(perfectJobCriteria(form));
		const next = savedForm(form, criteria);
		expect(next.skills.names).toEqual(['Go', 'Rust']);
		expect(next.workMode.minRemoteDays).toBe('');
		expect(next.travel).toEqual({
			enabled: false,
			importance: 3,
			dealBreaker: false,
			max: 'occasional'
		});
		expect(sameCriteria(next, perfectJobForm(criteria))).toBe(true);
	});

	it('finds what the API refused', () => {
		expect(
			savedPerfectJobProblem({
				type: 'validation',
				on: 'body',
				property: 'criteria.pay.perYear',
				message: ' Too much. '
			})
		).toEqual({ field: 'pay.perYear', message: 'Too much.' });
		expect(savedPerfectJobProblem({ property: 'criteria', message: 'Not an object' })).toEqual({
			field: 'criteria',
			message: 'Not an object'
		});
		for (const value of [
			undefined,
			'Unauthorized',
			{ property: 'steps.0', message: 'x' },
			{ property: 'criteria.pay', message: '  ' },
			{ property: 'criteria.pay' }
		]) {
			expect(savedPerfectJobProblem(value)).toBeNull();
		}
	});
});

describe('what the criteria weigh', () => {
	it('gives each criterion that is on its share of the score', () => {
		expect(criterionShares(perfectJobForm())).toEqual({});
		// 5 + 2 + 4 + 3 = 14
		expect(criterionShares(perfectJobForm(CRITERIA))).toEqual({
			workMode: 36,
			workingTime: 14,
			pay: 29,
			skills: 21
		});
		expect(criterionShares(perfectJobForm({ pay: { importance: 1, perYear: 1 } }))).toEqual({
			pay: 100
		});
	});

	it('sums up what a job is scored on, the most important first', () => {
		expect(perfectJobSummary(perfectJobForm())).toBe(
			'No criterion yet: nothing is asked of a job, so every job scores 100.'
		);
		expect(perfectJobSummary(perfectJobForm({ pay: { importance: 1, perYear: 1 } }))).toBe(
			'A job is scored on one criterion: pay.'
		);
		expect(perfectJobSummary(perfectJobForm(CRITERIA))).toBe(
			'A job is scored on 4 criteria: work mode, pay, skills and working time. One of them is a deal-breaker.'
		);
		const two = perfectJobForm({
			...CRITERIA,
			pay: { importance: 4, dealBreaker: true, perYear: 70000 }
		});
		expect(perfectJobSummary(two)).toMatch(/2 of them are deal-breakers\.$/);
	});
});
