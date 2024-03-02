import type { Writable } from 'svelte/store';
import { ExperienceType } from 'portfolio-common';
import type { portfolioApi } from '$services';
import { localStorageStore } from '@skeletonlabs/skeleton';

type ApiData = Parameters<typeof portfolioApi.experiences.post>[0];

type FormProject = Omit<ApiData['projects'][number], 'hardSkills' | 'softSkills'> & {
  hardSkills: string[];
  softSkills: string[];
};

// Form Data
type FormData = Omit<ApiData, 'projects'> & {
  projects: FormProject[];
};


const defaultExperience: FormData = {
  title: '',
  summary: '',
  type: ExperienceType.Professional,
  projects: [],
  $fetch: { credentials: 'include' }
}

export type { FormData }
export const newExperienceDataStore: Writable<FormData> = localStorageStore<FormData>('newExperience', defaultExperience)