import { portfolioApi } from '$services';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  const experiences = await portfolioApi.experiences.get({
    $fetch: { credentials: 'include' }
  });
  return {
    experiences: experiences.data
  };
};