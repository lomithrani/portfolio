import { getLocale } from 'portfolio-common';
import type { RequestHandler } from './$types';
import { m } from './server.messages.ts';

// The job board that was here is gone for good: job descriptions are no longer published, a
// recruiter shows one to a candidate by picking it on their Hire page. 410 tells search engines to
// drop the address (and its old links), and a person who follows one reads why, in their language.
// Without this route, /jobs would be taken for a portfolio named "jobs" (a reserved name).
export const GET: RequestHandler = () =>
	new Response(m.gone, {
		status: 410,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'content-language': getLocale(),
			// The same address is answered in the visitor's language (hooks.server.ts)
			vary: 'Accept-Language, Cookie'
		}
	});
