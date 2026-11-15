import { defineMessages } from 'portfolio-common';

// What the error page shows when a portfolio cannot be loaded (+layout.server.ts)
export const m = defineMessages({
	/** No portfolio has this name, which could be claimed (the error page offers to claim it) */
	domainNotFound: { en: 'Domain not found', fr: 'Portfolio introuvable' },
	/** Nothing at this address, and no name anyone could claim */
	notFound: { en: 'Not found', fr: 'Page introuvable' },
	/** The API did not answer, or not with a portfolio */
	unavailable: {
		en: 'Portfolio is temporarily unavailable. Please retry shortly.',
		fr: 'Portfolio est temporairement indisponible. Réessayez dans un instant.'
	}
});
