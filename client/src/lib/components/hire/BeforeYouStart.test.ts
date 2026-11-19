import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import type { Journey } from '#services/workflow.ts';
import BeforeYouStart from './BeforeYouStart.svelte';

// "Before you start" as the server renders it, on a page for recruiters whose meeting can be booked
// (the Hire page leaves it out when nobody can: the e2e API has no Google Calendar, so its
// server render never shows it)

/** The card's text, as a reader gets it: tags dropped, spaces collapsed */
const text = (journey: Journey, ownerName = 'Louis') =>
	render(BeforeYouStart, { props: { journey, ownerName } })
		.body.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

const step = (type: string, config?: object) => ({
	id: type,
	type,
	status: 'pending' as const,
	...(config ? { config } : {})
});

const GATE: Journey = {
	steps: [
		step('note', { title: 'Before you book', text: 'Remote only.' }),
		step('job'),
		step('job-match', { minScore: 70 }),
		step('meeting')
	]
};

describe('BeforeYouStart', () => {
	it('says what each step asks, what to have at hand, how long and what happens next', () => {
		const card = text(GATE);
		expect(card).toContain('Before you start');
		expect(card).toContain(
			"Before you book Read Louis's note, then confirm that you have read it."
		);
		expect(card).toContain(
			'Select or create a job Pick one of your open job descriptions, or write a new one, which takes longer: Louis sees it in the meeting invitation.'
		);
		expect(card).toContain('At least 70 opens the next step.');
		expect(card).toContain('How long About 8 minutes');
		expect(card).toContain(
			'What you need A Google account, to sign in The job description and its pay range, or its PDF where import is offered'
		);
		expect(card).toContain(
			"What happens next Once you book, you receive a calendar invitation by email, and the meeting goes into Louis's calendar: only then does Louis get your name and email address."
		);
	});

	it('names the needs once, from the first step that has them, the job first too', () => {
		const card = text({ steps: [step('job'), step('meeting')] });
		expect(card).toContain(
			'What you need A Google account, to sign in The job description and its pay range, or its PDF where import is offered What happens next'
		);
		expect(card).toContain('About 7 minutes');
	});

	it('asks nothing of a meeting alone, which the page says above it', () => {
		const card = text({ steps: [step('meeting')] });
		expect(card).not.toContain('What each step asks');
		expect(card).toContain('How long About 2 minutes');
		expect(card).toContain('Nothing to prepare, and no account needed.');
	});

	it('is in the page’s language', () => {
		const card = withLocale('fr', () => text(GATE));
		expect(card).toContain('Avant de commencer');
		expect(card).toContain('8 minutes environ');
		expect(card).toContain("ce n'est qu'à ce moment-là que Louis reçoit votre nom");
	});
});
