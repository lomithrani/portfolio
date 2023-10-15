import { portfolioApi } from '$services/index';
import type { LayoutServerLoad } from './$types';
import { setContext } from 'svelte';

export const load: LayoutServerLoad = async ({ params }) => {

  const { data, error } = await portfolioApi.domain[params.domain].get({
    $fetch: { credentials: 'include' }
  });

  if (error) {
    throw error;
  }

  setContext('domain', data);

};