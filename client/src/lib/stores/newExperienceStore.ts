import type { Writable } from 'svelte/store';
import { persisted } from 'svelte-persisted-store';
import { emptyExperienceForm, type FormData } from '#services/experienceForm.ts';

export type { FormData };

// Draft of the experience being *added* (never of one being edited), kept across reloads
export const newExperienceDataStore: Writable<FormData> = persisted<FormData>(
	'newExperience',
	emptyExperienceForm()
);

export const resetNewExperienceDraft = () => newExperienceDataStore.set(emptyExperienceForm());
