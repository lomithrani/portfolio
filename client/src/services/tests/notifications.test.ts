import { describe, expect, it } from 'vitest';
import { withLocale } from 'portfolio-common';
import {
	NOTIFICATIONS_RETRY_MS,
	initialNotifications,
	nextNotifications,
	notificationsAnswer,
	notificationsRetryDelay,
	notificationsWanted,
	unseenBadgeText,
	unseenLabel,
	type NotificationsState
} from '../notifications';
import { m as menu } from '#components/AccountMenu.messages.ts';

// What matching brought that the account has not seen (GET /me/notifications): the account menu's
// badge, and whether matching is available at all (its 404: nothing of it shows)

describe('notificationsAnswer', () => {
	it('reads the counts of each side, a count that is not one being none', () => {
		expect(notificationsAnswer(null, { mutualInterests: { candidate: 2, recruiter: 1 } })).toEqual({
			kind: 'counts',
			unseen: { candidate: 2, recruiter: 1 }
		});
		expect(
			notificationsAnswer(null, { mutualInterests: { candidate: -1, recruiter: 'two' } })
		).toEqual({ kind: 'counts', unseen: { candidate: 0, recruiter: 0 } });
		expect(notificationsAnswer(null, { other: true })).toEqual({
			kind: 'counts',
			unseen: { candidate: 0, recruiter: 0 }
		});
	});

	it('takes the 404 of a route that does not exist for matching off', () => {
		expect(notificationsAnswer({ status: 404, value: 'NOT_FOUND' }, null)).toEqual({ kind: 'off' });
	});

	it('takes a 401 for matching on, signed out', () => {
		expect(notificationsAnswer({ status: 401, value: 'Unauthorized' }, null)).toEqual({
			kind: 'signed-out'
		});
	});

	it('keeps nothing of another failure, nor of an answer that is not one', () => {
		expect(notificationsAnswer({ status: 500, value: 'oops' }, null)).toEqual({ kind: 'failed' });
		expect(
			notificationsAnswer({ status: 503, value: new TypeError('Failed to fetch') }, null)
		).toEqual({ kind: 'failed' });
		expect(notificationsAnswer(null, 'not json')).toEqual({ kind: 'failed' });
		expect(notificationsAnswer(null, null)).toEqual({ kind: 'failed' });
	});
});

describe('notificationsRetryDelay', () => {
	it('asks again a little later, twice, while a first read got nothing usable', () => {
		// Until it answers, nothing of matching shows: a page left in view would never ask again
		expect(notificationsRetryDelay(initialNotifications, 'failed', 0)).toBe(
			NOTIFICATIONS_RETRY_MS[0]
		);
		expect(notificationsRetryDelay(initialNotifications, 'failed', 1)).toBe(
			NOTIFICATIONS_RETRY_MS[1]
		);
		expect(notificationsRetryDelay(initialNotifications, 'failed', 2)).toBeNull();
	});

	it('never once an answer said whether matching is available, nor for a read dropped', () => {
		const on: NotificationsState = { matching: 'on', unseen: { candidate: 0, recruiter: 0 } };
		const off: NotificationsState = { matching: 'off', unseen: { candidate: 0, recruiter: 0 } };
		expect(notificationsRetryDelay(on, 'failed', 0)).toBeNull();
		expect(notificationsRetryDelay(off, 'off', 0)).toBeNull();
		expect(notificationsRetryDelay(on, 'counts', 0)).toBeNull();
		expect(notificationsRetryDelay(initialNotifications, null, 0)).toBeNull();
	});
});

describe('notificationsWanted', () => {
	it('asks while matching answers or before it did, never again once it was found off', () => {
		expect(notificationsWanted(initialNotifications)).toBe(true);
		expect(notificationsWanted({ matching: 'on', unseen: { candidate: 1, recruiter: 0 } })).toBe(
			true
		);
		// Each read would be one more 404 of a route that does not exist, on every page
		expect(notificationsWanted({ matching: 'off', unseen: { candidate: 0, recruiter: 0 } })).toBe(
			false
		);
	});
});

describe('nextNotifications', () => {
	const known: NotificationsState = { matching: 'on', unseen: { candidate: 3, recruiter: 1 } };

	it('starts unknown, with nothing unseen: nothing of matching shows before an answer', () => {
		expect(initialNotifications).toEqual({
			matching: 'unknown',
			unseen: { candidate: 0, recruiter: 0 }
		});
	});

	it('follows each answer', () => {
		expect(
			nextNotifications(initialNotifications, {
				kind: 'counts',
				unseen: { candidate: 1, recruiter: 0 }
			})
		).toEqual({ matching: 'on', unseen: { candidate: 1, recruiter: 0 } });
		expect(nextNotifications(known, { kind: 'off' })).toEqual({
			matching: 'off',
			unseen: { candidate: 0, recruiter: 0 }
		});
		expect(nextNotifications(known, { kind: 'signed-out' })).toEqual({
			matching: 'on',
			unseen: { candidate: 0, recruiter: 0 }
		});
	});

	it('keeps what was known when a read failed', () => {
		expect(nextNotifications(known, { kind: 'failed' })).toBe(known);
		expect(nextNotifications(initialNotifications, { kind: 'failed' })).toBe(initialNotifications);
	});
});

describe('the texts of the badge', () => {
	it('count the mutual interests not seen, in both languages, never a bare "match"', () => {
		expect(unseenBadgeText(1)).toBe('1 new');
		expect(unseenLabel(1)).toBe('1 new mutual interest');
		expect(unseenLabel(3)).toBe('3 new mutual interests');
		withLocale('fr', () => {
			expect(unseenBadgeText(1)).toBe('1 nouveau');
			expect(unseenBadgeText(2)).toBe('2 nouveaux');
			expect(unseenLabel(1)).toBe('1 nouvel intérêt réciproque');
			expect(unseenLabel(2)).toBe('2 nouveaux intérêts réciproques');
		});
		for (const text of [unseenLabel(1), unseenLabel(4)]) expect(text).not.toMatch(/\bmatch/i);
	});

	it('are said in the account menu trigger’s name, only while some are not seen', () => {
		expect(menu.trigger.candidate('Mia Match', 0)).toBe('Account menu: Mia Match, Candidate space');
		expect(menu.trigger.candidate('Mia Match', 2)).toBe(
			'Account menu: Mia Match, Candidate space, 2 new mutual interests'
		);
		expect(menu.trigger.none('Mia', 1)).toBe('Account menu: Mia, 1 new mutual interest');
		expect(withLocale('fr', () => menu.trigger.recruiter('Mia', 1))).toBe(
			'Menu du compte : Mia, espace recruteur, 1 nouvel intérêt réciproque'
		);
	});
});
