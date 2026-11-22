import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// startNotifications (services/notifications.ts) with the API answered here: a first read that got
// no usable answer is asked again 5 s, then 30 s later, never again once matching answered, and
// nothing is asked once its cleanup ran (signed out, the header gone)

// vi.mock factories are hoisted: they cannot reference outer variables (but vi.hoisted ones)
const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('#services', () => ({
	portfolioTextApi: { me: { notifications: { get: api.get } } }
}));

import {
	NOTIFICATIONS_RETRY_MS,
	initialNotifications,
	notificationsStore,
	resetNotifications,
	startNotifications
} from '../notifications';

/** No usable answer: a 503 */
const failure = { data: null, error: { status: 503, value: '' } };
const counts = { data: { mutualInterests: { candidate: 1, recruiter: 0 } }, error: null };
const off = { data: null, error: { status: 404, value: 'NOT_FOUND' } };

const [first, second] = NOTIFICATIONS_RETRY_MS;
// Each test signs in as an account of its own (the counts are kept per account)
let account = 0;
const nextAccount = () => `user-${++account}`;

beforeEach(() => {
	vi.useFakeTimers();
	// Vitest runs in node here: no DOM, the page's visibility answered
	vi.stubGlobal('document', {
		visibilityState: 'visible',
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	});
	api.get.mockReset();
	resetNotifications();
	notificationsStore.set(initialNotifications);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('startNotifications', () => {
	it('asks again after a first read with no usable answer: 5 s, then 30 s, then stops', async () => {
		api.get.mockResolvedValue(failure);
		const stop = startNotifications(nextAccount());
		await vi.advanceTimersByTimeAsync(0);
		expect(api.get).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(first - 1);
		expect(api.get).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(api.get).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(second);
		expect(api.get).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(10 * second);
		expect(api.get).toHaveBeenCalledTimes(3);
		expect(get(notificationsStore).matching).toBe('unknown');
		stop();
	});

	it('stops once matching answered', async () => {
		api.get.mockResolvedValueOnce(failure).mockResolvedValue(counts);
		const stop = startNotifications(nextAccount());
		await vi.advanceTimersByTimeAsync(first);
		expect(api.get).toHaveBeenCalledTimes(2);
		expect(get(notificationsStore)).toEqual({
			matching: 'on',
			unseen: { candidate: 1, recruiter: 0 }
		});
		await vi.advanceTimersByTimeAsync(10 * second);
		expect(api.get).toHaveBeenCalledTimes(2);
		stop();
	});

	it('asks nothing more once its cleanup ran, a retry waiting', async () => {
		api.get.mockResolvedValue(failure);
		const stop = startNotifications(nextAccount());
		await vi.advanceTimersByTimeAsync(0);
		expect(api.get).toHaveBeenCalledTimes(1);
		stop();
		await vi.advanceTimersByTimeAsync(10 * second);
		expect(api.get).toHaveBeenCalledTimes(1);
	});

	it('asks nothing more once its cleanup ran while the first read was on its way', async () => {
		let answer: (value: unknown) => void = () => {};
		api.get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		api.get.mockResolvedValue(failure);
		const stop = startNotifications(nextAccount());
		await vi.advanceTimersByTimeAsync(0);
		stop();
		answer(failure);
		await vi.advanceTimersByTimeAsync(10 * second);
		expect(api.get).toHaveBeenCalledTimes(1);
	});

	it('never asks again once the API said matching is off, not even for the next page', async () => {
		api.get.mockResolvedValue(off);
		const user = nextAccount();
		const stop = startNotifications(user);
		await vi.advanceTimersByTimeAsync(10 * second);
		expect(api.get).toHaveBeenCalledTimes(1);
		expect(get(notificationsStore).matching).toBe('off');
		stop();
		startNotifications(user)();
		await vi.advanceTimersByTimeAsync(10 * second);
		expect(api.get).toHaveBeenCalledTimes(1);
	});
});
