// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			// Set on 404s for unclaimed domains so the error page can offer the claim flow
			domainName?: string;
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
