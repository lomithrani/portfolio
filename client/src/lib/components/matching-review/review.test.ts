import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import { readReviewedJob, type ReviewedJob } from '#services/matchingReviews.ts';
import JobReview from './JobReview.svelte';
import OtherJobs from './OtherJobs.svelte';

// A job waiting for a reviewer of matching, as the reviewers' page renders it: the posting, when
// it was sent for review, who is behind it (the domain of the recruiter's email and their key,
// never their name or address), their other jobs with the copies of it flagged and the terms they
// differ in, and the decision. No candidate's data: the API gives none.

/** The markup's text, as a reader gets it: tags dropped, spaces collapsed */
const textOf = (body: string) =>
	body
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const JOB_ID = '65e2e0000000000000000201';
const COPY_ID = '65e2e0000000000000000202';
const OTHER_ID = '65e2e0000000000000000203';
const AT = '2026-11-20T10:00:00.000Z';

const entry = (fields: Record<string, unknown> = {}): ReviewedJob =>
	readReviewedJob({
		job: {
			_id: JOB_ID,
			title: 'Staff Platform Engineer',
			company: 'E2E Review Corp',
			description: '## The job\n\nRun the platform.',
			status: 'open',
			location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
			contract: { type: 'cdi' },
			pay: { min: 60000, max: 75000, currency: 'EUR', period: 'year' }
		},
		recruiter: { emailDomain: 'example.com', key: 'a1b2c3d4e5f6' },
		otherJobs: [
			{
				_id: COPY_ID,
				title: 'Staff Platform Engineer',
				company: 'E2E Review Corp',
				status: 'open',
				location: { country: 'FR', city: 'Lyon', workMode: 'hybrid' },
				pay: { min: 65000, max: 80000, currency: 'EUR', period: 'year' },
				contract: { type: 'cdi' },
				createdAt: AT,
				inMatching: true,
				review: 'pending',
				nearDuplicate: true,
				differsIn: ['pay.min', 'pay.max']
			},
			{
				_id: OTHER_ID,
				title: 'Data Engineer',
				company: 'E2E Review Corp',
				status: 'closed',
				createdAt: AT,
				inMatching: false,
				review: 'rejected',
				nearDuplicate: false,
				differsIn: []
			}
		],
		matchingSince: AT,
		review: { status: 'pending', requestedAt: AT, reviewedAt: null, reason: null },
		version: 'v1',
		...fields
	})!;

const noop = () => {};
const review = (job: ReviewedJob, listed: string[] = [], notice = '') =>
	render(JobReview, {
		props: {
			entry: job,
			headingId: `review-${job.job._id}`,
			listed: new Set(listed),
			anchorOf: (id: string) => `review-${id}`,
			notice,
			onApprove: noop,
			onReject: async () => null
		}
	}).body;

describe('a job waiting for a review', () => {
	it('shows the posting, when it waits since, who is behind it and the decision', () => {
		const body = review(entry());
		const text = textOf(body);
		expect(body).toContain(`id="review-${JOB_ID}"`);
		expect(text).toContain('Staff Platform Engineer');
		expect(text).toContain('E2E Review Corp');
		expect(text).toContain('Run the platform.');
		expect(text).toContain('Waiting for a review since');
		// What its recruiter asked for, never "Proposed to candidates" (approved and live)
		expect(text).toContain('Its recruiter asked to propose it to candidates on');
		expect(text).not.toContain('Proposed to candidates');
		expect(text).toContain('Email domain example.com');
		expect(text).toContain('Recruiter key a1b2c3d4e5f6');
		expect(text).toContain('Your decision');
		expect(text).toMatch(/Approve.*Why you reject it.*Reject/);
		expect(text).not.toContain('An earlier version was reviewed');
		// Never a promise that it reaches candidates at once: open, and its recruiter's terms
		expect(text).toContain(
			'Approved, it is proposed to the candidates whose criteria it meets, while it is open and its recruiter has accepted the terms in force.'
		);
		expect(text).not.toMatch(/at once/);
		expect(body).not.toContain('data-review-on-hold');
		// The reason is required and kept on one line
		expect(body).toContain('aria-required="true"');
		expect(text).toContain('Required to reject.');
		expect(text).toContain('as one paragraph (line breaks become spaces)');
	});

	it('names its controls with its title (the page lists many jobs), and is one named region', () => {
		const body = review(entry());
		expect(body).toContain('aria-label="Approve: Staff Platform Engineer"');
		expect(body).toContain('aria-label="Reject: Staff Platform Engineer"');
		expect(body).toContain('aria-label="Why you reject it: Staff Platform Engineer"');
		// One region per job: the posting's article, named by its title; no named section
		expect(body.match(/aria-labelledby=/g)).toHaveLength(1);
		expect(body).toContain(
			`<article class="relative space-y-6" aria-labelledby="review-${JOB_ID}"`
		);
		expect(body).not.toMatch(/<section[^>]*aria-labelledby/);
	});

	it('says, for a job on hold, that it is proposed only once its recruiter opens it again', () => {
		const onHold = entry({
			job: {
				_id: JOB_ID,
				title: 'Staff Platform Engineer',
				company: 'E2E Review Corp',
				description: '## The job\n\nRun the platform.',
				status: 'on_hold',
				contract: { type: 'cdi' }
			}
		});
		const body = review(onHold);
		expect(textOf(body)).toContain(
			'This job is on hold: approved, it is proposed to candidates only once its recruiter opens it again.'
		);
		expect(body).toContain('data-review-on-hold');
		withLocale('fr', () => {
			expect(textOf(review(onHold))).toContain(
				"Cette offre est en pause : acceptée, elle n'est proposée aux candidats qu'une fois que son recruteur la rouvre."
			);
		});
	});

	it('says under its title why a decision on it was refused', () => {
		const body = review(entry(), [], 'Your decision was not saved: this job description changed.');
		expect(body).toContain('data-review-notice');
		expect(textOf(body)).toMatch(
			/Staff Platform Engineer.*Your decision was not saved: this job description changed\..*Waiting for a review since/
		);
		expect(review(entry())).not.toContain('data-review-notice');
	});

	it('flags the copies of it with the terms they differ in, and links one waiting on the page', () => {
		const body = review(entry(), [JOB_ID, COPY_ID]);
		const text = textOf(body);
		expect(text).toContain('This recruiter’s other jobs (2)');
		expect(text).toContain('1 of them is a copy of this job');
		expect(text).toContain('Copy of this job');
		expect(text).toContain('Differs in: Minimum pay and Maximum pay');
		expect(text).toContain('Waiting for a review');
		expect(text).toContain('Rejected');
		// Only the exception is said: the recruiter no longer asks to propose one of them
		expect(text).toContain('Its recruiter no longer asks to propose it');
		expect(body.match(/Its recruiter no longer asks to propose it/g)).toHaveLength(1);
		expect(text).not.toContain('Its recruiter asks to propose it to candidates');
		expect(body).toContain(`href="#review-${COPY_ID}"`);
		// Named with the copy's title and day: copies share a title
		expect(body).toMatch(
			/aria-label="Waiting on this page: Staff Platform Engineer, created on [^"]+"/
		);
		expect(body).not.toContain(`href="#review-${OTHER_ID}"`);
		expect(body.match(/data-near-duplicate/g)).toHaveLength(1);
	});

	it('says when an earlier version was reviewed, and a recruiter without an email domain', () => {
		const text = textOf(
			review(
				entry({
					recruiter: { emailDomain: null, key: 'a1b2c3d4e5f6' },
					review: { status: 'pending', requestedAt: AT, reviewedAt: '2026-11-19T09:00:00.000Z' }
				})
			)
		);
		expect(text).toContain('An earlier version was reviewed on');
		expect(text).toContain('Email domain No email address');
	});

	it('reads in French', () => {
		withLocale('fr', () => {
			const text = textOf(review(entry(), [JOB_ID, COPY_ID]));
			expect(text).toContain('En attente de relecture depuis le');
			expect(text).toContain('Clé du recruteur a1b2c3d4e5f6');
			expect(text).toContain('Les autres offres de ce recruteur (2)');
			expect(text).toContain("1 d'entre elles est une copie de cette offre");
			expect(text).toContain('Diffère par : Rémunération minimale et Rémunération maximale');
			expect(text).toMatch(/Accepter.*Pourquoi vous la refusez.*Refuser/);
		});
	});
});

describe("a recruiter's other jobs", () => {
	it('says when there is none', () => {
		const body = render(OtherJobs, {
			props: { jobs: [], listed: new Set<string>(), anchorOf: (id: string) => id }
		}).body;
		expect(textOf(body)).toContain(
			'None: this recruiter asked to propose no other job to candidates lately.'
		);
		expect(body).not.toContain('data-copies-warning');
	});
});
