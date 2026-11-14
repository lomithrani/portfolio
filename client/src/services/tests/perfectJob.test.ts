import { describe, it, expect } from 'vitest';
import { parsePerfectJob, type PerfectJob } from 'portfolio-common';
import {
	checkPerfectJob,
	commuteBudgetHint,
	commutePlace,
	criterionShares,
	formatDuration,
	perfectJobCriteria,
	perfectJobForm,
	perfectJobSummary,
	problemAt,
	problemCriterion,
	sameCriteria,
	savedForm,
	savedPerfectJobProblem,
	typedDuration,
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

describe('the commute', () => {
	const HOME = { label: '1 Rue du Test 69001 Lyon', lat: 45.767, lon: 4.834 };
	const stored: PerfectJob = {
		commute: {
			importance: 4,
			from: '1 rue du Test, Lyon',
			place: HOME,
			modes: ['transit', 'bike'],
			maxMinutesPerWeek: 330
		}
	};

	it('shows the time accepted a week as hours and minutes, and sends it in minutes, without the place', () => {
		const form = perfectJobForm(stored);
		expect(form.commute).toEqual({
			enabled: true,
			importance: 4,
			dealBreaker: false,
			from: '1 rue du Test, Lyon',
			modes: ['transit', 'bike'],
			hours: '5',
			minutes: '30'
		});
		expect(perfectJobCriteria(form)).toEqual({
			commute: {
				importance: 4,
				from: '1 rue du Test, Lyon',
				modes: ['transit', 'bike'],
				maxMinutesPerWeek: 330
			}
		});
		expect(
			perfectJobForm({ commute: { ...stored.commute!, maxMinutesPerWeek: 300 } }).commute
		).toMatchObject({
			hours: '5',
			minutes: ''
		});
		expect(
			perfectJobForm({ commute: { ...stored.commute!, maxMinutesPerWeek: 45 } }).commute
		).toMatchObject({
			hours: '',
			minutes: '45'
		});
	});

	it('reads hours and minutes as they are typed', () => {
		expect(typedDuration('5', '')).toBe(300);
		expect(typedDuration('', '45')).toBe(45);
		expect(typedDuration('1', '30')).toBe(90);
		expect(typedDuration(' 2 ', '90')).toBe(210);
		expect(typedDuration('', '')).toBeNaN();
		expect(typedDuration('five', '')).toBeNaN();
		expect(typedDuration('5', '1.5')).toBeNaN();
	});

	it('says what is missing of a commute switched on', () => {
		const form = perfectJobForm();
		form.commute.enabled = true;
		expect(checkPerfectJob(form).problems.map((problem) => problem.field)).toEqual([
			'commute.from',
			'commute.modes',
			'commute.maxMinutesPerWeek'
		]);
		form.commute.from = 'Lyon';
		form.commute.modes = ['car'];
		form.commute.hours = '4';
		expect(checkPerfectJob(form)).toEqual({
			criteria: {
				commute: { importance: 3, from: 'Lyon', modes: ['car'], maxMinutesPerWeek: 240 }
			},
			problems: []
		});
		form.commute.hours = '60';
		expect(checkPerfectJob(form).problems.map((problem) => problem.field)).toEqual([
			'commute.maxMinutesPerWeek'
		]);
	});

	it('says what a time a week means for a way, every day or once a week', () => {
		expect(commuteBudgetHint('5', '')).toBe(
			'That is 30 minutes each way for a job at the office every day, or 2 h 30 each way for a job you go to once a week.'
		);
		expect(commuteBudgetHint('', '50')).toBe(
			'That is 5 minutes each way for a job at the office every day, or 25 minutes each way for a job you go to once a week.'
		);
		expect(commuteBudgetHint('', '')).toBe('');
		expect(commuteBudgetHint('a lot', '')).toBe('');
		expect(commuteBudgetHint('0', '0')).toBe('');
		expect(formatDuration(1)).toBe('1 minute');
		expect(formatDuration(60)).toBe('1 hour');
		expect(formatDuration(120)).toBe('2 hours');
		expect(formatDuration(65)).toBe('1 h 05');
	});

	it('shows the place found while the address is the one saved', () => {
		const form = perfectJobForm(stored);
		expect(commutePlace(form, stored)).toEqual(HOME);
		form.commute.from = ' 1 rue du Test,  Lyon ';
		expect(commutePlace(form, stored)).toEqual(HOME);
		form.commute.from = '2 rue du Test, Lyon';
		expect(commutePlace(form, stored)).toBeUndefined();
		expect(commutePlace(perfectJobForm(), {})).toBeUndefined();
	});
});
