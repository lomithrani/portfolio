import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	redirect(302, `/${encodeURIComponent(params.domain)}/experiences`);
};
