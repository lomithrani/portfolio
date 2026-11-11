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

	it('presents the Hire page for the step a journey leads to', () => {
		expect(clientStep('meeting')?.goal?.heading('Louis')).toBe('Book a meeting with Louis');
		expect(clientStep('job')?.goal).toBeUndefined();
	});
});
