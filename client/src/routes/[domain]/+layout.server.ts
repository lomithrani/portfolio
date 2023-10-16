import { portfolioApi } from '$services/index';

export async function load({ params }) {
  let { data, error } = await portfolioApi.domain[params.domain].get({
    $fetch: { credentials: 'include' }
  });

  if (error) {
    throw error;
  }

  return {
    domain: data
  };
}