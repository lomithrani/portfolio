import { describe, it, expect } from 'vitest';
import { LOCALES, stepManifests, withLocale } from 'portfolio-common';
import { clientStep, clientStepTypes, stepNeedText, type StepNeed } from './index';

// A step type is defined once per workspace under the same name (docs/WORKFLOW_STEPS.md): the
// API's tests check its registry against portfolio-common's, this one the client's.
describe("the client's step types", () => {
	it('has an entry for every step type of portfolio-common, and no other', () => {
		expect(clientStepTypes().sort()).toEqual(
			stepManifests()
				.map((manifest) => manifest.type)
				.sort()
		);
	});

	it('has a settings form for every type whose steps start with settings to fill in', () => {
		const withSettings = stepManifests().filter(
			(manifest) => Object.keys(manifest.defaultConfig()).length > 0
		);
		expect(withSettings.map((manifest) => manifest.type)).toContain('note');
		for (const manifest of withSettings) {
			expect(clientStep(manifest.type)?.Settings, manifest.type).toBeDefined();
		}
	});

	it('does not take a name of Object for a step type', () => {
		expect(clientStep('constructor')).toBeUndefined();
		expect(clientStep('removed-since')).toBeUndefined();
	});

	it('names a note with its title, once it has one', () => {
		const note = clientStep('note');
		expect(note?.title?.({ config: { title: ' Before you book ', text: 'Remote only.' } })).toBe(
			'Before you book'
		);
		expect(note?.title?.({ config: { title: '  ' } })).toBeUndefined();
		expect(note?.title?.({})).toBeUndefined();
	});

	it('says why a job match is not passed, where other steps only say it is not', () => {
		const step = {
			id: 'job-match',
			type: 'job-match',
			status: 'failed' as const,
			view: { score: 40, minScore: 70, job: { _id: 'a'.repeat(24), title: 'Staff Engineer' } }
		};
		expect(clientStep('job-match')?.failedNote?.(step)).toBe(
			'Staff Engineer scores 40 out of 100: at least 70 is needed.'
		);
		expect(clientStep('note')?.failedNote).toBeUndefined();
	});

	it('says what every step takes before the visitor starts: what it asks, how long, what to have', () => {
		const needs: StepNeed[] = ['googleAccount', 'jobDescription'];
		for (const type of clientStepTypes()) {
			const effort = clientStep(type)?.effort;
			expect(effort, type).toBeDefined();
			expect(Number.isInteger(effort?.minutes) && (effort?.minutes ?? -1) >= 0, type).toBe(true);
			for (const need of effort?.needs ?? []) expect(needs, type).toContain(need);
			const step = { id: type, type, status: 'pending' as const };
			for (const locale of LOCALES) {
				withLocale(locale, () => {
					expect(effort?.asks(step, 'Louis').trim(), `${type} (${locale})`).not.toBe('');
				});
			}
		}
		for (const need of needs) {
			for (const locale of LOCALES) {
				withLocale(locale, () => expect(stepNeedText(need).trim(), need).not.toBe(''));
			}
		}
	});

	it('asks a Google account of the steps a visitor submits, and the job of the job step', () => {
		expect(clientStep('note')?.effort.needs).toEqual(['googleAccount']);
		expect(clientStep('job')?.effort.needs).toEqual(['googleAccount', 'jobDescription']);
		// Scored from the job picked: nothing to do, nothing more to have
		expect(clientStep('job-match')?.effort).toMatchObject({ minutes: 0 });
		expect(clientStep('job-match')?.effort.needs).toBeUndefined();
		// A meeting alone is booked signed out, with a name and an email address
		expect(clientStep('meeting')?.effort.needs).toBeUndefined();
		expect(stepNeedText('jobDescription')).toBe(
			'The job description and its pay range, or its PDF where import is offered'
		);
	});

	it('says what a step asks with the settings visitors get of it', () => {
		const match = { id: 'job-match', type: 'job-match', status: 'pending' as const };
		const asks = clientStep('job-match')?.effort.asks;
		expect(asks?.({ ...match, config: { minScore: 70 } }, 'Louis')).toBe(
			"Your job is scored out of 100 against Louis's criteria: you see your score, never what they ask for. At least 70 opens the next step."
		);
		// A minimum that is not one is not said
		expect(asks?.({ ...match, config: { minScore: 'high' } }, 'Louis')).toBe(
			"Your job is scored out of 100 against Louis's criteria: you see your score, never what they ask for."
		);
		expect(withLocale('fr', () => asks?.({ ...match, config: { minScore: 70 } }, 'Louis'))).toMatch(
			/^Votre offre est notée sur 100 .* vous voyez son résultat/
		);
		// Writing a job on the way takes longer than the minutes counted, which are a pick's
		expect(
			clientStep('job')?.effort.asks({ id: 'job', type: 'job', status: 'pending' }, 'Louis')
		).toBe(
			'Pick one of your open job descriptions, or write a new one, which takes longer: Louis sees it in the meeting invitation.'
		);
		expect(
			clientStep('note')?.effort.asks(
				{ id: 'note', type: 'note', status: 'pending', config: { title: 'Hi', text: 'Read me' } },
				'Louis'
			)
		).toBe("Read Louis's note, then confirm that you have read it.");
	});

	it('presents the Hire page for the step a journey leads to', () => {
		expect(clientStep('meeting')?.goal?.alone).toBe(
			"Pick a time slot that suits you — you'll receive a calendar invitation by email."
		);
		expect(clientStep('job')?.goal).toBeUndefined();
		// The page says what the last access step offers, and what happens once it is done: each
		// access type says how
		for (const manifest of stepManifests().filter((manifest) => manifest.kind === 'access')) {
			const goal = clientStep(manifest.type)?.goal;
			expect(goal, manifest.type).toBeDefined();
			expect(goal?.next('Louis'), manifest.type).toMatch(/\w/);
		}
		// What a recruiter wants to know before they sign in: who learns their name and email, when
		expect(clientStep('meeting')?.goal?.next('Louis')).toBe(
			"Once you book, you receive a calendar invitation by email, and the meeting goes into Louis's calendar: only then does Louis get your name and email address."
		);
		expect(withLocale('fr', () => clientStep('meeting')?.goal?.next('Louis'))).toBe(
			"Une fois le créneau réservé, vous recevez une invitation par e-mail, et Louis retrouve le rendez-vous dans son agenda\u00a0: ce n'est qu'à ce moment-là que Louis reçoit votre nom et votre adresse e-mail."
		);
		// Read when shown, in the visitor's language
		expect(withLocale('fr', () => clientStep('meeting')?.goal?.alone)).toBe(
			'Choisissez un créneau qui vous convient\u00a0: vous recevrez une invitation par e-mail.'
		);
		// A meeting is offered only while the owner's calendar has a meeting type to book
		expect(clientStep('meeting')?.goal?.booking).toBe(true);
	});
});
