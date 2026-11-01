import { defineEnvVars } from '@sveltejs/kit/env';
import { DEFAULT_GOOGLE_CLIENT_ID } from 'portfolio-common';

export const variables = defineEnvVars({
	PUBLIC_PORTFOLIO_API_URL: {
		public: true,
		description: 'Base URL of the Elysia API',
		schema: (value) => value?.trim() || 'http://localhost:3000'
	},
	PUBLIC_GOOGLE_CLIENT_ID: {
		public: true,
		description:
			'OAuth 2.0 client ID used by Google Sign-In (must match the API GOOGLE_CLIENT_ID audience)',
		schema: (value) => value?.trim() || DEFAULT_GOOGLE_CLIENT_ID
	}
});
