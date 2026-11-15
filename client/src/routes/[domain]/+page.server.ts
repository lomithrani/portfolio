import { redirect } from '@sveltejs/kit';
import { LOCALE_PARAM, parseLocale } from 'portfolio-common';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
	// A language the address asks for (`?lang=fr`, e.g. a shared French link) is kept
	const asked = parseLocale(url.searchParams.get(LOCALE_PARAM));
	const query = asked ? `?${new URLSearchParams({ [LOCALE_PARAM]: asked })}` : '';
	redirect(302, `/${encodeURIComponent(params.domain)}/experiences${query}`);
};
