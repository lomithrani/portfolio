// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			// Set on 404s for unclaimed domains so the error page can offer the claim flow
			domainName?: string;
			/**
			 * Which of the app's errors this is: the error page reads its sentence in the browser,
			 * in the page's language (a data request can be answered in another one, see
			 * hooks.server.ts), rather than show the text the server chose
			 */
			code?: 'domainNotFound' | 'notFound' | 'unavailable' | 'jobNotFound' | 'jobsUnavailable';
		}
		interface Locals {
			/** The language of the request (hooks.server.ts) */
			locale: import('portfolio-common').Locale;
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
