import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	DISCOVERY_LIMITS,
	DISCOVERY_REJOIN_DAYS,
	DISCOVERY_REQUIREMENTS,
	LEGAL_VERSION,
	WORKFLOW_LIMITS,
	journeyTemplate,
	legalMessages,
	parseWorkflow,
	withLocale,
	type WorkflowStep
} from 'portfolio-common';

// vi.mock factories are hoisted: they cannot reference outer variables (but vi.hoisted ones)
const api = vi.hoisted(() => ({
	get: vi.fn(),
	put: vi.fn(),
	cardGet: vi.fn(),
	consentPost: vi.fn(),
	consentDelete: vi.fn()
}));

vi.mock('#services', () => ({
	portfolioTextApi: {
		discovery: {
			get: api.get,
			put: api.put,
			card: { get: api.cardGet },
			consent: { post: api.consentPost, delete: api.consentDelete }
		}
	}
}));

import {
	cardChanged,
	cardExperiences,
	cardForm,
	cardProblem,
	cardSettings,
	consentAction,
	discoveryFailure,
	discoveryOn,
	discoverySummary,
	discoveryWithdrawable,
	loadCardPreview,
	loadDiscovery,
	missingGateSteps,
	rebaseCardForm,
	rejoinDate,
	requirementAction,
	saveDiscoveryCard,
	turnDiscoveryOff,
	turnDiscoveryOn,
	withGateSteps
} from '../discovery';
import type { DiscoveryStatus } from '../matching';

const NOW = new Date('2026-11-21T10:00:00Z');

/** GET /discovery of a candidate who never turned it on, with nothing missing */
const OFF = {
	state: 'off',
	enabledAt: null,
	consentExpiresAt: null,
	missing: [],
	minScore: 70,
	card: { headline: null, hiddenExperiences: [] }
};

const status = (fields: Partial<DiscoveryStatus> = {}): DiscoveryStatus => ({
	...(OFF as DiscoveryStatus),
	...fields
});

const EXPERIENCE_ID = '65e2e0000000000000000201';

describe('reading GET /discovery', () => {
	beforeEach(() => api.get.mockReset());

	it('reads the status, with the session cookie', async () => {
		api.get.mockResolvedValue({ data: OFF, error: null });
		const signal = new AbortController().signal;
		expect(await loadDiscovery(signal)).toEqual({ kind: 'ready', status: OFF });
		expect(api.get).toHaveBeenCalledWith({ fetch: { credentials: 'include', signal } });
	});

	it('reads a 404 as matching being off: nothing of discovery shows', async () => {
		api.get.mockResolvedValue({ data: null, error: { status: 404, value: 'Not Found' } });
		expect(await loadDiscovery()).toEqual({ kind: 'off' });
	});

	it('tells an expired session, no answer and an answer that is not one apart', async () => {
		api.get.mockResolvedValue({ data: null, error: { status: 401, value: 'Unauthorized' } });
		expect(await loadDiscovery()).toEqual({ kind: 'failed', reason: 'session-expired' });
		api.get.mockResolvedValue({
			data: null,
			error: { status: 503, value: new TypeError('Failed to fetch') }
		});
		expect(await loadDiscovery()).toEqual({ kind: 'failed', reason: 'network' });
		api.get.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await loadDiscovery()).toEqual({ kind: 'failed', reason: 'network' });
		api.get.mockResolvedValue({ data: { state: 'maybe' }, error: null });
		expect(await loadDiscovery()).toEqual({ kind: 'failed', reason: 'error' });
		api.get.mockResolvedValue({ data: null, error: { status: 500, value: 'Oops' } });
		expect(await loadDiscovery()).toEqual({ kind: 'failed', reason: 'error' });
	});

	it('reads the card preview, and a 404 as matching off', async () => {
		api.cardGet.mockResolvedValue({
			data: {
				card: { headline: null, experienceMonths: 0, roles: [], skills: [] },
				outcomes: ['pay', 'commute'],
				withheld: { headline: true, roles: [], skills: [] }
			},
			error: null
		});
		const preview = await loadCardPreview();
		expect(preview.kind).toBe('ready');
		// Never the commute beside a card, whatever the answer says
		expect(preview.kind === 'ready' && preview.preview.outcomes).toEqual(['pay']);
		api.cardGet.mockResolvedValue({ data: null, error: { status: 404, value: 'Not Found' } });
		expect(await loadCardPreview()).toEqual({ kind: 'off' });
	});
});

describe('what a change answered', () => {
	it('names the first requirement the opt-in misses', () => {
		const body = { type: 'validation', property: 'requirements.calendar', message: 'Connect…' };
		expect(discoveryFailure(422, body)).toEqual({ kind: 'requirement', requirement: 'calendar' });
	});

	it('says a page older than the terms in force in its own words, and keeps the API’s others', () => {
		expect(
			discoveryFailure(422, { property: 'consent.termsVersion', message: 'Older terms' })
		).toEqual({ kind: 'consent', message: legalMessages.staleTerms });
		expect(discoveryFailure(422, { property: 'consent', message: 'Tick the box' })).toEqual({
			kind: 'consent',
			message: 'Tick the box'
		});
	});

	it('shows a refused headline with the API’s words, on the field', () => {
		const message = 'Leave your name… out of your headline';
		expect(discoveryFailure(422, { property: 'card.headline', message })).toEqual({
			kind: 'headline',
			message
		});
		expect(
			discoveryFailure(422, { property: 'card.hiddenExperiences', message: 'Too many' })
		).toEqual({ kind: 'card', message: 'Too many' });
	});

	it('places a 429 on its Retry-After: when it can be turned on again', () => {
		const days = DISCOVERY_REJOIN_DAYS * 24 * 60 * 60;
		expect(
			discoveryFailure(429, 'Later', new Headers({ 'retry-after': String(days) }), NOW)
		).toEqual({ kind: 'wait', until: new Date(NOW.getTime() + days * 1000) });
		expect(discoveryFailure(429, 'Later', new Headers(), NOW)).toEqual({
			kind: 'wait',
			until: null
		});
	});

	it('reads a 404 as matching turned off, and a fetch that failed as no answer', () => {
		expect(discoveryFailure(404, 'Not Found')).toEqual({ kind: 'off' });
		expect(discoveryFailure(401, 'Unauthorized')).toEqual({ kind: 'session-expired' });
		expect(discoveryFailure(503, new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
		expect(discoveryFailure(500, 'Oops')).toEqual({ kind: 'error' });
		expect(discoveryFailure(422, { property: 'root' })).toEqual({ kind: 'error' });
	});

	it('sends the consent of the box, the card as set, and nothing to turn it off', async () => {
		api.consentPost.mockResolvedValue({ data: { ...OFF, state: 'on' }, error: null });
		expect(await turnDiscoveryOn()).toMatchObject({ ok: true, status: { state: 'on' } });
		expect(api.consentPost).toHaveBeenCalledWith(
			{ consent: { termsVersion: LEGAL_VERSION, adultConfirmed: true } },
			{ fetch: { credentials: 'include' } }
		);

		api.put.mockResolvedValue({ data: OFF, error: null });
		await saveDiscoveryCard({ headline: 'Backend engineer', hiddenExperiences: [EXPERIENCE_ID] });
		expect(api.put).toHaveBeenCalledWith(
			{ card: { headline: 'Backend engineer', hiddenExperiences: [EXPERIENCE_ID] } },
			{ fetch: { credentials: 'include' } }
		);

		api.consentDelete.mockResolvedValue({ data: OFF, error: null });
		expect(await turnDiscoveryOff()).toEqual({ ok: true, status: OFF });
		expect(api.consentDelete).toHaveBeenCalledWith(undefined, {
			fetch: { credentials: 'include' }
		});
	});

	it('reads the Retry-After of the response a refused opt-in came with', async () => {
		api.consentPost.mockResolvedValue({
			data: null,
			error: { status: 429, value: 'Later' },
			response: new Response('Later', { status: 429, headers: { 'retry-after': '3600' } })
		});
		const result = await turnDiscoveryOn();
		expect(result.ok).toBe(false);
		expect(!result.ok && result.failure.kind).toBe('wait');
		expect(!result.ok && result.failure.kind === 'wait' && result.failure.until).toBeInstanceOf(
			Date
		);
		api.consentPost.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await turnDiscoveryOn()).toEqual({ ok: false, failure: { kind: 'network' } });
	});
});

describe('where the candidate stands', () => {
	it('turns on from off, gives the consent again once it lapsed', () => {
		expect(consentAction(status(), NOW)).toBe('turn-on');
		expect(
			consentAction(status({ state: 'lapsed', enabledAt: '2024-11-01T00:00:00.000Z' }), NOW)
		).toBe('give-again');
	});

	it('confirms the consent again only in its last days', () => {
		// Given a month ago: in force for nearly two years, nothing to confirm
		const recent = status({ state: 'on', enabledAt: '2026-10-21T10:00:00.000Z' });
		expect(consentAction(recent, NOW)).toBeNull();
		expect(discoverySummary(recent, NOW)).toBe('on');
		// Lapses in two weeks: confirm it again, paused or not
		const ending = status({ state: 'on', enabledAt: '2024-12-05T10:00:00.000Z' });
		expect(consentAction(ending, NOW)).toBe('renew');
		expect(discoverySummary(ending, NOW)).toBe('renew');
		expect(consentAction({ ...ending, state: 'paused', missing: ['calendar'] }, NOW)).toBe('renew');
		expect(discoverySummary({ ...ending, state: 'paused', missing: ['calendar'] }, NOW)).toBe(
			'paused'
		);
	});

	it('counts a paused candidate as on: their card is withdrawn only by turning it off', () => {
		expect(discoveryOn(status({ state: 'on' }))).toBe(true);
		expect(discoveryOn(status({ state: 'paused' }))).toBe(true);
		expect(discoveryOn(status())).toBe(false);
		expect(discoveryOn(status({ state: 'lapsed' }))).toBe(false);
	});

	it('offers to turn it off on, paused, and once the consent ended (its answers still kept)', () => {
		expect(discoveryWithdrawable(status({ state: 'on' }))).toBe(true);
		expect(discoveryWithdrawable(status({ state: 'paused' }))).toBe(true);
		expect(discoveryWithdrawable(status({ state: 'lapsed' }))).toBe(true);
		expect(discoveryWithdrawable(status())).toBe(false);
	});

	it('says when discovery can be turned on again after a withdrawal', () => {
		expect(rejoinDate(NOW).getTime() - NOW.getTime()).toBe(
			DISCOVERY_REJOIN_DAYS * 24 * 60 * 60 * 1000
		);
	});

	it('leads each requirement to what fixes it', () => {
		expect(
			Object.fromEntries(DISCOVERY_REQUIREMENTS.map((r) => [r, requirementAction(r)]))
		).toEqual({
			portfolio: null,
			terms: 'account',
			criteria: 'criteria',
			pay: 'pay',
			journey: 'journey',
			calendar: 'appointments',
			schedule: 'appointments',
			active: null
		});
	});
});

describe('the gate’s steps', () => {
	const step = (id: string, type: string, config: object = {}): WorkflowStep => ({
		id,
		type,
		config
	});

	it('adds the job and its score before the meeting of the default journey', () => {
		const meeting = step('meeting', 'meeting');
		expect(missingGateSteps([meeting])).toEqual(['job', 'job-match']);
		const { steps, added, refused } = withGateSteps([meeting]);
		expect(steps.map((entry) => entry.type)).toEqual(['job', 'job-match', 'meeting']);
		expect(added.map((entry) => entry.type)).toEqual(['job', 'job-match']);
		expect(refused).toEqual([]);
		// The journey the owner then saves passes the API's rules, and is the gate
		expect(parseWorkflow(steps).ok).toBe(true);
	});

	it('adds the meeting last, after a note, then the job and its score before it', () => {
		const note = journeyTemplate('gate')[0];
		const { steps } = withGateSteps([note]);
		expect(steps.map((entry) => entry.type)).toEqual(['note', 'job', 'job-match', 'meeting']);
		expect(parseWorkflow(steps).ok).toBe(true);
	});

	it('adds only what is missing, and nothing to the gate', () => {
		const gate = journeyTemplate('gate');
		expect(missingGateSteps(gate)).toEqual([]);
		expect(withGateSteps(gate).added).toEqual([]);
		const withoutMatch = gate.filter((entry) => entry.type !== 'job-match');
		const { steps, added } = withGateSteps(withoutMatch);
		expect(added.map((entry) => entry.type)).toEqual(['job-match']);
		expect(steps.map((entry) => entry.type)).toEqual(['note', 'job', 'job-match', 'meeting']);
	});

	it('never reuses the id of a step saved: its progress would carry over', () => {
		const saved = [step('job', 'note')];
		const { added } = withGateSteps([step('meeting', 'meeting')], saved);
		expect(added.map((entry) => entry.id)).not.toContain('job');
	});

	it('refuses what a full journey cannot take', () => {
		const full = [
			...Array.from({ length: WORKFLOW_LIMITS.steps - 1 }, (_, index) =>
				step(`note-${index}`, 'note', { title: 'A', text: 'B' })
			),
			step('meeting', 'meeting')
		];
		const { added, refused } = withGateSteps(full);
		expect(added).toEqual([]);
		expect(refused).toEqual(['job', 'job-match']);
	});
});

describe('the card’s settings', () => {
	it('edits the settings saved, and sends a blank headline as none', () => {
		const card = { headline: 'Backend engineer', hiddenExperiences: [EXPERIENCE_ID] };
		const form = cardForm(card);
		expect(form).toEqual({ headline: 'Backend engineer', hidden: [EXPERIENCE_ID] });
		expect(cardChanged(form, card)).toBe(false);
		expect(cardSettings({ headline: '  ', hidden: [EXPERIENCE_ID, EXPERIENCE_ID] })).toEqual({
			headline: null,
			hiddenExperiences: [EXPERIENCE_ID]
		});
	});

	it('compares the headline as the API keeps it', () => {
		const card = { headline: 'Backend engineer', hiddenExperiences: [] };
		expect(cardChanged({ headline: '  Backend   engineer ', hidden: [] }, card)).toBe(false);
		expect(cardChanged({ headline: 'Data engineer', hidden: [] }, card)).toBe(true);
		expect(cardChanged({ headline: 'Backend engineer', hidden: [EXPERIENCE_ID] }, card)).toBe(true);
	});

	it('keeps changes not saved yet on top of settings saved meanwhile in another tab', () => {
		const A = '65e2e0000000000000000201';
		const B = '65e2e0000000000000000202';
		const C = '65e2e0000000000000000203';
		const base = { headline: 'Backend engineer', hiddenExperiences: [A] };
		// Another tab hid B (their current employer) and saved
		const saved = { headline: 'Backend engineer', hiddenExperiences: [A, B] };
		// This tab only edited the headline: B stays hidden, the headline stays theirs
		expect(rebaseCardForm({ headline: 'Data engineer', hidden: [A] }, base, saved)).toEqual({
			headline: 'Data engineer',
			hidden: [A, B]
		});
		// This tab showed A and hid C: both stay so, and B hidden elsewhere too
		expect(rebaseCardForm({ headline: 'Backend engineer', hidden: [C] }, base, saved)).toEqual({
			headline: 'Backend engineer',
			hidden: [B, C]
		});
		// A headline not edited here follows the one saved since
		expect(
			rebaseCardForm({ headline: 'Backend engineer', hidden: [A, C] }, base, {
				headline: 'Platform engineer',
				hiddenExperiences: [A]
			})
		).toEqual({ headline: 'Platform engineer', hidden: [A, C] });
	});

	it('says what portfolio-common’s rules refuse before anything is sent, in both languages', () => {
		expect(cardProblem({ headline: 'Backend engineer', hidden: [] })).toBeNull();
		const long = cardProblem({ headline: 'x'.repeat(DISCOVERY_LIMITS.headline + 1), hidden: [] });
		expect(long?.field).toBe('headline');
		expect(cardProblem({ headline: 'See janedoe.dev', hidden: [] })?.field).toBe('headline');
		const fr = withLocale('fr', () => cardProblem({ headline: 'jane@acme.fr', hidden: [] }));
		expect(fr?.message).toMatch(/accroche/);
	});

	it('lists every experience the card reads, the most recent first, with its company', () => {
		const experiences = [
			{
				_id: '65e2e0000000000000000201',
				title: 'Intern',
				company: { name: 'Acme' },
				start: '2018-01-01',
				end: '2018-06-01'
			},
			{
				_id: '65e2e0000000000000000202',
				title: ' Staff engineer ',
				company: { name: ' ' },
				start: '2022-01-01'
			},
			{ _id: 'not-an-id', title: 'Broken' }
		];
		expect(cardExperiences(experiences)).toEqual([
			{ id: '65e2e0000000000000000202', title: 'Staff engineer', company: null },
			{ id: '65e2e0000000000000000201', title: 'Intern', company: 'Acme' }
		]);
	});
});
