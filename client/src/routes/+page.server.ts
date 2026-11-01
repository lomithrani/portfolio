import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// There is no landing page yet: send visitors to the owner's portfolio
const DEFAULT_DOMAIN = 'louis.gentil';

export const load: PageServerLoad = () => {
	redirect(302, `/${DEFAULT_DOMAIN}/experiences`);
};
