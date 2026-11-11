import { treaty } from '@elysiajs/eden';
import type { Portfolio } from 'portfolio-api';
import { propagation, context } from '@opentelemetry/api';

import { PUBLIC_PORTFOLIO_API_URL } from '$app/env/public';

// Wrap fetch to propagate W3C Trace Context (traceparent header) to the API.
// This links SvelteKit SSR spans with Elysia server spans in the same trace.
const tracedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
	const baseHeaders = input instanceof Request ? input.headers : undefined;
	const headers = new Headers(baseHeaders ?? init?.headers);
	propagation.inject(context.active(), headers, {
		set: (carrier, key, value) => carrier.set(key, value)
	});
	return fetch(input, { ...init, headers });
};

const api = treaty<Portfolio>(PUBLIC_PORTFOLIO_API_URL, {
	fetcher: tracedFetch as typeof fetch
});

/**
 * The same API, with every string left as it is. Eden Treaty turns each JSON string that looks
 * like a date into a Date: for routes whose answers hold text people wrote (a note titled
 * "2027-01-01" in a hiring journey), which must come back as written
 */
const textApi = treaty<Portfolio>(PUBLIC_PORTFOLIO_API_URL, {
	fetcher: tracedFetch as typeof fetch,
	parseDate: false
});

export { api, textApi };
