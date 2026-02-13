import { portfolioApi } from '$services/index';
import { redirect } from '@sveltejs/kit';
import type { Domain, Experience } from 'portfolio-api/models/database';

export async function load({ params }) {
  let { data, error } = await (portfolioApi.domain as any)[params.domain].get({
    fetch: { credentials: 'include' }
  });

  console.log('Domain recieved by Eden :', data);

  if (error || !data) {
    throw redirect(302, '/louis.gentil/experiences');
  }

  return {
    domain: data as Omit<Domain, "experiences"> & {
      experiences: Experience[];
    }
  };
}