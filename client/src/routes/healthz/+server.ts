import type { RequestHandler } from './$types';

// Liveness probe of the web service (Railway healthcheck path). It must not call the API: the
// API has its own /health check, and an API outage must not get the web service restarted.
export const GET: RequestHandler = () =>
	new Response('ok', {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
