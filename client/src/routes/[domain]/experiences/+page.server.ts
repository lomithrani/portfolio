import { portfolioApi } from '$services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const experiences = await portfolioApi.experiences.get({
    $fetch: { credentials: 'include' }
  });
  return {
    experiences: experiences.data
  };
};