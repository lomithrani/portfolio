import type { Writable } from 'svelte/store';
import { ExperienceType } from 'portfolio-common';
import type { portfolioApi } from '$services';
import { persisted } from 'svelte-persisted-store';

type ApiData = Parameters<typeof portfolioApi.experiences.post>[0];

type FormProject = Omit<ApiData['projects'][number], 'hardSkills' | 'softSkills' | 'start' | 'end'> & {
  hardSkills: string[];
  softSkills: string[];
  start: string;
  end: string;
};

// Form Data
type FormData = Omit<ApiData, 'projects' | '$fetch'> & {
  projects: FormProject[];
};


const defaultExperience: FormData = {
  title: '',
  summary: '',
  company: { name: '' },
  type: ExperienceType.Professional,
  icon: undefined,
  projects: [],
}

export type { FormData }
export const newExperienceDataStore: Writable<FormData> = persisted<FormData>('newExperience', defaultExperience)