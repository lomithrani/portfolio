import { portfolioApi } from '$services/index';
import { redirect } from '@sveltejs/kit';

export async function load({ params }) {
  let { data, error } = await portfolioApi.domain[params.domain].get({
    $fetch: { credentials: 'include' }
  });

  if (error) {
    throw redirect(302, '/louis.gentil/experiences');
  }

  return {
    domain: data
  };
}