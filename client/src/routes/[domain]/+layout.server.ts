import { error } from '@sveltejs/kit';
import { portfolioApi } from '$services/index';
import type { Domain, Experience } from 'portfolio-api/models/database';

export async function load({ params }) {
  const { data, error: apiError } = await portfolioApi.domain({ name: params.domain }).get({
    fetch: { credentials: 'include' }
  });

  if (apiError || !data) {
    error(404, { message: 'Domain not found', domainName: params.domain });
  }

  return {
    domain: data as Omit<Domain, "experiences"> & {
      experiences: Experience[];
    },
    domainName: params.domain
  };
}
