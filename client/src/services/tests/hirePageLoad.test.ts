import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('#services', () => {
	const get = vi.fn();
	// The text client: a note titled "2027-01-01" stays text
	return { portfolioTextApi: { workflow: { domains: vi.fn(() => ({ get })) } } };
});

import { portfolioTextApi } from '#services';
import { load } from '../../routes/[domain]/hire/+page.server';

const mockDomains = portfolioTextApi.workflow.domains as unknown as Mock;
const mockGet = portfolioTextApi.workflow.domains({ domainName: '' }).get as unknown as Mock;

type LoadEvent = Parameters<typeof load>[0];
const runLoad = (domain: string) => load({ params: { domain } } as unknown as LoadEvent);

beforeEach(() => {
	vi.clearAllMocks();
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
			}
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
		await expect(runLoad('jane.doe')).resolves.toEqual({ journey: null });

		mockGet.mockResolvedValueOnce({ data: { steps: 'meeting' }, error: null });
		await expect(runLoad('jane.doe')).resolves.toEqual({ journey: null });

		mockGet.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
		await expect(runLoad('jane.doe')).resolves.toEqual({ journey: null });
	});
});
