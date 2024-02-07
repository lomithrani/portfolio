import type { Writable } from 'svelte/store';
import { ExperienceType } from 'portfolio-common';
import type { portfolioApi } from '$services';
import { localStorageStore } from '@skeletonlabs/skeleton';

const defaultExperience: Parameters<typeof portfolioApi.experiences.post>[0] = {
  title: '',
  summary: '',
  type: ExperienceType.Professional,
  projects: [],
  $fetch: { credentials: 'include' }
}

export const newExperienceDataStore: Writable<Parameters<typeof portfolioApi.experiences.post>[0]> = localStorageStore<Parameters<typeof portfolioApi.experiences.post>[0]>('newExperience', defaultExperience);