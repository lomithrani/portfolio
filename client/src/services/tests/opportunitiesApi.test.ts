import { beforeEach, describe, expect, it, vi } from 'vitest';

// The candidate's calls of matching (services/opportunities.ts), with the API answered here: how
// each answer of the inbox's and the job page's routes is read, a refused body included

// vi.mock factories are hoisted: they cannot reference outer variables (but vi.hoisted ones)
const api = vi.hoisted(() => ({
	feed: vi.fn(),
	decide: vi.fn(),
	undo: vi.fn(),
	list: vi.fn(),
	end: vi.fn()
}));

vi.mock('#services', () => ({
	portfolioTextApi: {
		opportunities: {
			get: api.feed,
			jobs: () => ({ decision: { put: api.decide, delete: api.undo } })
		},
		matches: Object.assign(() => ({ end: { post: api.end } }), { get: api.list })
	}
}));

import {
	answerOpportunity,
	endMutualInterest,
	loadMutualInterests,
	MATCH_NOT_FOUND,
	readOpportunities,
	undoOpportunityAnswer
} from '../opportunities';

const JOB_ID = '65e2e0000000000000000102';
const MATCH_ID = '65e2e00000000000000000d1';

/** A mutual interest as GET /matches?side=candidate answers it */
const interest = {
	_id: MATCH_ID,
	side: 'candidate',
	matchedAt: '2026-11-20T10:00:00.000Z',
	changedAt: null,
	endedAt: null,
	endReason: null,
	seen: false,
	job: { _id: JOB_ID, status: 'open', title: 'Senior Data Engineer', company: 'E2E Corp' },
	score: 92,
	minScore: 70,
	criteria: []
};

/** Eden's answer of a failure */
const failure = (status: number, value: unknown, headers?: Record<string, string>) => ({
	data: null,
	error: { status, value },
	response: new Response(null, { status, headers })
});

const answered = (data: unknown) => ({ data, error: null, response: new Response('{}') });

beforeEach(() => {
	for (const call of Object.values(api)) call.mockReset();
});

describe('loadMutualInterests and endMutualInterest', () => {
	it('read a page of mutual interests, and one ended', async () => {
		api.list.mockResolvedValue(answered({ matches: [interest], next: null }));
		expect(await loadMutualInterests(null)).toMatchObject({
			ok: true,
			interests: [{ _id: MATCH_ID, side: 'candidate' }],
			next: null
		});
		api.end.mockResolvedValue(
			answered({ ...interest, endedAt: '2026-11-21T10:00:00.000Z', endReason: 'candidate' })
		);
		expect(await endMutualInterest(MATCH_ID)).toMatchObject({
			ok: true,
			interest: { _id: MATCH_ID, endReason: 'candidate' }
		});
	});

	it('tell a mutual interest gone (the API’s 404) from matching turned off (a route’s 404)', async () => {
		api.end.mockResolvedValue(failure(404, MATCH_NOT_FOUND));
		expect(await endMutualInterest(MATCH_ID)).toEqual({ ok: false, failure: 'gone' });
		api.end.mockResolvedValue(failure(404, 'NOT_FOUND'));
		expect(await endMutualInterest(MATCH_ID)).toEqual({ ok: false, failure: 'off' });
		api.list.mockResolvedValue(failure(404, 'NOT_FOUND'));
		expect(await loadMutualInterests(null)).toEqual({ ok: false, failure: 'off' });
	});

	it('say a session ended, no answer, and an answer that is not one', async () => {
		api.list.mockResolvedValue(failure(401, 'Unauthorized'));
		expect(await loadMutualInterests(null)).toEqual({ ok: false, failure: 'signed-out' });
		api.list.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await loadMutualInterests(null)).toEqual({ ok: false, failure: 'network' });
		api.list.mockResolvedValue(answered({ items: [] }));
		expect(await loadMutualInterests(null)).toEqual({ ok: false, failure: 'error' });
		api.end.mockResolvedValue(answered({ ...interest, side: 'recruiter' }));
		expect(await endMutualInterest(MATCH_ID)).toEqual({ ok: false, failure: 'error' });
	});
});

describe('answerOpportunity and undoOpportunityAnswer', () => {
	it('read the answer saved, and the mutual interest it made', async () => {
		api.decide.mockResolvedValue(answered({ decision: 'interested', match: null }));
		expect(await answerOpportunity(JOB_ID, 'interested')).toEqual({
			ok: true,
			decision: 'interested',
			match: null
		});
		api.decide.mockResolvedValue(answered({ decision: 'interested', match: interest }));
		expect(await answerOpportunity(JOB_ID, 'interested')).toMatchObject({
			ok: true,
			match: { _id: MATCH_ID }
		});
	});

	it('take an answer the reader refuses for one to try again, never for a plain answer', async () => {
		// Saved all the same: the page reads again rather than guess, and offers no Undo
		api.decide.mockResolvedValue(answered({ decision: 'interested', match: { _id: 'nope' } }));
		expect(await answerOpportunity(JOB_ID, 'interested')).toMatchObject({
			ok: false,
			failure: { kind: 'retry' }
		});
		api.undo.mockResolvedValue(answered({ decision: 'maybe' }));
		expect(await undoOpportunityAnswer(JOB_ID)).toMatchObject({
			ok: false,
			failure: { kind: 'retry' }
		});
	});

	it('say an undo the API refuses (not the first answer on the job), and from when a 429 lets one through', async () => {
		api.undo.mockResolvedValue(failure(409, 'This decision can no longer be undone'));
		expect(await undoOpportunityAnswer(JOB_ID)).toMatchObject({
			ok: false,
			failure: { kind: 'final', message: 'This answer can no longer be undone.' }
		});
		api.decide.mockResolvedValue(
			failure(429, 'Too many decisions today', { 'Retry-After': '3600' })
		);
		const limited = await answerOpportunity(JOB_ID, 'pass');
		expect(limited).toMatchObject({ ok: false, failure: { kind: 'limit', retryAfter: 3600 } });
		expect(!limited.ok && limited.failure.message).toMatch(/You can answer again from /);
	});

	it('say a request that got no answer, to try again', async () => {
		api.decide.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await answerOpportunity(JOB_ID, 'pass')).toMatchObject({
			ok: false,
			failure: { kind: 'retry' }
		});
	});
});

describe('readOpportunities', () => {
	it('reads a page of the feed, and a body that is not one as a read to try again', async () => {
		api.feed.mockResolvedValue(answered({ jobs: [], more: false, next: null, pending: true }));
		expect(await readOpportunities(null)).toEqual({
			ok: true,
			page: { cards: [], more: false, next: null, pending: true }
		});
		api.feed.mockResolvedValue(answered({ cards: 'nope' }));
		expect(await readOpportunities(null)).toMatchObject({
			ok: false,
			failure: { kind: 'retry' }
		});
	});

	it('stops on the API’s refusals (not proposed, matching off), and says from when a 429 reads again', async () => {
		api.feed.mockResolvedValue(failure(403, 'You are not proposed to recruiters now'));
		expect(await readOpportunities(null)).toMatchObject({
			ok: false,
			failure: { kind: 'not-proposed' }
		});
		api.feed.mockResolvedValue(failure(404, 'NOT_FOUND'));
		expect(await readOpportunities(null)).toMatchObject({ ok: false, failure: { kind: 'off' } });
		api.feed.mockResolvedValue(failure(429, 'Too many reads', { 'retry-after': '120' }));
		expect(await readOpportunities('cursor')).toMatchObject({
			ok: false,
			failure: { kind: 'limit', retryAfter: 120 }
		});
		expect(api.feed).toHaveBeenLastCalledWith(
			expect.objectContaining({ query: { after: 'cursor' } })
		);
	});
});
