import { error } from '@sveltejs/kit';
import { isValidDomainName, normalizeDomainName } from 'portfolio-common';
import { portfolioApi } from '$services/index';
import { errorStatus } from '$services/apiErrors';
import type { Domain, Experience } from 'portfolio-api/models/database';
import type { LayoutServerLoad } from './$types';

type DomainWithExperiences = Omit<Domain, 'experiences'> & {
	experiences: Experience[];
};

export const load: LayoutServerLoad = async ({ params }) => {
	// Path params arrive decoded: re-encode so a crafted segment ('a?x', 'a/../b') cannot
	// change the upstream API URL
	const { data, error: apiError } = await portfolioApi
		.domain({ name: encodeURIComponent(params.domain) })
		.get();

	if (errorStatus(apiError) === 404) {
		// Only names that could actually be claimed get the claim flow; anything else
		// (scanner probes such as /wp-login.php, reserved words) is a plain 404
		if (isValidDomainName(params.domain)) {
			error(404, 'Domain not found', { domainName: normalizeDomainName(params.domain) });
		}
		error(404, 'Not found');
	}

	if (apiError || !data) {
		// API down, 5xx, network or configuration error: never offer to claim the domain
		error(503, 'The portfolio service is temporarily unavailable. Please retry shortly.');
	}

	return {
		domain: data as unknown as DomainWithExperiences,
		domainName: params.domain
	};
};
