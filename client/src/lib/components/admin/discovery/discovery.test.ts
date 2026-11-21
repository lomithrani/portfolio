import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { legalMessages, withLocale } from 'portfolio-common';
import type { DiscoveryKnown } from '#services/discovery.ts';
import type { DiscoveryStatus } from '#services/matching.ts';
import DiscoverySettings from './DiscoverySettings.svelte';
import ReadinessChecklist from './ReadinessChecklist.svelte';

// Discovery's settings in the Perfect job tab as they render, where the owner stands: nothing while
// matching is off or not known yet, what is missing with what fixes it, the consent box only when
// there is a consent to give or confirm, turning it off only while it is on

/** The markup's text, as a reader gets it: tags dropped, spaces collapsed */
const textOf = (body: string) =>
	body
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const OFF: DiscoveryStatus = {
	state: 'off',
	enabledAt: null,
	consentExpiresAt: null,
	missing: [],
	minScore: 70,
	card: { headline: null, hiddenExperiences: [] }
};

const EXPERIENCES = [
	{ id: '65e2e0000000000000000201', title: 'Backend engineer', company: 'Acme' },
	{ id: '65e2e0000000000000000202', title: 'Intern', company: null }
];

const settings = (discovery: DiscoveryKnown | null, criteriaChanged = false) =>
	render(DiscoverySettings, {
		props: {
			discovery,
			onDiscovery: () => {},
			reload: () => {},
			experiences: EXPERIENCES,
			criteriaChanged,
			active: true,
			openJourney: () => {},
			openTab: () => {},
			onCriteria: () => {}
		}
	}).body;

const ready = (status: Partial<DiscoveryStatus>): DiscoveryKnown => ({
	kind: 'ready',
	status: { ...OFF, ...status }
});

describe('DiscoverySettings', () => {
	it('shows nothing while matching is off, or before it is known', () => {
		expect(textOf(settings(null))).toBe('');
		expect(textOf(settings({ kind: 'off' }))).toBe('');
	});

	it('says what the card shows recruiters, as the consent words it', () => {
		const text = textOf(settings(ready({})));
		expect(text).toContain('your role titles with the time in each and whether you still hold it');
		expect(text).toContain('If you say a job interests you, its recruiter sees it on your card.');
	});

	it('offers to turn it on with a box of its own, unticked, worded as recorded', () => {
		const body = settings(ready({}));
		const text = textOf(body);
		expect(text).toContain('Be found by recruiters');
		expect(text).toContain('Optional, and off until you turn it on.');
		expect(text).toContain('Everything it asks is set.');
		expect(text).toContain(
			'only when it scores at least 70 out of 100 against your criteria, with no deal-breaker missed'
		);
		expect(text).toContain(legalMessages.discoveryConsent);
		expect(body).not.toMatch(/type="checkbox"[^>]*checked[^>]*aria-describedby="[^"]*consent/);
		expect(text).toContain('Make me visible to recruiters');
		// Its experiences, each shown on the card until unticked
		expect(text).toContain('Backend engineer · Acme');
		expect(text).toContain('Intern');
		// Not on: nothing to turn off
		expect(body).not.toContain('data-discovery-off');
	});

	it('lists what is missing, each with what fixes it, and holds the opt-in back', () => {
		const text = textOf(settings(ready({ missing: ['terms', 'pay', 'journey', 'schedule'] })));
		expect(text).toContain('Accept the terms of use in force first.');
		expect(text).toContain('Open my account');
		expect(text).toContain('Rate the pay');
		expect(text).toContain('Add the missing steps');
		expect(text).toContain('Open my calendar settings');
		expect(text).toContain('Set what is missing above first.');
	});

	it('keeps the button that turns it on focusable when it cannot be used, saying why', () => {
		const body = settings(ready({ missing: ['calendar'] }));
		const button = /<button[^>]*>\s*(?:<!--[^>]*-->\s*)*Make me visible to recruiters/.exec(
			body
		)?.[0];
		expect(button).toBeDefined();
		expect(button).toContain('aria-disabled="true"');
		expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
		expect(body).toMatch(/aria-live="polite"[^>]*>\s*(?:<!--[^>]*-->\s*)*<p id="[^"]*-blocked"/);
	});

	it('waits for the criteria not saved yet, saying so', () => {
		const text = textOf(settings(ready({}), true));
		expect(text).toContain('Save your criteria first.');
	});

	it('while on, says since when, and offers to turn it off, not to turn it on', () => {
		const since = new Date();
		const until = new Date(since.getTime() + 700 * 24 * 60 * 60 * 1000);
		const body = settings(
			ready({
				state: 'on',
				enabledAt: since.toISOString(),
				consentExpiresAt: until.toISOString()
			})
		);
		const text = textOf(body);
		expect(text).toMatch(/Visible to recruiters since .+\. Your consent is valid until .+\./);
		expect(body).toContain('data-discovery-off');
		expect(text).not.toContain('Make me visible to recruiters');
		expect(text).not.toContain(legalMessages.discoveryConsent);
		expect(text).not.toContain('Optional, and off until you turn it on.');
		// Where the jobs proposed are
		expect(text).toContain('Open your opportunities');
		expect(body).toMatch(/href="\/opportunities"/);
	});

	it('paused, says what is missing, and still offers to turn it off', () => {
		const body = settings(
			ready({
				state: 'paused',
				enabledAt: new Date().toISOString(),
				consentExpiresAt: new Date(Date.now() + 1e10).toISOString(),
				missing: ['calendar']
			})
		);
		const text = textOf(body);
		expect(text).toContain(
			'Paused: no recruiter sees your card until what is missing below is set.'
		);
		expect(text).toContain('What is missing');
		expect(text).toContain('Connect Google Calendar, so recruiters can book a meeting.');
		expect(body).toContain('data-discovery-off');
		expect(text).toContain('Open your opportunities');
		// Its consent far from ending: nothing to confirm
		expect(text).not.toContain('Your consent ends on');
	});

	it('paused in the consent’s last days, says it ends and asks to confirm it once set', () => {
		const until = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
		const since = new Date(until);
		since.setUTCMonth(since.getUTCMonth() - 24);
		const text = textOf(
			settings(
				ready({
					state: 'paused',
					enabledAt: since.toISOString(),
					consentExpiresAt: until.toISOString(),
					missing: ['calendar']
				})
			)
		);
		expect(text).toContain('Paused: no recruiter sees your card');
		expect(text).toMatch(
			/Your consent ends on .+: once what is missing is set, confirm it again to stay visible\./
		);
		expect(text).toContain('Confirm my consent again');
	});

	it('once the consent ended, asks for it again', () => {
		const body = settings(
			ready({
				state: 'lapsed',
				enabledAt: '2024-11-02T09:00:00.000Z',
				consentExpiresAt: '2026-11-02T09:00:00.000Z'
			})
		);
		const text = textOf(body);
		expect(text).toContain('Your consent ended on');
		expect(text).toContain('Give my consent again');
		// Turning it off still drops the answers about them
		expect(body).toContain('data-discovery-off');
		expect(body).toMatch(/data-discovery-off[^>]*>\s*(?:<!--[^>]*-->\s*)*Turn it off/);
		expect(text).not.toContain('Open your opportunities');
	});

	it('in its last days, asks to confirm the consent again', () => {
		const until = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
		const since = new Date(until);
		since.setUTCMonth(since.getUTCMonth() - 24);
		const body = settings(
			ready({
				state: 'on',
				enabledAt: since.toISOString(),
				consentExpiresAt: until.toISOString()
			})
		);
		const text = textOf(body);
		expect(text).toContain('Confirm it again to stay visible to recruiters.');
		expect(text).toContain('Confirm my consent again');
		expect(body).toContain('data-discovery-off');
	});

	it('is written in French too', () => {
		const text = withLocale('fr', () => textOf(settings(ready({}))));
		expect(text).toContain('Être visible des recruteurs');
		expect(text).toContain('Me rendre visible des recruteurs');
		expect(text).toContain(withLocale('fr', () => legalMessages.discoveryConsent));
	});
});

describe('ReadinessChecklist', () => {
	const checklist = (missing: Parameters<typeof render<typeof ReadinessChecklist>>[1]) =>
		textOf(render(ReadinessChecklist, missing).body);

	it('says each requirement as the API does, and offers nothing for what the page cannot fix', () => {
		const text = checklist({
			props: {
				missing: ['portfolio', 'criteria', 'active'],
				heading: 'What is missing',
				onCriteria: () => {},
				onJourney: () => {},
				onAppointments: () => {}
			}
		});
		expect(text).toContain('Claim the address of your portfolio first.');
		expect(text).toContain('Switch on at least 3 criteria in your perfect job.');
		expect(text).toContain('Go to my criteria');
		expect(text).toContain('Sign in at least once every 180 days.');
		expect(text).not.toContain('Open my account');
	});
});
