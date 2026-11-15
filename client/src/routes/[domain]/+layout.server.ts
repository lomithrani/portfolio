import { error } from '@sveltejs/kit';
import { isValidDomainName, normalizeDomainName } from 'portfolio-common';
import { portfolioApi } from '#services';
import { isDomainNotFound } from '#services/apiErrors.ts';
import type { Domain, Experience } from 'portfolio-api/models/database';
import type { LayoutServerLoad } from './$types';
import { m } from './layout.messages.ts';

type DomainWithExperiences = Omit<Domain, 'experiences'> & {
	experiences: Experience[];
};

export const load: LayoutServerLoad = async ({ params }) => {
	// Path params arrive decoded: re-encode so a crafted segment ('a?x', 'a/../b') cannot
	// change the upstream API URL
	const { data, error: apiError } = await portfolioApi
		.domain({ name: encodeURIComponent(params.domain) })
		.get();

	if (isDomainNotFound(apiError)) {
		// Only names that could actually be claimed get the claim flow; anything else
		// (scanner probes such as /wp-login.php, reserved words) is a plain 404
		if (isValidDomainName(params.domain)) {
			error(404, m.domainNotFound, { domainName: normalizeDomainName(params.domain) });
		}
		error(404, m.notFound);
	}

	if (apiError || !data) {
		// API down, 5xx, network or configuration error (including a 404 that is not the API's
		// "Domain not found", e.g. a wrong PUBLIC_PORTFOLIO_API_URL): never offer to claim
		error(503, m.unavailable);
	}

	return {
		domain: data as unknown as DomainWithExperiences,
		domainName: params.domain
	};
};
