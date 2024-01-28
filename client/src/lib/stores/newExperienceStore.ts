import { writable } from 'svelte/store';
import { ExperienceType } from 'portfolio-common';
import type { portfolioApi } from '$services';

const defaultExperience: Parameters<typeof portfolioApi.experiences.post>[0] = {
  title: '',
  summary: '',
  type: ExperienceType.Professional,
  projects: [],
  $fetch: { credentials: 'include' }
}

export const newExperienceDataStore = writable<Parameters<typeof portfolioApi.experiences.post>[0]>(defaultExperience);