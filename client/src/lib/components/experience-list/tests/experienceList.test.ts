import { describe, expect, it } from 'vitest';
import { ExperienceType } from 'portfolio-common';
import {
	collectKnownSkills,
	experienceSubtitle as subtitleParts,
	experienceTypeLabels
} from '../experienceList.ts';

const experienceSubtitle = (...args: Parameters<typeof subtitleParts>) =>
	subtitleParts(...args).map((part) => part.text);

const skill = (displayName: string) => ({
	skill: { displayName, names: [displayName] },
	level: -1
});

const project = (hard: string[], soft: string[], dates: { start?: string; end?: string } = {}) => ({
	name: 'Project',
	summary: '',
	...dates,
	hardSkills: hard.map(skill),
	softSkills: soft.map(skill)
});

const NOW = new Date('2026-11-15T12:00:00Z');

describe('experienceSubtitle', () => {
	it('joins company, location, period and duration', () => {
		expect(
			experienceSubtitle(
				{
					company: { name: 'Acme' },
					location: 'Paris',
					start: '2024-03-01T00:00:00.000Z',
					end: '2025-06-01T00:00:00.000Z'
				},
				NOW
			)
		).toEqual(['Acme', 'Paris', 'Mar 2024 – Jun 2025', '1 yr 4 mos']);
	});

	it('shows an ongoing experience as running until now', () => {
		expect(
			experienceSubtitle({ company: { name: 'Acme' }, start: '2024-03-01T00:00:00.000Z' }, NOW)
		).toEqual(['Acme', 'Mar 2024 – Present', '2 yrs 9 mos']);
	});

	it('derives the period from the projects when the experience has no dates', () => {
		expect(
			experienceSubtitle(
				{
					projects: [
						project([], [], { start: '2019-01-01T00:00:00.000Z', end: '2020-06-01T00:00:00.000Z' }),
						project([], [], { start: '2020-07-01T00:00:00.000Z', end: '2022-12-01T00:00:00.000Z' })
					]
				},
				NOW
			)
		).toEqual(['Jan 2019 – Dec 2022', '4 yrs']);
	});

	it('tells which part is which', () => {
		expect(
			subtitleParts({ location: 'Paris', start: '2024-03-01T00:00:00.000Z' }, NOW).map(
				(part) => part.kind
			)
		).toEqual(['location', 'period', 'duration']);
	});

	it('leaves out missing and blank parts', () => {
		expect(experienceSubtitle({ company: { name: '  ' }, location: '' }, NOW)).toEqual([]);
		expect(experienceSubtitle({ location: ' Remote ' }, NOW)).toEqual(['Remote']);
	});
});

describe('experienceTypeLabels', () => {
	it('labels every type', () => {
		expect(Object.keys(experienceTypeLabels).sort()).toEqual(Object.values(ExperienceType).sort());
		expect(experienceTypeLabels[ExperienceType.Educational]).toBe('Education');
	});
});

describe('collectKnownSkills', () => {
	it('lists the distinct skills of each kind, sorted', () => {
		const known = collectKnownSkills([
			{ projects: [project(['Svelte', 'Go'], ['Leadership'])] },
			{ projects: [project(['go', 'Kafka'], ['Mentoring', 'leadership'])] }
		]);
		expect(known.hard).toHaveLength(3);
		expect(known.hard.map((name) => name.toLowerCase())).toEqual(['go', 'kafka', 'svelte']);
		expect(known.soft.map((name) => name.toLowerCase())).toEqual(['leadership', 'mentoring']);
	});

	it('labels a group with its most used spelling, the first seen on a tie', () => {
		const known = collectKnownSkills([
			{ projects: [project(['typescript', 'gRPC'], [])] },
			{ projects: [project(['TypeScript', 'GRPC'], [])] },
			{ projects: [project(['TypeScript'], [])] }
		]);
		expect(known.hard).toEqual(['gRPC', 'TypeScript']);
	});

	it('keeps the kinds apart and ignores unpopulated or blank skills', () => {
		const known = collectKnownSkills([
			{
				projects: [
					{
						hardSkills: [skill('Rust'), { skill: '65f000000000000000000000' }, skill('  ')],
						softSkills: [skill('Rust')]
					}
				]
			},
			{}
		]);
		expect(known).toEqual({ hard: ['Rust'], soft: ['Rust'] });
	});
});
