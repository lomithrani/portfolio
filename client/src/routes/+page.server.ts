import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, params }) => {
  console.log(params);
  throw redirect(302, '/louis.gentil/experiences');
}
