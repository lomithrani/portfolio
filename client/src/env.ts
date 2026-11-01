import { defineEnvVars } from '@sveltejs/kit/env';
import { DEFAULT_GOOGLE_CLIENT_ID } from 'portfolio-common';

const DEFAULT_API_URL = 'http://localhost:3000';
// SvelteKit validates the environment more than once at startup: warn once
let warnedAboutApiUrl = false;

export const variables = defineEnvVars({
	PUBLIC_PORTFOLIO_API_URL: {
		public: true,
		description: 'Base URL of the Elysia API',
		schema: (value) => {
			const url = value?.trim();
			if (url) return url;
			// The default only suits local development: in production every browser would call
			// (and send Google ID tokens to) its own localhost
			if (import.meta.env.PROD && !warnedAboutApiUrl) {
				warnedAboutApiUrl = true;
				console.warn(
					`PUBLIC_PORTFOLIO_API_URL is not set: falling back to ${DEFAULT_API_URL}, which only works in local development`
				);
			}
			return DEFAULT_API_URL;
		}
	},
	PUBLIC_GOOGLE_CLIENT_ID: {
		public: true,
		description:
			'OAuth 2.0 client ID used by Google Sign-In (must match the API GOOGLE_CLIENT_ID audience)',
		schema: (value) => value?.trim() || DEFAULT_GOOGLE_CLIENT_ID
	}
});
