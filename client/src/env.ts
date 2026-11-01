import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_PORTFOLIO_API_URL: {
		public: true,
		description: 'Base URL of the Elysia API',
		schema: (value) => value || 'http://localhost:3000'
	}
});
