import { ExperienceType } from 'portfolio-common';
import type { Experience, Skill } from 'portfolio-api/models/database';
import type { portfolioApi } from '$services';

// Body of POST /experiences and PUT /experiences/:id
export type ExperienceRequest = Parameters<typeof portfolioApi.experiences.post>[0];

type CompanyRequest = NonNullable<ExperienceRequest['company']>;
type SkillRequest = ExperienceRequest['projects'][number]['hardSkills'][number];

export type FormProject = Omit<
	ExperienceRequest['projects'][number],
	'hardSkills' | 'softSkills' | 'start' | 'end'
> & {
	hardSkills: string[];
	softSkills: string[];
	// yyyy-mm-dd, as bound to <input type="date">
	start: string;
	end: string;
	// Skills (with their levels) of the experience being edited. The form only edits skill
	// names, so a level is carried over by name; skills added in the form get level -1
	knownHardSkills?: SkillRequest[];
	knownSoftSkills?: SkillRequest[];
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

const knownSkills = (skills: Experience['projects'][number]['hardSkills']): SkillRequest[] =>
	skills.flatMap((entry) => {
		const name = (entry.skill as Skill | undefined)?.displayName;
		return name ? [{ name, level: typeof entry.level === 'number' ? entry.level : -1 }] : [];
	});

/**
 * The experience's company as a request body, when the API returned it populated. A bare id
 * (unpopulated reference) cannot be sent back, so it yields nothing. Only the fields of the
 * request schema are kept (no `_id` / `__v`).
 */
const companyToForm = (company: unknown): CompanyRequest | undefined => {
	if (!company || typeof company !== 'object') return undefined;
	const { name, summary, svg } = company as Record<string, unknown>;
	if (typeof name !== 'string' || !name.trim()) return undefined;
	return {
		name,
		...(typeof summary === 'string' && summary ? { summary } : {}),
		...(typeof svg === 'string' && svg ? { svg } : {})
	};
};

/** Form state for editing an existing (populated) experience. */
export const experienceToForm = (experience: Experience): FormData => {
	// PUT replaces the whole experience: the form has no company field, but the company must
	// still be sent back or the API would drop it
	const company = companyToForm(experience.company);

	return {
		title: experience.title,
		type: experience.type,
		summary: experience.summary ?? '',
		icon: experience.icon,
		...(company ? { company } : {}),
		projects: experience.projects.map((project) => {
			const knownHardSkills = knownSkills(project.hardSkills);
			const knownSoftSkills = knownSkills(project.softSkills);
			return {
				name: project.name,
				start: toDateInput(project.start),
				end: toDateInput(project.end),
				summary: project.summary ?? '',
				hardSkills: knownHardSkills.map((skill) => skill.name),
				softSkills: knownSoftSkills.map((skill) => skill.name),
				knownHardSkills,
				knownSoftSkills
			};
		})
	};
};

const toSkillRequests = (names: string[], known: SkillRequest[] = []): SkillRequest[] =>
	names.map((name) => ({
		name,
		level: known.find((skill) => skill.name === name)?.level ?? -1
	}));

/** Converts form state into the API request body. */
export const formToExperienceRequest = (form: FormData): ExperienceRequest => {
	const { company, ...rest } = form;
	const companyName = company?.name?.trim();

	return {
		...rest,
		// Only send a company that has a name (older drafts stored `{ name: '' }`)
		...(company && companyName ? { company: { ...company, name: companyName } } : {}),
		projects: form.projects.map(({ knownHardSkills, knownSoftSkills, ...project }) => ({
			...project,
			start: project.start ? new Date(project.start) : undefined,
			end: project.end ? new Date(project.end) : undefined,
			hardSkills: toSkillRequests(project.hardSkills, knownHardSkills),
			softSkills: toSkillRequests(project.softSkills, knownSoftSkills)
		}))
	};
};
