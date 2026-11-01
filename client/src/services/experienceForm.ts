import { ExperienceType } from 'portfolio-common';
import type { Experience, Skill } from 'portfolio-api/models/database';
import type { portfolioApi } from '$services';

// Body of POST /experiences and PUT /experiences/:id
export type ExperienceRequest = Parameters<typeof portfolioApi.experiences.post>[0];

export type FormProject = Omit<
	ExperienceRequest['projects'][number],
	'hardSkills' | 'softSkills' | 'start' | 'end'
> & {
	hardSkills: string[];
	softSkills: string[];
	// yyyy-mm-dd, as bound to <input type="date">
	start: string;
	end: string;
};

export type FormData = Omit<ExperienceRequest, 'projects' | '$fetch'> & {
	projects: FormProject[];
};

export const emptyExperienceForm = (): FormData => ({
	title: '',
	summary: '',
	type: ExperienceType.Professional,
	icon: undefined,
	projects: []
});

const toDateInput = (value: unknown): string => {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const isNonEmpty = (value: string | undefined): value is string => !!value;

const skillNames = (skills: Experience['projects'][number]['hardSkills']): string[] =>
	skills.map((entry) => (entry.skill as Skill | undefined)?.displayName).filter(isNonEmpty);

/** Form state for editing an existing (populated) experience. */
export const experienceToForm = (experience: Experience): FormData => ({
	title: experience.title,
	type: experience.type,
	summary: experience.summary ?? '',
	icon: experience.icon,
	// `company` is deliberately left out: the API returns it unpopulated (an id), and the
	// form has no company field yet
	projects: experience.projects.map((project) => ({
		name: project.name,
		start: toDateInput(project.start),
		end: toDateInput(project.end),
		summary: project.summary ?? '',
		hardSkills: skillNames(project.hardSkills),
		softSkills: skillNames(project.softSkills)
	}))
});

/** Converts form state into the API request body. */
export const formToExperienceRequest = (form: FormData): ExperienceRequest => {
	const { company, ...rest } = form;
	const companyName = company?.name?.trim();

	return {
		...rest,
		// Only send a company that has a name (older drafts stored `{ name: '' }`)
		...(company && companyName ? { company: { ...company, name: companyName } } : {}),
		projects: form.projects.map((project) => ({
			...project,
			start: project.start ? new Date(project.start) : undefined,
			end: project.end ? new Date(project.end) : undefined,
			hardSkills: project.hardSkills.map((name) => ({ name, level: -1 })),
			softSkills: project.softSkills.map((name) => ({ name, level: -1 }))
		}))
	};
};
