import { describe, it, expect } from 'vitest';
import { stepManifests } from 'portfolio-common';
import { clientStep, clientStepTypes } from './index';

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

	it('presents the Hire page for the step a journey leads to', () => {
		expect(clientStep('meeting')?.goal?.alone).toBe(
			"Pick a time slot that suits you — you'll receive a calendar invitation by email."
		);
		expect(clientStep('job')?.goal).toBeUndefined();
		// The page says what the last access step offers: each access type says how
		for (const manifest of stepManifests().filter((manifest) => manifest.kind === 'access')) {
			expect(clientStep(manifest.type)?.goal, manifest.type).toBeDefined();
		}
	});
});
