import { error } from '@sveltejs/kit';
import { isValidDomainName, normalizeDomainName } from 'portfolio-common';
import { portfolioTextApi } from '#services';
import { reviveExperienceDates } from '#services/experienceDates.ts';
import { isDomainNotFound } from '#services/apiErrors.ts';
import type { Domain, Experience } from 'portfolio-api/models/database';
import type { LayoutServerLoad } from './$types';
import { m } from './layout.messages.ts';

type DomainWithExperiences = Omit<Domain, 'experiences'> & {
	experiences: Experience[];
};

export const load: LayoutServerLoad = async ({ params }) => {
	// Path params arrive decoded: re-encode so a crafted segment ('a?x', 'a/../b') cannot
	// change the upstream API URL. Read as text: the title, the subtitle and every text of the
	// experiences come back as their owner wrote them, even one that looks like a date ('2027-01-01');
	// only the dates of the experiences and their projects are made Dates again
	const { data, error: apiError } = await portfolioTextApi
		.domain({ name: encodeURIComponent(params.domain) })
		.get();

	if (isDomainNotFound(apiError)) {
		// Only names that could actually be claimed get the claim flow; anything else
		// (scanner probes such as /wp-login.php, reserved words) is a plain 404
		if (isValidDomainName(params.domain)) {
			error(404, m.domainNotFound, {
				code: 'domainNotFound',
				domainName: normalizeDomainName(params.domain)
			});
		}
		error(404, m.notFound, { code: 'notFound' });
	}

	if (apiError || !data) {
		// API down, 5xx, network or configuration error (including a 404 that is not the API's
		// "Domain not found", e.g. a wrong PUBLIC_PORTFOLIO_API_URL): never offer to claim
		error(503, m.unavailable, { code: 'unavailable' });
	}

	return {
		domain: reviveExperienceDates(data as unknown as DomainWithExperiences),
		domainName: params.domain
	};
};
