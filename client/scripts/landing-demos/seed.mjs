// The data of the landing page's demos (see record.mjs), in the local database only: a fictional
// candidate ('jane.doe') with experiences, a hiring journey and a perfect job whose commute is a
// deal-breaker, and a fictional recruiter with an open job too far away. Everything but the two
// users and the domain goes through the API, as the app would write it. Starts again from nothing
// each time. The perfect job's address is looked up by the API: start it with COMMUTE_TIMES=true.
// The recruiter accepts the terms in force (PUT /me/consent) before writing his job: the API
// refuses every recruiter route until he has, so after a LEGAL_VERSION bump run this seed again.
// Usage: bun scripts/landing-demos/seed.mjs
import { currentConsent } from 'portfolio-common';
import { API, JANE, SAM, mongo, session } from './lib.mjs';

// Start again from nothing
console.log(
	mongo(`
const jane = ObjectId('${JANE}'), sam = ObjectId('${SAM}');
const domains = db.domains.find({ admin: jane }).toArray();
for (const d of domains) db.experiences.deleteMany({ _id: { $in: d.experiences } });
db.domains.deleteMany({ admin: jane });
db.hiringworkflows.deleteMany({ user: jane });
db.perfectjobs.deleteMany({ user: jane });
db.workflowinstances.deleteMany({ owner: jane });
db.jobpostings.deleteMany({ recruiter: sam });
db.users.deleteMany({ _id: { $in: [jane, sam] } });
db.users.insertOne({ _id: jane, email: 'jane.doe@example.com', name: 'Jane', surname: 'Doe',
  legalAcceptances: [] });
db.users.insertOne({ _id: sam, email: 'sam.carter@example.com', name: 'Sam', surname: 'Carter',
  activeMode: 'recruiter', recruiter: { enabledAt: new Date(), plan: 'free', jobImportsUsed: 0 } });
db.domains.insertOne({ name: 'jane.doe', admin: jane, experiences: [], theme: 'wintry',
  headerTitle: 'Jane Doe', headerSubtitle: 'Staff frontend engineer, Lyon' });
print('users and domain ready');
`)
);

const call = async (who, method, path, body) => {
	const response = await fetch(`${API}${path}`, {
		method,
		headers: {
			cookie: `auth=${await session(who)}`,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
	return text ? JSON.parse(text) : undefined;
};

const month = (value) => (value ? `${value}-01T00:00:00.000Z` : undefined);
const skills = (...names) => names.map((name) => ({ name, level: -1 }));
const project = (name, start, end, summary, hard, soft = []) => ({
	name,
	start: month(start),
	end: month(end),
	summary,
	hardSkills: skills(...hard),
	softSkills: skills(...soft)
});

const experiences = [
	{
		type: 'educational',
		title: 'MSc in Computer Science',
		company: { name: 'INSA Lyon' },
		location: 'Lyon',
		start: month('2012-09'),
		end: month('2015-06'),
		summary: 'Software engineering and human-computer interaction.',
		projects: [
			project(
				'Thesis: readable maps on small screens',
				'2015-01',
				'2015-06',
				'Label placement for transit maps on phones, tested with 40 commuters.',
				['JavaScript', 'SVG', 'D3'],
				['Research']
			)
		]
	},
	{
		type: 'professional',
		title: 'Frontend engineer',
		company: { name: 'Lumen Labs' },
		location: 'Lyon',
		start: month('2015-09'),
		end: month('2018-07'),
		summary: 'Online booking for independent cinemas, in a team of six.',
		projects: [
			project(
				'Seat picker',
				'2015-09',
				'2016-10',
				'An accessible seat map used by 120 cinemas.',
				['JavaScript', 'React', 'SVG'],
				['Accessibility']
			),
			project(
				'Design system',
				'2016-08',
				'2018-07',
				'Shared components and tokens for the three web apps.',
				['TypeScript', 'React', 'Storybook'],
				['Documentation']
			),
			project('Checkout redesign', '2017-03', '2017-12', 'Fewer steps to pay: conversion up 14%.', [
				'React',
				'GraphQL',
				'Playwright'
			])
		]
	},
	{
		type: 'professional',
		title: 'Senior frontend engineer',
		company: { name: 'Kite Mobility' },
		location: 'Lyon',
		start: month('2018-07'),
		end: month('2022-04'),
		summary: 'Trip planning for shared bikes and public transport.',
		projects: [
			project(
				'Trip planner',
				'2018-07',
				'2020-05',
				'Door-to-door routes mixing bikes, trams and walking.',
				['TypeScript', 'Svelte', 'MapLibre'],
				['Product discovery']
			),
			project(
				'Live fleet dashboard',
				'2019-09',
				'2021-06',
				'Where every bike is, updated each second for the operators.',
				['Svelte', 'WebSocket', 'D3']
			),
			project(
				'Accessibility audit',
				'2021-03',
				'2022-04',
				'WCAG 2.1 AA across the apps, checked in CI.',
				['Playwright', 'TypeScript'],
				['Accessibility', 'Mentoring']
			)
		]
	},
	{
		type: 'professional',
		title: 'Staff frontend engineer',
		company: { name: 'Northwind Energy' },
		location: 'Lyon',
		start: month('2022-04'),
		summary: 'Tools for the people who balance the power grid.',
		projects: [
			project(
				'Grid monitoring',
				'2022-04',
				'2024-09',
				'One screen for 3,000 substations, usable in a control room at night.',
				['SvelteKit', 'TypeScript', 'Kafka'],
				['Product discovery']
			),
			project(
				'Frontend platform',
				'2023-06',
				undefined,
				'Build, tests and releases shared by five teams.',
				['Vite', 'Playwright', 'TypeScript'],
				['Mentoring', 'Documentation']
			),
			project(
				'Forecast explorer',
				'2025-01',
				undefined,
				'Compare demand forecasts with what happened.',
				['SvelteKit', 'D3', 'Go']
			)
		]
	},
	{
		type: 'personal',
		title: 'Maintainer of tiny-charts',
		location: 'Open source',
		start: month('2020-02'),
		summary: 'A small charting library for Svelte, 2 kB per chart.',
		projects: [
			project(
				'tiny-charts',
				'2020-02',
				undefined,
				'Line, bar and area charts without a runtime dependency.',
				['TypeScript', 'Svelte', 'SVG'],
				['Documentation']
			)
		]
	}
];

for (const experience of experiences) await call(JANE, 'POST', '/experiences', experience);
console.log(`${experiences.length} experiences`);

await call(JANE, 'PUT', '/perfect-job', {
	criteria: {
		titles: { importance: 3, keywords: ['frontend', 'front-end'] },
		seniority: { importance: 3, levels: ['senior', 'lead'] },
		workMode: { importance: 3, modes: ['on_site', 'hybrid', 'remote'] },
		commute: {
			importance: 5,
			dealBreaker: true,
			from: 'Place Bellecour, 69002 Lyon',
			modes: ['bike', 'car'],
			maxMinutesPerWeek: 300
		},
		contractTypes: { importance: 4, types: ['cdi'] },
		pay: { importance: 4, perYear: 70000 },
		skills: { importance: 3, names: ['TypeScript', 'Svelte', 'SvelteKit', 'Playwright', 'D3'] }
	}
});
console.log(
	'perfect job',
	JSON.stringify((await call(JANE, 'GET', '/perfect-job')).criteria?.commute)
);

await call(JANE, 'PUT', '/workflow', {
	steps: [
		{
			id: 'note',
			type: 'note',
			config: {
				// Not the page's own "Before you start" card above the steps, and in the neutral words
				// of the page around it (the job is scored against the owner's criteria)
				title: 'My conditions',
				text: 'I am open to **staff or lead frontend** roles around Lyon.\n\nShare the job first: you will see at once how it matches my criteria.'
			}
		},
		{ id: 'job', type: 'job', config: {} },
		{ id: 'match', type: 'job-match', config: { minScore: 70, showDetails: true } },
		{ id: 'meeting', type: 'meeting', config: {} }
	]
});
console.log('journey');

const job = (title, company, location) => ({
	title,
	description: `## The job\n\nLead the frontend of our operator tools, with a team of five.\n\n## You\n\nYou have shipped large web apps and enjoy helping others grow.`,
	company,
	status: 'open',
	location: { country: 'FR', ...location },
	contract: { type: 'cdi' },
	workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 37 },
	pay: { min: 72000, max: 85000, currency: 'EUR', period: 'year' },
	requirements: { seniority: 'lead', skills: ['TypeScript', 'SvelteKit', 'Playwright'] },
	travel: 'occasional'
});

const jobs = [
	job('Lead frontend engineer, Grenoble', 'Alpine Robotics', {
		city: 'Grenoble',
		postalCode: '38000',
		address: '5 place Victor Hugo',
		workMode: 'on_site'
	})
];
// The terms in force, accepted where a recruiter accepts them (his space has no acceptance yet)
await call(SAM, 'PUT', '/me/consent', { ...currentConsent(), source: 'recruiter' });
console.log('recruiter terms accepted');

for (const posting of jobs) {
	const created = await call(SAM, 'POST', '/jobs', posting);
	console.log('job', created._id, created.title, created.status);
}
