import { describe, it, expect } from 'vitest';
import { EXPERIENCE_LIMITS, ExperienceType } from 'portfolio-common';
import type { Experience } from 'portfolio-api/models/database';
import {
	draftToForm,
	emptyExperienceForm,
	emptyProject,
	experienceToForm,
	fieldLabel,
	fieldOfServerProperty,
	fieldSnapshot,
	formSignature,
	formToExperienceRequest,
	isBlankProject,
	normalizeSkillNames,
	ongoingLabel,
	sentProjects,
	serializeForm,
	validateExperienceForm,
	type FormData,
	type FormProject
} from '../experienceForm';

const utc = (month: string) => new Date(`${month}-01T00:00:00.000Z`);

const project = (overrides: Partial<FormProject> = {}): FormProject => ({
	id: 'p1',
	name: 'Portfolio',
	start: '2024-01',
	end: '2024-06',
	ongoing: false,
	summary: 'A portfolio site',
	hardSkills: ['TypeScript'],
	softSkills: ['Communication'],
	...overrides
});

const form = (overrides: Partial<FormData> = {}): FormData => ({
	title: 'Software Engineer',
	type: ExperienceType.Professional,
	company: { name: 'Acme' },
	location: 'Paris',
	start: '2023-09',
	end: '',
	ongoing: true,
	summary: 'Built things',
	icon: undefined,
	projects: [project()],
	...overrides
});

const fields = (value: FormData) => validateExperienceForm(value).map(({ field }) => field);

describe('emptyExperienceForm and emptyProject', () => {
	it('returns a fresh, empty form every time', () => {
		const first = emptyExperienceForm();
		first.projects.push(project());
		first.company.name = 'Changed';

		expect(emptyExperienceForm()).toEqual({
			title: '',
			type: 'professional',
			company: { name: '' },
			location: '',
			start: '',
			end: '',
			ongoing: false,
			summary: '',
			icon: undefined,
			projects: []
		});
	});

	it('starts a project without dates (not today) and with its own id', () => {
		const a = emptyProject();
		const b = emptyProject();
		expect(a).toMatchObject({ name: '', start: '', end: '', ongoing: false, summary: '' });
		expect(a.id).not.toBe(b.id);
	});
});

describe('formToExperienceRequest', () => {
	it('converts months, the company, the location and skills into the API shape', () => {
		const request = formToExperienceRequest(form());

		expect(request).toEqual({
			type: 'professional',
			title: 'Software Engineer',
			company: { name: 'Acme' },
			location: 'Paris',
			start: utc('2023-09'),
			summary: 'Built things',
			projects: [
				{
					name: 'Portfolio',
					start: utc('2024-01'),
					end: utc('2024-06'),
					summary: 'A portfolio site',
					hardSkills: [{ name: 'TypeScript', level: -1 }],
					softSkills: [{ name: 'Communication', level: -1 }]
				}
			]
		});
		// Form-only bookkeeping never reaches the API
		expect(request.projects[0]).not.toHaveProperty('id');
		expect(request.projects[0]).not.toHaveProperty('ongoing');
	});

	it('sends no end for an ongoing period, even if an end month is left in the form', () => {
		const request = formToExperienceRequest(
			form({ start: '2020-01', end: '2021-01', ongoing: true })
		);
		expect(request.start).toEqual(utc('2020-01'));
		expect(request).not.toHaveProperty('end');
	});

	it('sends both months of a finished period', () => {
		const request = formToExperienceRequest(
			form({ start: '2020-01', end: '2021-03', ongoing: false })
		);
		expect(request.start).toEqual(utc('2020-01'));
		expect(request.end).toEqual(utc('2021-03'));
	});

	it('leaves out empty or half-filled months instead of sending an Invalid Date', () => {
		const request = formToExperienceRequest(
			form({
				start: '2024-',
				end: '-03',
				ongoing: false,
				projects: [project({ start: '', end: 'not a month' })]
			})
		);
		expect(request).not.toHaveProperty('start');
		expect(request).not.toHaveProperty('end');
		expect(request.projects[0]).not.toHaveProperty('start');
		// An Invalid Date would serialize as null, which the API rejects with a 422
		expect(JSON.parse(JSON.stringify(request)).projects[0]).not.toHaveProperty('end');
	});

	it('trims texts and leaves out a blank company or location', () => {
		const request = formToExperienceRequest(
			form({ title: '  Lead  ', company: { name: '  ' }, location: ' ' })
		);
		expect(request.title).toBe('Lead');
		expect(request).not.toHaveProperty('company');
		expect(request).not.toHaveProperty('location');

		expect(formToExperienceRequest(form({ company: { name: ' Acme ' } })).company).toEqual({
			name: 'Acme'
		});
	});

	it('sends the company summary and logo back untouched', () => {
		const request = formToExperienceRequest(
			form({ company: { name: 'Acme', summary: 'Rockets', svg: '<svg/>' } })
		);
		expect(request.company).toEqual({ name: 'Acme', summary: 'Rockets', svg: '<svg/>' });
	});

	it('sends the icon only when there is one', () => {
		expect(formToExperienceRequest(form())).not.toHaveProperty('icon');
		expect(formToExperienceRequest(form({ icon: 'data:image/png;base64,AA' })).icon).toBe(
			'data:image/png;base64,AA'
		);
	});

	it('leaves out projects that were added but never filled in', () => {
		const request = formToExperienceRequest(
			form({ projects: [emptyProject(), project({ id: 'p2', name: 'Kept' }), emptyProject()] })
		);
		expect(request.projects.map(({ name }) => name)).toEqual(['Kept']);
	});

	it('dedupes skills ignoring case and drops blank ones', () => {
		const request = formToExperienceRequest(
			form({
				projects: [
					project({ hardSkills: ['TypeScript', ' typescript ', '', 'Go'], softSkills: [] })
				]
			})
		);
		expect(request.projects[0].hardSkills).toEqual([
			{ name: 'TypeScript', level: -1 },
			{ name: 'Go', level: -1 }
		]);
	});
});

describe('experienceToForm', () => {
	const experience = {
		_id: 'exp-1',
		title: 'Engineer',
		type: ExperienceType.Personal,
		summary: 'Summary',
		icon: 'data:image/x-icon;base64,AAAA',
		location: 'Lyon',
		start: '2022-02-01T00:00:00.000Z',
		end: '2023-05-01T00:00:00.000Z',
		// Unpopulated reference, as returned by an API that does not populate companies
		company: '65f000000000000000000001',
		projects: [
			{
				name: 'Project',
				start: '2023-02-01T00:00:00.000Z',
				end: undefined,
				summary: 'Project summary',
				hardSkills: [{ skill: { displayName: 'Svelte', names: ['Svelte'] }, level: 4 }],
				softSkills: [{ skill: { displayName: 'Teamwork', names: ['Teamwork'] }, level: -1 }]
			},
			{
				name: 'Undated',
				summary: 'No dates',
				hardSkills: [],
				softSkills: []
			}
		]
	} as unknown as Experience;

	const withCompany = (company: unknown) => ({ ...experience, company }) as unknown as Experience;

	it('maps a populated experience to form state', () => {
		const result = experienceToForm(experience);
		expect(result).toEqual({
			title: 'Engineer',
			type: 'personal',
			company: { name: '' },
			location: 'Lyon',
			start: '2022-02',
			end: '2023-05',
			ongoing: false,
			summary: 'Summary',
			icon: 'data:image/x-icon;base64,AAAA',
			projects: [
				{
					id: expect.any(String),
					name: 'Project',
					start: '2023-02',
					end: '',
					// A start without an end is ongoing
					ongoing: true,
					summary: 'Project summary',
					hardSkills: ['Svelte'],
					softSkills: ['Teamwork'],
					knownHardSkills: [{ name: 'Svelte', level: 4 }],
					knownSoftSkills: [{ name: 'Teamwork', level: -1 }]
				},
				{
					id: expect.any(String),
					name: 'Undated',
					start: '',
					end: '',
					ongoing: false,
					summary: 'No dates',
					hardSkills: [],
					softSkills: [],
					knownHardSkills: [],
					knownSoftSkills: []
				}
			]
		});
		expect(result.projects[0].id).not.toBe(result.projects[1].id);
	});

	it('reads months in UTC whatever the time zone', () => {
		const result = experienceToForm({
			...experience,
			start: '2024-03-01T00:00:00.000Z'
		} as unknown as Experience);
		expect(result.start).toBe('2024-03');
	});

	it('marks an experience with a start and no end as ongoing', () => {
		const result = experienceToForm({ ...experience, end: undefined } as unknown as Experience);
		expect(result).toMatchObject({ start: '2022-02', end: '', ongoing: true });
	});

	it('does not carry an unpopulated company id into the request', () => {
		const request = formToExperienceRequest(experienceToForm(experience));
		expect(request).not.toHaveProperty('company');
	});

	it('sends a populated company back on edit, so PUT does not drop it', () => {
		const company = {
			_id: '65f000000000000000000001',
			name: 'Acme',
			summary: 'Rockets',
			svg: '<svg/>',
			__v: 0
		};

		const result = experienceToForm(withCompany(company));
		expect(result.company).toEqual({ name: 'Acme', summary: 'Rockets', svg: '<svg/>' });
		expect(formToExperienceRequest(result).company).toEqual({
			name: 'Acme',
			summary: 'Rockets',
			svg: '<svg/>'
		});
	});

	it('only keeps the company fields the request schema accepts', () => {
		expect(experienceToForm(withCompany({ _id: 'c1', name: 'Acme', __v: 0 })).company).toEqual({
			name: 'Acme'
		});
		expect(experienceToForm(withCompany({ _id: 'c1', name: '' })).company).toEqual({ name: '' });
		expect(experienceToForm(withCompany(null)).company).toEqual({ name: '' });
	});

	it('round-trips through the request', () => {
		const request = formToExperienceRequest(experienceToForm(experience));
		expect(request).toMatchObject({
			location: 'Lyon',
			start: utc('2022-02'),
			end: utc('2023-05')
		});
		expect(request.projects[0].start).toEqual(utc('2023-02'));
		expect(request.projects[0]).not.toHaveProperty('end');
	});

	it('keeps the levels of existing skills (ignoring case) and gives new skills level -1', () => {
		const result = experienceToForm(experience);
		result.projects[0].hardSkills = ['svelte', 'TypeScript'];
		result.projects[0].softSkills = [];

		const request = formToExperienceRequest(result);
		expect(request.projects[0].hardSkills).toEqual([
			{ name: 'svelte', level: 4 },
			{ name: 'TypeScript', level: -1 }
		]);
		expect(request.projects[0].softSkills).toEqual([]);
		expect(request.projects[0]).not.toHaveProperty('knownHardSkills');
		expect(request.projects[0]).not.toHaveProperty('knownSoftSkills');
	});

	it('does not resolve skill levels through the object prototype', () => {
		const result = experienceToForm(experience);
		result.projects[0].hardSkills = ['constructor', '__proto__'];

		expect(formToExperienceRequest(result).projects[0].hardSkills).toEqual([
			{ name: 'constructor', level: -1 },
			{ name: '__proto__', level: -1 }
		]);
	});
});

describe('normalizeSkillNames', () => {
	it('spells skills like the known ones, ignoring case and spaces', () => {
		expect(normalizeSkillNames(['typescript', ' node.js '], ['TypeScript', 'Node.js'])).toEqual([
			'TypeScript',
			'Node.js'
		]);
	});

	it('keeps the first of case variants and drops blanks', () => {
		expect(normalizeSkillNames(['gRPC', 'GRPC', ' ', 'grpc', 'Go'])).toEqual(['gRPC', 'Go']);
	});

	it('keeps unknown skills as typed (trimmed)', () => {
		expect(normalizeSkillNames(['  Kafka '], ['Go'])).toEqual(['Kafka']);
	});
});

describe('blank projects', () => {
	it('is blank only when nothing was filled in', () => {
		expect(isBlankProject(emptyProject())).toBe(true);
		expect(isBlankProject({ ...emptyProject(), summary: '  ' })).toBe(true);
		expect(isBlankProject({ ...emptyProject(), name: 'x' })).toBe(false);
		expect(isBlankProject({ ...emptyProject(), start: '2024-01' })).toBe(false);
		expect(isBlankProject({ ...emptyProject(), ongoing: true })).toBe(false);
		expect(isBlankProject({ ...emptyProject(), softSkills: ['Teamwork'] })).toBe(false);
	});

	it('lists the projects that are sent', () => {
		const blank = emptyProject();
		const kept = project({ id: 'kept' });
		expect(sentProjects(form({ projects: [blank, kept] }))).toEqual([kept]);
	});
});

describe('validateExperienceForm', () => {
	it('accepts a complete form', () => {
		expect(validateExperienceForm(form())).toEqual([]);
		expect(validateExperienceForm(form({ start: '', end: '', ongoing: false }))).toEqual([]);
	});

	it('requires a title', () => {
		expect(validateExperienceForm(form({ title: '   ' }))).toEqual([
			{ field: 'title', label: 'Title', message: 'Enter a title.' }
		]);
	});

	it('requires a name for every project that is not blank', () => {
		const result = validateExperienceForm(
			form({ projects: [emptyProject(), project({ id: 'p2', name: ' ' })] })
		);
		expect(result).toEqual([
			{ field: 'projects.p2.name', label: 'Project 2 · Name', message: 'Enter a project name.' }
		]);
	});

	it('rejects an end month before the start month', () => {
		expect(
			validateExperienceForm(form({ start: '2023-05', end: '2023-04', ongoing: false }))
		).toEqual([
			{
				field: 'end',
				label: 'End',
				message: 'The end month must not be before the start month.'
			}
		]);
		expect(fields(form({ projects: [project({ start: '2024-06', end: '2024-01' })] }))).toEqual([
			'projects.p1.end'
		]);
		// The same month is fine
		expect(fields(form({ start: '2023-05', end: '2023-05', ongoing: false }))).toEqual([]);
	});

	it('asks for an end month or the ongoing box once a start is set', () => {
		const [error] = validateExperienceForm(form({ start: '2023-05', end: '', ongoing: false }));
		expect(error.field).toBe('end');
		expect(error.message).toContain('I currently work here');

		const [projectError] = validateExperienceForm(
			form({ projects: [project({ end: '', ongoing: false })] })
		);
		expect(projectError.field).toBe('projects.p1.end');
		expect(projectError.message).toContain('Ongoing');
	});

	it('asks for a start month when an end or the ongoing box is set', () => {
		expect(fields(form({ start: '', end: '2023-05', ongoing: false }))).toEqual(['start']);
		expect(fields(form({ start: '', end: '', ongoing: true }))).toEqual(['start']);
	});

	it('flags half-filled months', () => {
		expect(fields(form({ start: '2023-', ongoing: true }))).toEqual(['start']);
		expect(fields(form({ start: '2023-01', end: '-04', ongoing: false }))).toEqual(['end']);
	});

	it('enforces the shared length limits', () => {
		const long = (length: number) => 'x'.repeat(length + 1);
		expect(
			fields(
				form({
					title: long(EXPERIENCE_LIMITS.title),
					company: { name: long(EXPERIENCE_LIMITS.companyName) },
					location: long(EXPERIENCE_LIMITS.location),
					summary: long(EXPERIENCE_LIMITS.text),
					icon: long(EXPERIENCE_LIMITS.icon),
					projects: [
						project({
							name: long(EXPERIENCE_LIMITS.projectName),
							summary: long(EXPERIENCE_LIMITS.text),
							hardSkills: [long(EXPERIENCE_LIMITS.skillName)],
							softSkills: Array.from(
								{ length: EXPERIENCE_LIMITS.skillsPerProject + 1 },
								(_, i) => `skill ${i}`
							)
						})
					]
				})
			)
		).toEqual([
			'title',
			'company.name',
			'location',
			'icon',
			'summary',
			'projects.p1.name',
			'projects.p1.summary',
			'projects.p1.hardSkills',
			'projects.p1.softSkills'
		]);
	});

	it('limits the number of projects', () => {
		const projects = Array.from({ length: EXPERIENCE_LIMITS.projects + 1 }, (_, i) =>
			project({ id: `p${i}` })
		);
		expect(fields(form({ projects }))).toEqual(['projects']);
	});

	it('words the ongoing box for the experience type', () => {
		expect(ongoingLabel(ExperienceType.Professional)).toBe('I currently work here');
		expect(ongoingLabel(ExperienceType.Educational)).toBe('Ongoing');
	});
});

describe('fieldSnapshot', () => {
	it('changes when the field changes', () => {
		const value = form();
		const before = fieldSnapshot(value, 'title');
		expect(fieldSnapshot({ ...value, summary: 'other' }, 'title')).toBe(before);
		expect(fieldSnapshot({ ...value, title: 'other' }, 'title')).not.toBe(before);
	});

	it('ties date errors to the whole period', () => {
		const value = form({ start: '2023-05', end: '2023-04', ongoing: false });
		const before = fieldSnapshot(value, 'end');
		expect(fieldSnapshot({ ...value, start: '2023-01' }, 'end')).not.toBe(before);
		expect(fieldSnapshot({ ...value, ongoing: true }, 'end')).not.toBe(before);
	});

	it('follows a project by its id, wherever it moves', () => {
		const second = project({ id: 'p2', name: '' });
		const value = form({ projects: [project(), second] });
		const before = fieldSnapshot(value, 'projects.p2.name');
		expect(fieldSnapshot({ ...value, projects: [second, project()] }, 'projects.p2.name')).toBe(
			before
		);
		expect(
			fieldSnapshot({ ...value, projects: [{ ...second, name: 'Named' }] }, 'projects.p2.name')
		).not.toBe(before);
		expect(fieldSnapshot({ ...value, projects: [] }, 'projects.p2.name')).toBe('removed');
	});

	it('covers the company name', () => {
		const value = form();
		expect(fieldSnapshot({ ...value, company: { name: 'Other' } }, 'company.name')).not.toBe(
			fieldSnapshot(value, 'company.name')
		);
	});
});

describe('fieldOfServerProperty', () => {
	const ids = ['a', 'b'];

	it('maps experience fields', () => {
		for (const property of [
			'title',
			'location',
			'start',
			'end',
			'summary',
			'icon',
			'company.name'
		]) {
			expect(fieldOfServerProperty(property, ids)).toBe(property);
		}
	});

	it('maps project fields by the index of the sent project', () => {
		expect(fieldOfServerProperty('projects.1.end', ids)).toBe('projects.b.end');
		expect(fieldOfServerProperty('projects.0.name', ids)).toBe('projects.a.name');
		expect(fieldOfServerProperty('projects.0.hardSkills.3.name', ids)).toBe(
			'projects.a.hardSkills'
		);
		expect(fieldOfServerProperty('projects', ids)).toBe('projects');
	});

	it('gives nothing for unknown fields', () => {
		expect(fieldOfServerProperty(undefined, ids)).toBeUndefined();
		expect(fieldOfServerProperty('root', ids)).toBeUndefined();
		expect(fieldOfServerProperty('company.summary', ids)).toBeUndefined();
		expect(fieldOfServerProperty('projects.5.name', ids)).toBeUndefined();
		expect(fieldOfServerProperty('projects.0.other', ids)).toBeUndefined();
	});
});

describe('draftToForm', () => {
	it('restores a saved draft as it was', () => {
		const value = form({ projects: [project(), project({ id: 'p2', ongoing: true, end: '' })] });
		expect(draftToForm(JSON.parse(serializeForm(value)))).toEqual(value);
	});

	it('keeps half-filled months', () => {
		const value = form({ start: '2023-', ongoing: false });
		expect(draftToForm(JSON.parse(serializeForm(value)))?.start).toBe('2023-');
	});

	it('reads the drafts of older clients', () => {
		// The old global 'newExperience' draft: day dates (or the literal 'undefined'), no ids
		const restored = draftToForm({
			title: 'Old',
			type: 'leisure',
			summary: 'S',
			projects: [
				{ name: 'A', start: '2024-01-15', end: '2024-06-01', summary: '', hardSkills: ['Go'] },
				{ name: 'B', start: '2024-02-01', end: 'undefined', summary: '' },
				{ name: 'C', start: 'undefined', end: 'undefined', summary: '' }
			]
		});
		expect(restored).toMatchObject({
			title: 'Old',
			type: 'leisure',
			company: { name: '' },
			location: '',
			start: '',
			end: '',
			ongoing: false,
			projects: [
				{ name: 'A', start: '2024-01', end: '2024-06', ongoing: false, hardSkills: ['Go'] },
				{ name: 'B', start: '2024-02', end: '', ongoing: true, softSkills: [] },
				{ name: 'C', start: '', end: '', ongoing: false }
			]
		});
		const ids = restored!.projects.map(({ id }) => id);
		expect(new Set(ids).size).toBe(3);
	});

	it('repairs what it cannot trust', () => {
		const restored = draftToForm({
			title: 42,
			type: 'astronaut',
			company: 'Acme',
			projects: [null, 'x', { id: 'same' }, { id: 'same', hardSkills: ['Go', 3] }]
		});
		expect(restored?.title).toBe('');
		expect(restored?.type).toBe('professional');
		expect(restored?.company).toEqual({ name: '' });
		expect(restored?.projects).toHaveLength(2);
		expect(restored?.projects[0].id).toBe('same');
		expect(restored?.projects[1].id).not.toBe('same');
		expect(restored?.projects[1].hardSkills).toEqual(['Go']);
	});

	it('gives nothing for something that is not a form', () => {
		expect(draftToForm(null)).toBeUndefined();
		expect(draftToForm('form')).toBeUndefined();
		expect(draftToForm([])).toBeUndefined();
	});
});

describe('fieldLabel', () => {
	it('names experience fields and numbers projects as shown', () => {
		const value = form({ projects: [project(), project({ id: 'p2' })] });
		expect(fieldLabel(value, 'title')).toBe('Title');
		expect(fieldLabel(value, 'company.name')).toBe('Company');
		expect(fieldLabel(value, 'icon')).toBe('Logo');
		expect(fieldLabel(value, 'projects.p2.end')).toBe('Project 2 · End');
		expect(fieldLabel(value, 'projects.p1.hardSkills')).toBe('Project 1 · Technical skills');
	});
});

describe('formSignature', () => {
	it('ignores the client ids, so a reopened experience is not "changed"', () => {
		const experience = {
			title: 'T',
			type: ExperienceType.Professional,
			summary: '',
			projects: [{ name: 'P', summary: '', hardSkills: [], softSkills: [] }]
		} as unknown as Experience;
		const first = experienceToForm(experience);
		const second = experienceToForm(experience);
		expect(first.projects[0].id).not.toBe(second.projects[0].id);
		expect(formSignature(first)).toBe(formSignature(second));
	});

	it('sees every visible change, the order of projects included', () => {
		const value = form({ projects: [project(), project({ id: 'p2', name: 'Other' })] });
		expect(formSignature({ ...value, location: 'Lyon' })).not.toBe(formSignature(value));
		expect(formSignature({ ...value, projects: [...value.projects].reverse() })).not.toBe(
			formSignature(value)
		);
	});
});

describe('prefilled forms (e.g. read from a résumé)', () => {
	const prefilled = (): FormData => ({
		...emptyExperienceForm(),
		title: '  Data Engineer ',
		company: { name: 'Globex' },
		start: '2019-04',
		end: '2021-01',
		projects: [
			{
				...emptyProject(),
				name: 'Pipelines',
				start: '2019-04',
				ongoing: true,
				hardSkills: ['python', 'Airflow', 'PYTHON']
			},
			emptyProject()
		]
	});

	it('validates and converts like a typed form, with the known spellings', () => {
		const value = prefilled();
		expect(validateExperienceForm(value)).toEqual([]);
		const request = formToExperienceRequest(value);
		expect(request).toMatchObject({
			title: 'Data Engineer',
			company: { name: 'Globex' },
			start: utc('2019-04'),
			end: utc('2021-01')
		});
		// The untouched extra project is left out; skills are deduped ignoring case
		expect(request.projects).toHaveLength(1);
		expect(request.projects[0]).toMatchObject({ name: 'Pipelines', start: utc('2019-04') });
		expect(request.projects[0]).not.toHaveProperty('end');
		expect(request.projects[0].hardSkills.map((skill) => skill.name)).toEqual([
			'python',
			'Airflow'
		]);
		expect(normalizeSkillNames(value.projects[0].hardSkills, ['Python'])).toEqual([
			'Python',
			'Airflow'
		]);
	});

	it('reports what the reader could not fill', () => {
		const value = prefilled();
		value.title = '';
		value.projects[0].name = '';
		value.projects[0].start = '';
		expect(fields(value)).toEqual([
			'title',
			`projects.${value.projects[0].id}.name`,
			`projects.${value.projects[0].id}.start`
		]);
	});
});
