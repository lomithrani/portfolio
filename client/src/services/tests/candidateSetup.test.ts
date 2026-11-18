import { describe, it, expect, vi } from 'vitest';
import {
	ADMIN_TABS,
	adminTab,
	copyText,
	defaultAdminTab,
	linkText,
	missingEssentials,
	portfolioLink,
	readReadiness,
	setupItems,
	setupProgress,
	termsProgress,
	type Readiness
} from '../candidateSetup';

/** A portfolio just claimed: nothing set up, on a site that takes Google Calendar connections */
const NEW: Readiness = {
	domain: 'jane.doe',
	experiences: 0,
	perfectJob: {
		criteria: 0,
		essentials: { pay: false, workMode: false, place: false, contractTypes: false }
	},
	journey: { saved: false, types: ['meeting'], blocked: false, gate: false, meeting: true },
	calendar: { configured: true, connected: false, reconnect: false, enabledSchedules: 0 }
};

/** Everything set up: experiences, the pay rated, the gate journey, a calendar to book in */
const READY: Readiness = {
	domain: 'jane.doe',
	experiences: 3,
	perfectJob: {
		criteria: 4,
		essentials: { pay: true, workMode: true, place: true, contractTypes: true }
	},
	journey: {
		saved: true,
		types: ['note', 'job', 'job-match', 'meeting'],
		blocked: false,
		gate: true,
		meeting: true
	},
	calendar: { configured: true, connected: true, reconnect: false, enabledSchedules: 1 }
};

const done = (readiness: Readiness) =>
	Object.fromEntries(setupItems(readiness).map((item) => [item.id, item.done]));

describe('reading GET /me/readiness', () => {
	it('reads what the API answers', () => {
		expect(readReadiness(structuredClone(READY))).toEqual(READY);
		expect(readReadiness(structuredClone(NEW))).toEqual(NEW);
	});

	it('reads a missing or mistyped field as not set, and refuses what is not an answer', () => {
		expect(readReadiness(null)).toBeNull();
		expect(readReadiness('ready')).toBeNull();
		expect(readReadiness([])).toBeNull();
		expect(
			readReadiness({
				domain: 42,
				experiences: -1,
				perfectJob: { criteria: 2.5, essentials: { pay: 'yes' } },
				journey: { saved: 1, types: ['note', 7, 'meeting'], blocked: 'yes' },
				calendar: 'connected'
			})
		).toEqual({
			domain: null,
			experiences: 0,
			perfectJob: {
				criteria: 0,
				essentials: { pay: false, workMode: false, place: false, contractTypes: false }
			},
			journey: {
				saved: false,
				types: ['note', 'meeting'],
				blocked: false,
				gate: false,
				meeting: false
			},
			calendar: { configured: false, connected: false, reconnect: false, enabledSchedules: 0 }
		});
	});
});

describe('the checklist', () => {
	it('lists its items in order, none done for a new portfolio', () => {
		expect(setupItems(NEW).map((item) => item.id)).toEqual([
			'resume',
			'perfectJob',
			'journey',
			'calendar'
		]);
		expect(done(NEW)).toEqual({
			resume: false,
			perfectJob: false,
			journey: false,
			calendar: false
		});
		expect(setupProgress(NEW)).toEqual({ done: 0, total: 4, complete: false });
		expect(setupProgress(READY)).toEqual({ done: 4, total: 4, complete: true });
	});

	it('counts the experiences once there is one', () => {
		expect(done({ ...NEW, experiences: 1 }).resume).toBe(true);
	});

	it('asks for the pay first, and suggests the other essentials', () => {
		const contracts = {
			...NEW,
			perfectJob: { criteria: 1, essentials: { ...NEW.perfectJob.essentials, contractTypes: true } }
		};
		expect(done(contracts).perfectJob).toBe(false);
		expect(missingEssentials(contracts)).toEqual(['pay', 'workMode', 'place']);

		const pay = {
			...NEW,
			perfectJob: { criteria: 1, essentials: { ...NEW.perfectJob.essentials, pay: true } }
		};
		expect(done(pay).perfectJob).toBe(true);
		expect(missingEssentials(pay)).toEqual(['workMode', 'place', 'contractTypes']);
		expect(missingEssentials(READY)).toEqual([]);
	});

	it('counts the journey once the owner chose one that leads to a meeting', () => {
		// The default journey (a meeting alone, never saved)
		expect(done(NEW).journey).toBe(false);
		// The meeting alone, chosen
		expect(done({ ...NEW, journey: { ...NEW.journey, saved: true } }).journey).toBe(true);
		expect(done({ ...NEW, journey: READY.journey }).journey).toBe(true);
		// Saved, but it leads nowhere a recruiter can book
		expect(
			done({
				...NEW,
				journey: { saved: true, types: ['note'], blocked: false, gate: false, meeting: false }
			}).journey
		).toBe(false);
		// A step before the meeting is not available anymore: recruiters never reach it
		expect(
			done({
				...NEW,
				journey: {
					saved: true,
					types: ['interview', 'meeting'],
					blocked: true,
					gate: false,
					meeting: false
				}
			}).journey
		).toBe(false);
	});

	it('counts the calendar once connected with a meeting type open', () => {
		const calendar = (changes: Partial<Readiness['calendar']>) =>
			done({ ...NEW, calendar: { ...READY.calendar, ...changes } }).calendar;
		expect(calendar({})).toBe(true);
		expect(calendar({ enabledSchedules: 0 })).toBe(false);
		expect(calendar({ connected: false })).toBe(false);
		expect(calendar({ connected: false, reconnect: true })).toBe(false);
	});

	it('leaves the calendar out on a site that takes no Google Calendar connection', () => {
		const site = { ...READY, calendar: { ...NEW.calendar, configured: false } };
		const calendar = setupItems(site).find((item) => item.id === 'calendar');
		expect(calendar).toEqual({ id: 'calendar', done: false, counted: false });
		expect(setupProgress(site)).toEqual({ done: 3, total: 3, complete: true });
		expect(termsProgress(site)).toEqual({ done: 2, total: 2, complete: true });
	});

	it('says how far the terms are, the experiences apart', () => {
		expect(termsProgress(NEW)).toEqual({ done: 0, total: 3, complete: false });
		expect(termsProgress({ ...READY, experiences: 0 })).toEqual({
			done: 3,
			total: 3,
			complete: true
		});
		expect(setupProgress({ ...READY, experiences: 0 })).toEqual({
			done: 3,
			total: 4,
			complete: false
		});
	});
});

describe('the admin page’s tabs', () => {
	it('reads the tab an address names, and nothing else', () => {
		for (const tab of ADMIN_TABS) expect(adminTab(tab)).toBe(tab);
		// The account menu's "Share your link" opens the Share tab
		expect(adminTab('share')).toBe('share');
		expect(adminTab('Start')).toBeUndefined();
		expect(adminTab('sharing')).toBeUndefined();
		expect(adminTab('')).toBeUndefined();
		expect(adminTab(null)).toBeUndefined();
		expect(adminTab(undefined)).toBeUndefined();
	});

	it('opens on "Get started" until the checklist is complete', () => {
		expect(defaultAdminTab(NEW)).toBe('start');
		expect(defaultAdminTab({ ...READY, experiences: 0 })).toBe('start');
		expect(defaultAdminTab(READY)).toBe('appearance');
		// Not read: the tab says why
		expect(defaultAdminTab(null)).toBe('start');
	});
});

describe('the link', () => {
	it('is the portfolio’s address on this site', () => {
		expect(portfolioLink('https://portfolio.example', 'jane.doe')).toBe(
			'https://portfolio.example/jane.doe'
		);
		expect(portfolioLink('http://localhost:4173/', 'e2e-owner')).toBe(
			'http://localhost:4173/e2e-owner'
		);
		expect(linkText('https://portfolio.example/jane.doe')).toBe('portfolio.example/jane.doe');
	});

	it('is copied, or says it could not be', async () => {
		const writeText = vi.fn(async () => {});
		expect(await copyText('https://portfolio.example/jane.doe', { writeText })).toBe(true);
		expect(writeText).toHaveBeenCalledWith('https://portfolio.example/jane.doe');

		const refused = vi.fn(async () => {
			throw new DOMException('Not allowed', 'NotAllowedError');
		});
		expect(await copyText('x', { writeText: refused })).toBe(false);
		expect(await copyText('x', undefined)).toBe(false);
	});
});
