import { EXPERIENCE_LIMITS, ExperienceType } from 'portfolio-common';
import type { Experience, Skill } from 'portfolio-api/models/database';
import type { portfolioApi } from '#services';
import { fromMonthKey, toMonthKey } from './experienceDates';

// Pure state helpers of the experience editor. They know nothing of the UI, so a prefilled
// form (e.g. from an imported résumé) goes through the same conversion and validation.

// Body of POST /experiences and PUT /experiences/:id
export type ExperienceRequest = Parameters<typeof portfolioApi.experiences.post>[0];

type SkillRequest = ExperienceRequest['projects'][number]['hardSkills'][number];

/** The company as edited: only the name has a field, summary/svg are sent back untouched */
export type FormCompany = { name: string; summary?: string; svg?: string };

export type FormProject = {
	/** Client-side id: keys the list and the field ids, never sent */
	id: string;
	name: string;
	/** 'YYYY-MM', '' (none), or a half-filled 'YYYY-' / '-MM' while the user picks it */
	start: string;
	end: string;
	/** No end month: the project is still going on */
	ongoing: boolean;
	summary: string;
	hardSkills: string[];
	softSkills: string[];
	// Skills (with their levels) of the experience being edited. The form only edits skill
	// names, so a level is carried over by name; skills added in the form get level -1
	knownHardSkills?: SkillRequest[];
	knownSoftSkills?: SkillRequest[];
};

export type FormData = {
	title: string;
	type: ExperienceType;
	company: FormCompany;
	location: string;
	/** Same formats as the project months */
	start: string;
	end: string;
	ongoing: boolean;
	summary: string;
	icon?: string;
	projects: FormProject[];
};

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

let lastId = 0;
/** A unique id for a form project (no crypto API: it needs a secure context) */
export const newClientId = (): string =>
	`p${Date.now().toString(36)}${(++lastId).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyProject = (): FormProject => ({
	id: newClientId(),
	name: '',
	start: '',
	end: '',
	ongoing: false,
	summary: '',
	hardSkills: [],
	softSkills: []
});

export const emptyExperienceForm = (): FormData => ({
	title: '',
	type: ExperienceType.Professional,
	company: { name: '' },
	location: '',
	start: '',
	end: '',
	ongoing: false,
	summary: '',
	icon: undefined,
	projects: []
});

/** A project the user added but never filled in: dropped instead of failing validation */
export const isBlankProject = (project: FormProject): boolean =>
	!project.name.trim() &&
	!project.start &&
	!project.end &&
	!project.ongoing &&
	!project.summary.trim() &&
	project.hardSkills.length === 0 &&
	project.softSkills.length === 0;

/** Projects that formToExperienceRequest sends, in order (index N of a 422 is the Nth) */
export const sentProjects = (form: FormData): FormProject[] =>
	form.projects.filter((project) => !isBlankProject(project));

const skillKey = (name: string) => name.trim().toLowerCase();

/**
 * Skill names as stored: trimmed, blanks dropped, spelled like a known skill when one matches
 * ignoring case ('typescript' → 'TypeScript'), and each skill once (ignoring case)
 */
export const normalizeSkillNames = (names: string[], known: readonly string[] = []): string[] => {
	const spelling = new Map<string, string>();
	for (const name of known) {
		const key = skillKey(name);
		if (key && !spelling.has(key)) spelling.set(key, name.trim());
	}
	const seen = new Set<string>();
	const result: string[] = [];
	for (const name of names) {
		const key = skillKey(name);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(spelling.get(key) ?? name.trim());
	}
	return result;
};

const knownSkills = (skills: Experience['projects'][number]['hardSkills']): SkillRequest[] =>
	skills.flatMap((entry) => {
		const name = (entry.skill as Skill | undefined)?.displayName;
		return name ? [{ name, level: typeof entry.level === 'number' ? entry.level : -1 }] : [];
	});

/**
 * The experience's company, when the API returned one. A bare id (unpopulated reference)
 * cannot be sent back. Only the fields of the request schema are kept (no `_id` / `__v`).
 */
const companyToForm = (company: unknown): FormCompany => {
	if (!company || typeof company !== 'object') return { name: '' };
	const { name, summary, svg } = company as Record<string, unknown>;
	if (typeof name !== 'string' || !name.trim()) return { name: '' };
	return {
		name,
		...(typeof summary === 'string' && summary ? { summary } : {}),
		...(typeof svg === 'string' && svg ? { svg } : {})
	};
};

/** Form months of a stored period: start without end means ongoing */
const periodToForm = (start: unknown, end: unknown) => {
	const startMonth = toMonthKey(start as Date | string | undefined) ?? '';
	const endMonth = toMonthKey(end as Date | string | undefined) ?? '';
	return { start: startMonth, end: endMonth, ongoing: !!startMonth && !endMonth };
};

/** Form state for editing an existing (populated) experience. */
export const experienceToForm = (experience: Experience): FormData => ({
	title: experience.title,
	type: experience.type,
	// PUT replaces the whole experience: the company's summary and logo have no field but
	// must still be sent back, or the API would drop them
	company: companyToForm(experience.company),
	location: experience.location ?? '',
	...periodToForm(experience.start, experience.end),
	summary: experience.summary ?? '',
	icon: experience.icon || undefined,
	projects: experience.projects.map((project) => {
		const knownHardSkills = knownSkills(project.hardSkills);
		const knownSoftSkills = knownSkills(project.softSkills);
		return {
			id: newClientId(),
			name: project.name,
			...periodToForm(project.start, project.end),
			summary: project.summary ?? '',
			hardSkills: knownHardSkills.map((skill) => skill.name),
			softSkills: knownSoftSkills.map((skill) => skill.name),
			knownHardSkills,
			knownSoftSkills
		};
	})
});

const toRequestMonth = (month: string): Date | undefined =>
	MONTH_KEY.test(month) ? fromMonthKey(month) : undefined;

/** Request dates of form months: no end when ongoing; half-filled months are left out */
const periodToRequest = ({ start, end, ongoing }: Pick<FormData, 'start' | 'end' | 'ongoing'>) => {
	const startDate = toRequestMonth(start);
	const endDate = ongoing ? undefined : toRequestMonth(end);
	return {
		...(startDate ? { start: startDate } : {}),
		...(endDate ? { end: endDate } : {})
	};
};

const toSkillRequests = (names: string[], known: SkillRequest[] = []): SkillRequest[] =>
	normalizeSkillNames(names).map((name) => ({
		name,
		level: known.find((skill) => skillKey(skill.name) === skillKey(name))?.level ?? -1
	}));

/** Converts form state into the API request body (blank projects are left out). */
export const formToExperienceRequest = (form: FormData): ExperienceRequest => {
	const companyName = form.company.name.trim();
	const location = form.location.trim();

	return {
		type: form.type,
		title: form.title.trim(),
		// A company without a name is no company
		...(companyName ? { company: { ...form.company, name: companyName } } : {}),
		...(location ? { location } : {}),
		...periodToRequest(form),
		summary: form.summary,
		...(form.icon ? { icon: form.icon } : {}),
		projects: sentProjects(form).map((project) => ({
			name: project.name.trim(),
			...periodToRequest(project),
			summary: project.summary,
			hardSkills: toSkillRequests(project.hardSkills, project.knownHardSkills),
			softSkills: toSkillRequests(project.softSkills, project.knownSoftSkills)
		}))
	};
};

/** Serialized form, to store drafts */
export const serializeForm = (form: FormData): string => JSON.stringify(form);

/**
 * What the user can see of a form, serialized: compares states (dirty check, restored draft)
 * regardless of the client ids, which differ each time an experience is opened
 */
export const formSignature = (form: FormData): string =>
	JSON.stringify({
		...form,
		projects: form.projects.map((project) => {
			const visible: Partial<FormProject> = { ...project };
			delete visible.id;
			return visible;
		})
	});

// --- Drafts -----------------------------------------------------------------------------

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asStrings = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const asSkills = (value: unknown): SkillRequest[] | undefined =>
	Array.isArray(value)
		? value.flatMap((skill) =>
				skill && typeof skill.name === 'string' && typeof skill.level === 'number'
					? [{ name: skill.name, level: skill.level }]
					: []
			)
		: undefined;

/** A form month from a stored one ('YYYY-MM', half-filled, or an older 'yyyy-mm-dd') */
const asMonth = (value: unknown): string => {
	const month = asString(value);
	if (!month || MONTH_KEY.test(month) || /^(\d{4}-|-\d{2})$/.test(month)) return month;
	return toMonthKey(month) ?? '';
};

const asPeriod = (value: Record<string, unknown>) => {
	const start = asMonth(value.start);
	const end = asMonth(value.end);
	// Older drafts had no flag: a start without an end was already "ongoing"
	const ongoing = typeof value.ongoing === 'boolean' ? value.ongoing : !!start && !end;
	return { start, end: ongoing ? '' : end, ongoing };
};

/**
 * Form state from a stored draft, or undefined when it holds no form. Defensive: the draft
 * may come from an older client or have been edited by hand.
 */
export const draftToForm = (value: unknown): FormData | undefined => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const draft = value as Record<string, unknown>;
	const types = Object.values(ExperienceType) as string[];
	const company =
		draft.company && typeof draft.company === 'object'
			? (draft.company as Record<string, unknown>)
			: {};
	const ids = new Set<string>();

	return {
		title: asString(draft.title),
		type: types.includes(draft.type as string)
			? (draft.type as ExperienceType)
			: ExperienceType.Professional,
		company: {
			name: asString(company.name),
			...(typeof company.summary === 'string' ? { summary: company.summary } : {}),
			...(typeof company.svg === 'string' ? { svg: company.svg } : {})
		},
		location: asString(draft.location),
		...asPeriod(draft),
		summary: asString(draft.summary),
		icon: typeof draft.icon === 'string' && draft.icon ? draft.icon : undefined,
		projects: (Array.isArray(draft.projects) ? draft.projects : [])
			.filter((project) => project && typeof project === 'object')
			.map((project: Record<string, unknown>) => {
				let id = asString(project.id);
				if (!id || ids.has(id)) id = newClientId();
				ids.add(id);
				const knownHardSkills = asSkills(project.knownHardSkills);
				const knownSoftSkills = asSkills(project.knownSoftSkills);
				return {
					id,
					name: asString(project.name),
					...asPeriod(project),
					summary: asString(project.summary),
					hardSkills: asStrings(project.hardSkills),
					softSkills: asStrings(project.softSkills),
					...(knownHardSkills ? { knownHardSkills } : {}),
					...(knownSoftSkills ? { knownSoftSkills } : {})
				};
			})
	};
};

// --- Validation -------------------------------------------------------------------------

/**
 * A field of the form: 'title', 'company.name', 'location', 'start', 'end', 'summary', 'icon',
 * 'projects' (the list), or 'projects.<client id>.<name|start|end|summary|hardSkills|softSkills>'
 */
export type FieldKey = string;

export type FieldError = {
	field: FieldKey;
	/** Shown under the field */
	message: string;
	/** Names the field in the error summary ('Project 2 · Name') */
	label: string;
};

const L = EXPERIENCE_LIMITS;

const tooLong = (value: string, max: number) => value.length > max;

const maxMessage = (max: number) => `Use ${max.toLocaleString('en-US')} characters or fewer.`;

/** Errors of a start/end/ongoing triple, keyed 'start' / 'end' under a prefix */
const periodErrors = (
	period: Pick<FormData, 'start' | 'end' | 'ongoing'>,
	ongoingLabel: string
): { key: 'start' | 'end'; message: string }[] => {
	const errors: { key: 'start' | 'end'; message: string }[] = [];
	const startComplete = MONTH_KEY.test(period.start);
	const endComplete = MONTH_KEY.test(period.end);

	if (period.start && !startComplete) {
		errors.push({ key: 'start', message: 'Choose both a month and a year.' });
	} else if (!period.start && (period.ongoing || period.end)) {
		errors.push({ key: 'start', message: 'Choose the start month.' });
	}

	if (period.ongoing) return errors;
	if (period.end && !endComplete) {
		errors.push({ key: 'end', message: 'Choose both a month and a year.' });
	} else if (startComplete && !period.end) {
		errors.push({ key: 'end', message: `Choose the end month, or tick “${ongoingLabel}”.` });
	} else if (startComplete && endComplete && period.end < period.start) {
		errors.push({ key: 'end', message: 'The end month must not be before the start month.' });
	}
	return errors;
};

/** Label of the "ongoing" checkbox of an experience, worded for its type */
export const ongoingLabel = (type: ExperienceType): string =>
	type === ExperienceType.Professional ? 'I currently work here' : 'Ongoing';

const PERIOD_LABELS = { start: 'Start', end: 'End' } as const;

/** Every problem of the form, in the order of the fields; empty when it can be sent */
export const validateExperienceForm = (form: FormData): FieldError[] => {
	const errors: FieldError[] = [];
	const add = (field: FieldKey, label: string, message: string) =>
		errors.push({ field, label, message });

	if (!form.title.trim()) add('title', 'Title', 'Enter a title.');
	else if (tooLong(form.title.trim(), L.title)) add('title', 'Title', maxMessage(L.title));
	if (tooLong(form.company.name.trim(), L.companyName)) {
		add('company.name', 'Company', maxMessage(L.companyName));
	}
	if (tooLong(form.location.trim(), L.location)) {
		add('location', 'Location', maxMessage(L.location));
	}
	for (const { key, message } of periodErrors(form, ongoingLabel(form.type))) {
		add(key, PERIOD_LABELS[key], message);
	}
	if (form.icon && tooLong(form.icon, L.icon)) {
		add('icon', 'Logo', 'This image is too large: choose a smaller one.');
	}
	if (tooLong(form.summary, L.text)) add('summary', 'Summary', maxMessage(L.text));

	const projects = sentProjects(form);
	if (projects.length > L.projects) {
		add('projects', 'Projects', `Keep ${L.projects} projects or fewer.`);
	}
	form.projects.forEach((project, index) => {
		if (isBlankProject(project)) return;
		const field = (name: string) => `projects.${project.id}.${name}`;
		const label = (name: string) => `Project ${index + 1} · ${name}`;

		if (!project.name.trim()) add(field('name'), label('Name'), 'Enter a project name.');
		else if (tooLong(project.name.trim(), L.projectName)) {
			add(field('name'), label('Name'), maxMessage(L.projectName));
		}
		for (const { key, message } of periodErrors(project, 'Ongoing')) {
			add(field(key), label(PERIOD_LABELS[key]), message);
		}
		if (tooLong(project.summary, L.text))
			add(field('summary'), label('Summary'), maxMessage(L.text));
		for (const [kind, name] of [
			['hardSkills', 'Technical skills'],
			['softSkills', 'Soft skills']
		] as const) {
			const skills = normalizeSkillNames(project[kind]);
			const long = skills.find((skill) => tooLong(skill, L.skillName));
			if (skills.length > L.skillsPerProject) {
				add(field(kind), label(name), `Keep ${L.skillsPerProject} skills or fewer.`);
			} else if (long) {
				add(
					field(kind),
					label(name),
					`“${long.slice(0, 30)}…” is too long: ${maxMessage(L.skillName)}`
				);
			}
		}
	});
	return errors;
};

const FIELD_LABELS: Record<string, string> = {
	title: 'Title',
	'company.name': 'Company',
	location: 'Location',
	start: 'Start',
	end: 'End',
	summary: 'Summary',
	icon: 'Logo',
	projects: 'Projects',
	name: 'Name',
	hardSkills: 'Technical skills',
	softSkills: 'Soft skills'
};

/** Names a field in the error summary: 'Title', 'Project 2 · Name' */
export const fieldLabel = (form: FormData, field: FieldKey): string => {
	const parts = field.split('.');
	if (parts[0] === 'projects' && parts.length >= 3) {
		const index = form.projects.findIndex((project) => project.id === parts[1]);
		const name = FIELD_LABELS[parts[2]] ?? parts[2];
		return index < 0 ? name : `Project ${index + 1} · ${name}`;
	}
	return FIELD_LABELS[field] ?? field;
};

/**
 * What a field's error is about, serialized: an error stays shown until this changes (the
 * user edited the field). Date errors depend on the whole period.
 */
export const fieldSnapshot = (form: FormData, field: FieldKey): string => {
	const parts = field.split('.');
	let target: Record<string, unknown> = form;
	let name = field;
	if (parts[0] === 'projects' && parts.length >= 3) {
		const project = form.projects.find((candidate) => candidate.id === parts[1]);
		if (!project) return 'removed';
		target = project;
		name = parts.slice(2).join('.');
	}
	if (name === 'start' || name === 'end') {
		return JSON.stringify([target.start, target.end, target.ongoing]);
	}
	if (name === 'company.name') return JSON.stringify(form.company.name);
	if (name === 'projects') return JSON.stringify(form.projects.map((project) => project.id));
	return JSON.stringify(target[name.split('.')[0]] ?? null);
};

/**
 * The form field of a 422's `property` ('title', 'projects.1.end', 'projects.0.hardSkills.3.name'),
 * given the client ids of the projects that were sent; undefined when no field matches.
 */
export const fieldOfServerProperty = (
	property: string | undefined,
	sentProjectIds: readonly string[]
): FieldKey | undefined => {
	if (!property) return undefined;
	const parts = property.split('.');
	if (parts[0] === 'projects') {
		if (parts.length === 1) return 'projects';
		const id = sentProjectIds[Number(parts[1])];
		const name = parts[2];
		if (!id || !name) return undefined;
		if (['name', 'start', 'end', 'summary', 'hardSkills', 'softSkills'].includes(name)) {
			return `projects.${id}.${name}`;
		}
		return undefined;
	}
	const known = ['title', 'location', 'start', 'end', 'summary', 'icon', 'company.name'];
	return known.includes(property) ? property : undefined;
};
