import { portfolioApi } from '$services/index';
import type { Domain, Experience } from 'portfolio-api/models/database';

export async function load({ params }) {
  let { data, error } = await portfolioApi.domain({ name: params.domain }).get({
    fetch: { credentials: 'include' }
  });

  if (error || !data) {
    return {
      domain: null,
      domainName: params.domain
    };
  }

  return {
    domain: data as Omit<Domain, "experiences"> & {
      experiences: Experience[];
    },
    domainName: params.domain
  };
}
