import { readFileSync } from 'node:fs';
import { JOB_CHANGED, JOB_NOT_FOUND } from '../apiBodies';
import { describe, expect, it } from 'vitest';
import { MATCHING_LIMITS, withLocale } from 'portfolio-common';
import { networkError } from '../recruiter';
import {
	REVIEW_HISTORY_DAYS,
	REVIEW_HISTORY_JOBS,
	decideReview,
	differsInText,
	nearDuplicateCount,
	readReviewList,
	readReviewedJob,
	reconcileReviews,
	reviewFailure,
	reviewStatusText,
	reviewsReadFailure
} from '../matchingReviews';

// The reviewers' screen of matching (matchingReviews.ts): what it keeps of GET
// /matching/reviews's answer, why a read or a decision failed, and the words it builds. Anyone but
// a reviewer, and everyone while matching is off, reads only that the page is not available.

const JOB_ID = '65e2e0000000000000000201';
const OTHER_ID = '65e2e0000000000000000202';
const AT = '2026-11-20T10:00:00.000Z';

const posting = (fields: Record<string, unknown> = {}) => ({
	_id: JOB_ID,
	title: 'Staff Platform Engineer',
	company: 'E2E Review Corp',
	description: '## The job\n\nRun the platform.',
	status: 'open',
	createdAt: AT,
	updatedAt: AT,
	publishedAt: AT,
	location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
	contract: { type: 'cdi' },
	workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
	pay: { min: 60000, max: 75000, currency: 'EUR', period: 'year' },
	...fields
});

const otherJob = (fields: Record<string, unknown> = {}) => ({
	_id: OTHER_ID,
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
	differsIn: ['pay.min', 'pay.max'],
	...fields
});

const reviewed = (fields: Record<string, unknown> = {}) => ({
	job: posting(),
	recruiter: { emailDomain: 'example.com', key: 'a1b2c3d4e5f6' },
	otherJobs: [otherJob()],
	matchingSince: AT,
	review: { status: 'pending', requestedAt: AT, reviewedAt: null, reason: null },
	version: 'f'.repeat(64),
	...fields
});

describe('readReviewList', () => {
	it('reads the jobs waiting: the posting, who is behind it, their other jobs, the version', () => {
		const list = readReviewList({ jobs: [reviewed()] });
		expect(list?.full).toBe(false);
		expect(list?.jobs).toHaveLength(1);
		const [entry] = list!.jobs;
		expect(entry.job).toMatchObject({
			_id: JOB_ID,
			status: 'open',
			title: 'Staff Platform Engineer',
			company: 'E2E Review Corp',
			pay: { min: 60000, max: 75000, currency: 'EUR', period: 'year' }
		});
		expect(entry.recruiter).toEqual({ emailDomain: 'example.com', key: 'a1b2c3d4e5f6' });
		expect(entry.requestedAt).toBe(AT);
		expect(entry.matchingSince).toBe(AT);
		expect(entry.reviewedBefore).toBeNull();
		expect(entry.version).toBe('f'.repeat(64));
		expect(entry.otherJobs).toEqual([
			{
				_id: OTHER_ID,
				title: 'Staff Platform Engineer',
				company: 'E2E Review Corp',
				status: 'open',
				summary: {
					title: 'Staff Platform Engineer',
					description: '',
					location: { country: 'FR', city: 'Lyon', workMode: 'hybrid' },
					contract: { type: 'cdi' },
					pay: { min: 65000, max: 80000, currency: 'EUR', period: 'year' }
				},
				createdAt: AT,
				inMatching: true,
				review: 'pending',
				nearDuplicate: true,
				differsIn: ['pay.min', 'pay.max']
			}
		]);
	});

	it('keeps the posting’s own fields only, never who posted it', () => {
		const [entry] = readReviewList({
			jobs: [reviewed({ job: posting({ recruiter: 'someone', recruiterEmail: 'a@b.c' }) })]
		})!.jobs;
		expect(JSON.stringify(entry)).not.toMatch(/someone|a@b\.c/);
	});

	it('says when a read listed as many as one read lists (more may wait)', () => {
		const jobs = Array.from({ length: MATCHING_LIMITS.reviewsPerRead }, () => reviewed());
		expect(readReviewList({ jobs })?.full).toBe(true);
		expect(readReviewList({ jobs: jobs.slice(1) })?.full).toBe(false);
	});

	it('leaves out a job that is not what the API promises, and fails on what is not a list', () => {
		for (const broken of [
			reviewed({ version: '' }),
			reviewed({ recruiter: { emailDomain: 'example.com' } }),
			reviewed({ job: posting({ _id: 'nope' }) }),
			reviewed({ job: posting({ status: 'maybe' }) }),
			reviewed({ job: posting({ title: ' ' }) })
		]) {
			expect(readReviewList({ jobs: [broken] })?.jobs).toEqual([]);
		}
		expect(readReviewList(undefined)).toBeUndefined();
		expect(readReviewList({ jobs: 'all' })).toBeUndefined();
		expect(readReviewList([reviewed()])).toBeUndefined();
	});

	it('keeps the terms a copy differs in that the editor names, none for a job that is no copy', () => {
		const [entry] = readReviewList({
			jobs: [
				reviewed({
					otherJobs: [
						otherJob({ differsIn: ['pay.min', 'nowhere', 4, 'location.city'] }),
						otherJob({ _id: '65e2e0000000000000000203', nearDuplicate: false }),
						otherJob({ _id: 'broken' })
					]
				})
			]
		})!.jobs;
		expect(entry.otherJobs.map((job) => [job.nearDuplicate, job.differsIn])).toEqual([
			[true, ['pay.min', 'location.city']],
			[false, []]
		]);
		expect(nearDuplicateCount(entry.otherJobs)).toBe(1);
	});

	it('reads at most as many other jobs as the API lists, and a decision taken on an earlier version', () => {
		const many = Array.from({ length: REVIEW_HISTORY_JOBS + 3 }, (_, index) =>
			otherJob({ _id: `65e2e0000000000000000${String(300 + index)}` })
		);
		const [entry] = readReviewList({
			jobs: [
				reviewed({
					otherJobs: many,
					review: { status: 'pending', requestedAt: AT, reviewedAt: '2026-11-19T09:00:00.000Z' }
				})
			]
		})!.jobs;
		expect(entry.otherJobs).toHaveLength(REVIEW_HISTORY_JOBS);
		expect(entry.reviewedBefore).toBe('2026-11-19T09:00:00.000Z');
	});

	it('reads PUT’s answer the same way', () => {
		expect(readReviewedJob(reviewed())?.job._id).toBe(JOB_ID);
		expect(readReviewedJob({})).toBeUndefined();
	});
});

describe('reconcileReviews', () => {
	const COPY_ID = '65e2e0000000000000000203';
	const list = () =>
		readReviewList({
			jobs: [
				reviewed({ otherJobs: [otherJob({ _id: COPY_ID })] }),
				reviewed({
					job: posting({ _id: COPY_ID }),
					otherJobs: [otherJob({ _id: JOB_ID })],
					version: 'c'.repeat(64)
				})
			]
		})!;

	it('takes a job decided on off the list, and the other jobs naming it read its new review', () => {
		const decided = new Map([
			[JOB_ID, { version: 'f'.repeat(64), status: 'approved' as const, at: 2 }]
		]);
		const next = reconcileReviews(list(), decided, 1);
		expect(next.jobs.map((entry) => entry.job._id)).toEqual([COPY_ID]);
		expect(next.jobs[0].otherJobs[0]).toMatchObject({ _id: JOB_ID, review: 'approved' });
	});

	it('keeps a read answered after a decision from bringing it back as waiting', () => {
		// The read started before the decision was saved, and was answered after it
		const decided = new Map([
			[JOB_ID, { version: 'f'.repeat(64), status: 'rejected' as const, at: 5 }]
		]);
		const next = reconcileReviews(list(), decided, 4);
		expect(next.jobs.map((entry) => entry.job._id)).toEqual([COPY_ID]);
		expect(next.jobs[0].otherJobs[0].review).toBe('rejected');
	});

	it('trusts a read started after a decision for the other jobs, and keeps a job edited since', () => {
		// Decided at 2, read at 3: the API answered the review as it is now (pending again,
		// another version: its recruiter edited it)
		const decided = new Map([
			[JOB_ID, { version: 'e'.repeat(64), status: 'approved' as const, at: 2 }]
		]);
		const next = reconcileReviews(list(), decided, 3);
		expect(next.jobs.map((entry) => entry.job._id)).toEqual([JOB_ID, COPY_ID]);
		expect(next.jobs[1].otherJobs[0].review).toBe('pending');
		expect(next.full).toBe(false);
	});
});

describe('failures', () => {
	it('keeps the server’s constants the same (its bodies: apiBodies.test.ts)', () => {
		const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
		const reviews = read('../../../../server/services/matchingReviews.ts');
		expect(reviews).toContain(`export const REVIEW_HISTORY_DAYS = ${REVIEW_HISTORY_DAYS};`);
		expect(reviews).toContain(`export const REVIEW_HISTORY_JOBS = ${REVIEW_HISTORY_JOBS};`);
	});

	it('reads a 403 (not a reviewer) and a 404 (matching off) alike: not available', () => {
		expect(reviewsReadFailure(403, 'Only the reviewers of matching can do this')).toBe(
			'unavailable'
		);
		expect(reviewsReadFailure(404, 'NOT_FOUND')).toBe('unavailable');
		expect(reviewsReadFailure(401, 'Unauthorized')).toBe('signed-out');
		expect(reviewsReadFailure(500, 'Oops')).toBe('retry');
		expect(reviewsReadFailure(503, new TypeError('Failed to fetch'))).toBe('retry');
	});

	it('says why a decision failed', () => {
		expect(reviewFailure(409, JOB_CHANGED).kind).toBe('changed');
		expect(reviewFailure(409, 'Something else').kind).toBe('retry');
		expect(reviewFailure(404, ` ${JOB_NOT_FOUND}\n`).kind).toBe('gone');
		// The 404 of a route that does not exist: matching was turned off
		expect(reviewFailure(404, 'NOT_FOUND').kind).toBe('unavailable');
		expect(reviewFailure(403, 'Only the reviewers of matching can do this').kind).toBe(
			'unavailable'
		);
		expect(reviewFailure(401, 'Unauthorized').kind).toBe('signed-out');
		// Said next to the button: the decision was not saved, what was typed stays
		expect(reviewFailure(401, 'Unauthorized').message).toMatch(
			/^Your session expired: your decision was not saved\. What you wrote is still here/
		);
		expect(reviewFailure(409, JOB_CHANGED).message).toBe(
			'Your decision was not saved: this job description changed since you read it.'
		);
		expect(reviewFailure(404, JOB_NOT_FOUND).message).toMatch(
			/^Your decision was not saved: this job description no longer waits for a review\./
		);
		expect(reviewFailure(500, 'Oops')).toEqual({
			kind: 'retry',
			message: 'Your decision could not be saved. Try again.'
		});
		expect(reviewFailure(503, new TypeError('Failed to fetch'))).toEqual({
			kind: 'retry',
			message: networkError()
		});
	});

	it('shows the API’s refusal of the reason on its field, in the visitor’s language', () => {
		const refusal = {
			type: 'validation',
			on: 'body',
			property: 'reason',
			message: 'La raison peut faire 300 caractères au plus.'
		};
		expect(reviewFailure(422, refusal)).toEqual({ kind: 'reason', message: refusal.message });
		expect(reviewFailure(422, { ...refusal, property: 'version' }).kind).toBe('retry');
	});

	it('says each failure in French too', () => {
		withLocale('fr', () => {
			expect(reviewFailure(409, JOB_CHANGED).message).toMatch(
				/^Votre décision n'a pas été enregistrée\s:\scette offre a changé depuis/
			);
			expect(reviewFailure(403, '').message).toBe("Cette page n'est pas disponible.");
		});
	});

	it('refuses a rejection without a reason, or with one too long, before sending anything', async () => {
		expect(await decideReview(JOB_ID, 'reject', '   ', 'v')).toEqual({
			ok: false,
			failure: {
				kind: 'reason',
				message: 'Say why the job is not accepted: its recruiter reads it.'
			}
		});
		const tooLong = await decideReview(
			JOB_ID,
			'reject',
			'x'.repeat(MATCHING_LIMITS.reviewReason + 1),
			'v'
		);
		expect(tooLong).toEqual({
			ok: false,
			failure: {
				kind: 'reason',
				message: `The reason can be ${MATCHING_LIMITS.reviewReason} characters at most.`
			}
		});
	});
});

describe('texts', () => {
	it('names the terms a copy differs in once each, as the editor labels them', () => {
		expect(differsInText(['pay.min', 'pay.max'])).toBe('Minimum pay and Maximum pay');
		expect(differsInText(['location.city', 'location.city'])).toBe('City');
		withLocale('fr', () => {
			expect(differsInText(['pay.min', 'pay.max'])).toBe(
				'Rémunération minimale et Rémunération maximale'
			);
		});
	});

	it('says where another job’s review stands, never reviewed included', () => {
		expect(reviewStatusText('pending')).toBe('Waiting for a review');
		expect(reviewStatusText('approved')).toBe('Approved');
		expect(reviewStatusText('rejected')).toBe('Rejected');
		expect(reviewStatusText(null)).toBe('Never reviewed');
		withLocale('fr', () => expect(reviewStatusText('approved')).toBe('Acceptée'));
	});
});
