import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('#services', () => {
	const get = vi.fn();
	const schedulesGet = vi.fn();
	// The text client: a note titled "2027-01-01" stays text
	return {
		portfolioTextApi: {
			workflow: { domains: vi.fn(() => ({ get })) },
			appointments: { domains: vi.fn(() => ({ schedules: { get: schedulesGet } })) }
		}
	};
});

import { portfolioTextApi } from '#services';
import { load } from '../../routes/[domain]/hire/+page.server';

const mockDomains = portfolioTextApi.workflow.domains as unknown as Mock;
const mockGet = portfolioTextApi.workflow.domains({ domainName: '' }).get as unknown as Mock;
const mockScheduleDomains = portfolioTextApi.appointments.domains as unknown as Mock;
const mockSchedules = portfolioTextApi.appointments.domains({ domainName: '' }).schedules
	.get as unknown as Mock;

type LoadEvent = Parameters<typeof load>[0];
const runLoad = (domain: string, { isDataRequest = false } = {}) =>
	load({ params: { domain }, isDataRequest } as unknown as LoadEvent);

/** A meeting type as GET /appointments/domains/:domainName/schedules lists it */
const PHONE_CALL = {
	id: 'a'.repeat(24),
	title: 'Phone screen',
	locationType: 'phone',
	locationDetails: '+33 1 23 45 67 89',
	availability: []
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGet.mockResolvedValue({ data: { steps: [] }, error: null });
	mockSchedules.mockResolvedValue({ data: [], error: null });
});

// The page for recruiters is rendered on the server from the journey as anyone signed out stands
// in it; the browser loads it (again, with the session) in every case
describe('[domain]/hire page load', () => {
	it('returns the journey as anyone signed out gets it, the address name encoded', async () => {
		mockGet.mockResolvedValue({
			data: {
				steps: [
					{ id: 'note', type: 'note', status: 'pending', config: { title: '2027-01-01' } },
					{ id: 'meeting', type: 'meeting', status: 'pending', view: { booked: true } }
				],
				own: true
			},
			error: null
		});

		await expect(runLoad('jane.doe')).resolves.toEqual({
			journey: {
				steps: [
					{ id: 'note', type: 'note', status: 'pending', config: { title: '2027-01-01' } },
					{ id: 'meeting', type: 'meeting', status: 'pending' }
				]
			},
			bookable: false
		});
		expect(mockDomains).toHaveBeenCalledWith({ domainName: 'jane.doe' });
		// Without the session (the web server has none) and without waiting forever
		const [options] = mockGet.mock.calls[0];
		expect(options.fetch.credentials).toBeUndefined();
		expect(options.fetch.signal).toBeInstanceOf(AbortSignal);

		await runLoad('a?x');
		expect(mockDomains).toHaveBeenLastCalledWith({ domainName: 'a%3Fx' });
	});

	it('leaves the journey to the browser when the API does not give one', async () => {
		mockGet.mockResolvedValueOnce({ data: null, error: { status: 503, value: 'Unavailable' } });
		await expect(runLoad('jane.doe')).resolves.toEqual({ journey: null, bookable: false });

		mockGet.mockResolvedValueOnce({ data: { steps: 'meeting' }, error: null });
		await expect(runLoad('jane.doe')).resolves.toEqual({ journey: null, bookable: false });

		mockGet.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
		await expect(runLoad('jane.doe')).resolves.toEqual({ journey: null, bookable: false });
	});

	it('says whether a meeting can be booked, never which meeting types the owner has', async () => {
		mockSchedules.mockResolvedValueOnce({ data: [PHONE_CALL], error: null });
		const loaded = await runLoad('jane.doe');
		expect(loaded).toEqual({ journey: { steps: [] }, bookable: true });
		// A phone call's carries the owner's number: only the boolean reaches the page
		expect(JSON.stringify(loaded)).not.toContain('+33');
		expect(mockScheduleDomains).toHaveBeenCalledWith({ domainName: 'jane.doe' });
		// Anonymous, and within the same wait as the journey
		const [options] = mockSchedules.mock.calls[0];
		expect(options.fetch.credentials).toBeUndefined();
		expect(options.fetch.signal).toBe(mockGet.mock.calls[0][0].fetch.signal);

		// Not known: the page asks again in the browser
		mockSchedules.mockResolvedValueOnce({ data: null, error: { status: 503, value: 'Down' } });
		await expect(runLoad('jane.doe')).resolves.toMatchObject({ bookable: null });
		mockSchedules.mockRejectedValueOnce(new DOMException('Timed out.', 'TimeoutError'));
		await expect(runLoad('jane.doe')).resolves.toMatchObject({ bookable: null });
	});

	it('asks nothing on a navigation in the browser, which loads the journey itself', async () => {
		// A link, a preload on hover, the way back from the job editor: SvelteKit's data request
		await expect(runLoad('jane.doe', { isDataRequest: true })).resolves.toEqual({
			journey: null,
			bookable: null
		});
		expect(mockGet).not.toHaveBeenCalled();
		expect(mockSchedules).not.toHaveBeenCalled();
	});
});
