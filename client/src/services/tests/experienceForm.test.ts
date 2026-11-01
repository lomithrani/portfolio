import { describe, it, expect } from 'vitest';
import { ExperienceType } from 'portfolio-common';
import type { Experience } from 'portfolio-api/models/database';
import {
	emptyExperienceForm,
	experienceToForm,
	formToExperienceRequest,
	type FormData
} from '../experienceForm';

const form: FormData = {
	title: 'Software Engineer',
	type: ExperienceType.Professional,
	summary: 'Built things',
	projects: [
		{
			name: 'Portfolio',
			start: '2024-01-01',
			end: '2024-06-01',
			summary: 'A portfolio site',
			hardSkills: ['TypeScript'],
			softSkills: ['Communication']
		}
	]
};

describe('formToExperienceRequest', () => {
	it('converts dates and skill names into the API shape', () => {
		const request = formToExperienceRequest(form);

		expect(request.title).toBe('Software Engineer');
		expect(request.type).toBe('professional');
		expect(request.projects).toHaveLength(1);
		expect(request.projects[0].start).toEqual(new Date('2024-01-01'));
		expect(request.projects[0].end).toEqual(new Date('2024-06-01'));
		expect(request.projects[0].hardSkills).toEqual([{ name: 'TypeScript', level: -1 }]);
		expect(request.projects[0].softSkills).toEqual([{ name: 'Communication', level: -1 }]);
	});

	it('leaves empty project dates undefined', () => {
		const request = formToExperienceRequest({
			...form,
			projects: [{ ...form.projects[0], start: '', end: '' }]
		});

		expect(request.projects[0].start).toBeUndefined();
		expect(request.projects[0].end).toBeUndefined();
	});

	it('never sends a company without a name (old drafts stored { name: "" })', () => {
		expect(formToExperienceRequest({ ...form, company: { name: '' } })).not.toHaveProperty(
			'company'
		);
		expect(formToExperienceRequest({ ...form, company: { name: '  ' } })).not.toHaveProperty(
			'company'
		);
		expect(formToExperienceRequest(form)).not.toHaveProperty('company');
	});

	it('keeps a named company', () => {
		const request = formToExperienceRequest({ ...form, company: { name: ' Acme ' } });
		expect(request.company).toEqual({ name: 'Acme' });
	});
});

describe('experienceToForm', () => {
	const experience = {
		_id: 'exp-1',
		title: 'Engineer',
		type: ExperienceType.Personal,
		summary: 'Summary',
		icon: 'data:image/x-icon;base64,AAAA',
		company: '65f000000000000000000001',
		projects: [
			{
				name: 'Project',
				start: '2023-02-01T00:00:00.000Z',
				end: undefined,
				summary: 'Project summary',
				hardSkills: [{ skill: { displayName: 'Svelte', names: ['Svelte'] }, level: -1 }],
				softSkills: [{ skill: { displayName: 'Teamwork', names: ['Teamwork'] }, level: -1 }]
			}
		]
	} as unknown as Experience;

	it('maps a populated experience to form state', () => {
		expect(experienceToForm(experience)).toEqual({
			title: 'Engineer',
			type: 'personal',
			summary: 'Summary',
			icon: 'data:image/x-icon;base64,AAAA',
			projects: [
				{
					name: 'Project',
					start: '2023-02-01',
					end: '',
					summary: 'Project summary',
					hardSkills: ['Svelte'],
					softSkills: ['Teamwork']
				}
			]
		});
	});

	it('does not carry the unpopulated company id into the request', () => {
		const request = formToExperienceRequest(experienceToForm(experience));
		expect(request).not.toHaveProperty('company');
	});
});

describe('emptyExperienceForm', () => {
	it('returns a fresh draft every time', () => {
		const first = emptyExperienceForm();
		first.projects.push({ ...form.projects[0] });

		expect(emptyExperienceForm().projects).toEqual([]);
		expect(emptyExperienceForm()).not.toHaveProperty('company');
	});
});
