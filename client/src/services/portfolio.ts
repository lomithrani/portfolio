import { treaty } from '@elysiajs/eden'
import type { Portfolio } from 'portfolio-api'
import { propagation, context } from '@opentelemetry/api'

import { env } from '$env/dynamic/public'

// Wrap fetch to propagate W3C Trace Context (traceparent header) to the API.
// This links SvelteKit SSR spans with Elysia server spans in the same trace.
const tracedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
	const baseHeaders = input instanceof Request ? input.headers : undefined
	const headers = new Headers(baseHeaders ?? init?.headers)
	propagation.inject(context.active(), headers, {
		set: (carrier, key, value) => carrier.set(key, value)
	})
	return fetch(input, { ...init, headers })
}

const api = treaty<Portfolio>(env.PUBLIC_PORTFOLIO_API_URL, {
	fetcher: tracedFetch as typeof fetch
})

export { api }
