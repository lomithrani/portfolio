import { describe, it, expect } from 'vitest';
import { ExperienceType, RESUME_IMPORT_TIMEOUTS } from 'portfolio-common';
import { emptyExperienceForm, emptyProject, type FormData } from '../experienceForm';
import {
	IMPORT_CLIENT_TIMEOUT_MS,
	allDraftsAdded,
	applyEditedDrafts,
	base64OfDataUrl,
	clearImportReview,
	draftPeriodText,
	draftProblems,
	draftSkills,
	draftsToAdd,
	existingExperienceKeys,
	experienceKey,
	extractedToForm,
	failedDraftsText,
	formatElapsed,
	formatFileSize,
	formatResetDate,
	hasPdfHeader,
	importErrorMessage,
	importStorageKey,
	isDuplicateDraft,
	loadImportReview,
	MAX_RESUME_PDF_BYTES,
	parseImportReview,
	problemsText,
	quotaText,
	resumeFileProblem,
	reviewFromResult,
	saveErrorMessage,
	saveErrorNeedsEdit,
	saveImportReview,
	serializeImportReview,
	summaryPreview,
	untickDuplicates,
	type ExtractedExperience,
	type ImportReview
} from '../resumeImport';

class MemoryStorage {
	items = new Map<string, string>();
	getItem(key: string) {
		return this.items.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.items.set(key, value);
	}
	removeItem(key: string) {
		this.items.delete(key);
	}
}

const extracted = (overrides: Partial<ExtractedExperience> = {}): ExtractedExperience => ({
	type: ExperienceType.Professional,
	title: 'Senior Engineer',
	company: 'Acme',
	location: 'Paris, France',
	start: '2021-03',
	end: '2024-06',
	current: false,
	summary: '- Led the platform team\n- Cut p95 latency',
	projects: [
		{
			name: 'Payments',
			start: '2022-01',
			end: '2023-02',
			current: false,
			summary: '- Event pipeline',
			hardSkills: ['typescript', 'Kafka'],
			softSkills: ['leadership']
		}
	],
	...overrides
});

const form = (overrides: Partial<FormData> = {}): FormData => ({
	...emptyExperienceForm(),
	title: 'Senior Engineer',
	company: { name: 'Acme' },
	start: '2021-03',
	end: '2024-06',
	...overrides
});

describe('extractedToForm', () => {
	it('maps every field of an extracted experience to the editor’s add form', () => {
		const result = extractedToForm(extracted());
		expect(result).toMatchObject({
			type: ExperienceType.Professional,
			title: 'Senior Engineer',
			company: { name: 'Acme' },
			location: 'Paris, France',
			start: '2021-03',
			end: '2024-06',
			ongoing: false,
			summary: '- Led the platform team\n- Cut p95 latency',
			icon: undefined
		});
		expect(result.projects).toHaveLength(1);
		expect(result.projects[0]).toMatchObject({
			name: 'Payments',
			start: '2022-01',
			end: '2023-02',
			ongoing: false,
			summary: '- Event pipeline',
			hardSkills: ['typescript', 'Kafka'],
			softSkills: ['leadership']
		});
		expect(result.projects[0].id).toMatch(/^p/);
	});

	it('turns current into ongoing, without an end', () => {
		const result = extractedToForm(
			extracted({
				current: true,
				end: '2024-06',
				projects: [{ ...extracted().projects[0], current: true, end: '2023-02' }]
			})
		);
		expect(result).toMatchObject({ start: '2021-03', end: '', ongoing: true });
		expect(result.projects[0]).toMatchObject({ start: '2022-01', end: '', ongoing: true });
	});

	it('leaves what the résumé does not give empty', () => {
		const result = extractedToForm({
			type: ExperienceType.Educational,
			title: 'MSc Computer Science',
			current: false,
			summary: '',
			projects: []
		});
		expect(result).toMatchObject({
			type: ExperienceType.Educational,
			company: { name: '' },
			location: '',
			start: '',
			end: '',
			ongoing: false,
			projects: []
		});
	});

	it('drops months that are not YYYY-MM and falls back to a known type', () => {
		const result = extractedToForm(
			extracted({ type: 'job' as ExperienceType, start: '2021', end: '2024-13' })
		);
		expect(result).toMatchObject({ type: ExperienceType.Professional, start: '', end: '' });
	});

	it('spells skills like the portfolio’s known skills, each once', () => {
		const result = extractedToForm(
			extracted({
				projects: [
					{
						...extracted().projects[0],
						hardSkills: ['typescript', 'TYPESCRIPT', ' kafka ', 'Rust'],
						softSkills: ['LEADERSHIP']
					}
				]
			}),
			['TypeScript', 'Kafka', 'Leadership']
		);
		expect(result.projects[0].hardSkills).toEqual(['TypeScript', 'Kafka', 'Rust']);
		expect(result.projects[0].softSkills).toEqual(['Leadership']);
	});

	it('gives each project its own client id', () => {
		const project = extracted().projects[0];
		const result = extractedToForm(extracted({ projects: [project, project] }));
		expect(result.projects[0].id).not.toBe(result.projects[1].id);
	});
});

describe('duplicate detection', () => {
	it('matches title and company ignoring case, accents, punctuation and spacing', () => {
		expect(experienceKey('Senior  Engineer', 'ACME, Inc.')).toBe(
			experienceKey('senior engineer', 'Acme Inc')
		);
		expect(experienceKey('Ingénieur logiciel', 'Société Générale')).toBe(
			experienceKey('Ingenieur Logiciel', 'societe generale')
		);
	});

	it('needs the same company: a title alone is no duplicate', () => {
		const existing = existingExperienceKeys([
			{ title: 'Senior Engineer', company: { name: 'Acme' } },
			{ title: 'Freelance developer', company: null }
		]);
		expect(isDuplicateDraft(form({ title: 'senior engineer' }), existing)).toBe(true);
		expect(isDuplicateDraft(form({ company: { name: 'Globex' } }), existing)).toBe(false);
		expect(
			isDuplicateDraft(form({ title: 'Freelance Developer', company: { name: '' } }), existing)
		).toBe(true);
		expect(
			isDuplicateDraft(form({ title: 'Freelance Developer', company: { name: 'Acme' } }), existing)
		).toBe(false);
	});

	it('leaves duplicates unticked in a new review', () => {
		const review = reviewFromResult(
			{
				experiences: [extracted(), extracted({ title: 'Staff Engineer' })],
				warnings: ['Shortened 1 text that was too long']
			},
			{
				fileName: 'cv.pdf',
				existing: existingExperienceKeys([{ title: 'Senior Engineer', company: { name: 'ACME' } }]),
				knownSkills: ['TypeScript'],
				now: new Date('2026-11-05T10:00:00.000Z')
			}
		);
		expect(review).toMatchObject({
			fileName: 'cv.pdf',
			importedAt: '2026-11-05T10:00:00.000Z',
			warnings: ['Shortened 1 text that was too long']
		});
		expect(review.drafts.map((draft) => [draft.form.title, draft.selected, draft.status])).toEqual([
			['Senior Engineer', false, 'pending'],
			['Staff Engineer', true, 'pending']
		]);
		expect(review.drafts[1].form.projects[0].hardSkills).toEqual(['TypeScript', 'Kafka']);
		expect(new Set(review.drafts.map((draft) => draft.id)).size).toBe(2);
	});
});

describe('review helpers', () => {
	const review = (drafts: Partial<ImportReview['drafts'][number]>[]): ImportReview => ({
		fileName: 'cv.pdf',
		importedAt: '2026-11-05T10:00:00.000Z',
		warnings: [],
		drafts: drafts.map((draft, index) => ({
			id: `d${index}`,
			form: form(),
			selected: true,
			status: 'pending',
			...draft
		}))
	});

	it('adds the ticked drafts not added yet, and is over once all are added', () => {
		const current = review([
			{ selected: true },
			{ selected: false },
			{ selected: true, status: 'added' },
			{ selected: true, status: 'failed' }
		]);
		expect(draftsToAdd(current).map((draft) => draft.id)).toEqual(['d0', 'd3']);
		expect(allDraftsAdded(current)).toBe(false);
		expect(allDraftsAdded(review([{ status: 'added' }, { status: 'added' }]))).toBe(true);
	});

	it('lists what the editor would refuse', () => {
		const problems = draftProblems(review([{ form: form({ end: '' }) }]).drafts[0]);
		expect(problems.map((problem) => problem.field)).toEqual(['end']);
		expect(problemsText(problems)).toBe(
			'End: Choose the end month, or tick “I currently work here”.'
		);
		expect(
			problemsText([
				...problems,
				{ field: 'title', label: 'Title', message: 'Enter a title.' },
				{ field: 'start', label: 'Start', message: 'x' }
			])
		).toBe('End: Choose the end month, or tick “I currently work here”. (and 2 more)');
		expect(problemsText([])).toBe('');
	});

	it('describes the period of a draft', () => {
		expect(draftPeriodText(form())).toBe('Mar 2021 – Jun 2024');
		expect(draftPeriodText(form({ end: '', ongoing: true }))).toBe('Mar 2021 – Present');
		expect(draftPeriodText(form({ end: '' }))).toBe('From Mar 2021');
		expect(draftPeriodText(form({ start: '' }))).toBe('Until Jun 2024');
		const project = { ...emptyProject(), start: '2020-02', end: '2020-05' };
		expect(draftPeriodText(form({ start: '', end: '', projects: [project] }))).toBe(
			'Feb 2020 – May 2020'
		);
		expect(draftPeriodText(form({ start: '', end: '' }))).toBe('');
	});

	it('previews the first lines of a summary as plain text', () => {
		expect(
			summaryPreview(
				'## Context\n\n- Led **6 engineers**\n* Built [the portal](https://x.y)\n1. Cut `p95`\n- Fourth'
			)
		).toBe('Context\n• Led 6 engineers\n• Built the portal');
		expect(summaryPreview('')).toBe('');
	});

	it('unticks the drafts the portfolio already has, not the added ones', () => {
		const current = review([
			{ form: form({ title: 'Engineer', company: { name: 'Acme' } }) },
			{ form: form({ title: 'Designer', company: { name: 'Acme' } }) },
			{ form: form({ title: 'Engineer', company: { name: 'Acme' } }), status: 'added' }
		]);
		untickDuplicates(
			current,
			existingExperienceKeys([{ title: 'engineer', company: { name: 'ACME' } }])
		);
		expect(current.drafts.map((draft) => draft.selected)).toEqual([false, true, true]);
	});

	it('takes in the changes the editor kept for its drafts', () => {
		const current = review([
			{ form: form({ title: 'First' }) },
			{ form: form({ title: 'Second' }), status: 'failed', error: 'Could not add it.' },
			{ form: form({ title: 'Third' }), status: 'added' },
			{ form: form({ title: 'Fourth' }) }
		]);
		const kept = new Map([
			['d1', form({ title: 'Second, rewritten' })],
			['d2', form({ title: 'Third, rewritten' })],
			['d3', form({ title: 'Fourth, rewritten' })]
		]);
		expect(applyEditedDrafts(current, (id) => kept.get(id))).toEqual(['d1', 'd3']);
		expect(current.drafts.map((draft) => draft.form.title)).toEqual([
			'First',
			'Second, rewritten',
			'Third',
			'Fourth, rewritten'
		]);
		// Its error was about the form before the changes
		expect(current.drafts[1]).toMatchObject({ status: 'pending', selected: true });
		expect(current.drafts[1].error).toBeUndefined();
		expect(applyEditedDrafts(current, () => undefined)).toEqual([]);
	});

	it('lists the distinct skills of the projects', () => {
		const projects = [
			{ ...emptyProject(), hardSkills: ['TypeScript', 'Kafka'], softSkills: ['Leadership'] },
			{ ...emptyProject(), hardSkills: ['typescript', 'Go'], softSkills: [] }
		];
		expect(draftSkills(form({ projects }))).toEqual(['TypeScript', 'Kafka', 'Leadership', 'Go']);
	});
});

describe('stored review', () => {
	const stored = (overrides: Record<string, unknown> = {}) => ({
		version: 1,
		fileName: 'cv.pdf',
		importedAt: '2026-11-05T10:00:00.000Z',
		warnings: ['A warning'],
		drafts: [
			{ id: 'a', form: form(), selected: true, status: 'pending' },
			{ id: 'b', form: form({ title: 'Staff' }), selected: false, status: 'added' },
			{ id: 'c', form: form({ title: 'CTO' }), selected: true, status: 'failed', error: 'Nope' }
		],
		...overrides
	});

	it('round-trips through storage', () => {
		const storage = new MemoryStorage();
		const key = importStorageKey('user1', 'jane.doe');
		expect(key).toBe('resumeImport:user1:jane.doe');
		const review = parseImportReview(stored())!;
		saveImportReview(key, review, storage);
		expect(loadImportReview(key, storage)).toEqual(review);
		expect(JSON.parse(storage.getItem(key)!).version).toBe(1);
		clearImportReview(key, storage);
		expect(loadImportReview(key, storage)).toBeUndefined();
	});

	it('keeps statuses, the failure message and the selection', () => {
		const review = parseImportReview(stored())!;
		expect(
			review.drafts.map(({ id, selected, status, error }) => ({ id, selected, status, error }))
		).toEqual([
			{ id: 'a', selected: true, status: 'pending', error: undefined },
			{ id: 'b', selected: false, status: 'added', error: undefined },
			{ id: 'c', selected: true, status: 'failed', error: 'Nope' }
		]);
		expect(review.drafts[0].form).toEqual(form());
		expect(review.warnings).toEqual(['A warning']);
	});

	it('repairs what it can of a damaged review', () => {
		const review = parseImportReview(
			stored({
				fileName: 42,
				importedAt: 'yesterday',
				warnings: ['Kept', 3],
				drafts: [
					null,
					'draft',
					{ id: 'a', form: 'not a form' },
					{ id: 'x', form: { title: 'One' }, selected: 'yes', status: 'weird' },
					{ id: 'x', form: { title: 'Two' }, selected: true, status: 'added' }
				]
			})
		)!;
		expect(review.fileName).toBe('');
		expect(review.importedAt).toBe('1970-01-01T00:00:00.000Z');
		expect(review.warnings).toEqual(['Kept']);
		expect(review.drafts.map((draft) => [draft.form.title, draft.selected, draft.status])).toEqual([
			['One', false, 'pending'],
			// An added draft is never ticked again
			['Two', false, 'added']
		]);
		expect(review.drafts[1].id).not.toBe('x');
	});

	it('holds no review without drafts, another version, or invalid data', () => {
		expect(parseImportReview(stored({ drafts: [] }))).toBeUndefined();
		expect(parseImportReview(stored({ version: 2 }))).toBeUndefined();
		expect(parseImportReview(null)).toBeUndefined();
		expect(parseImportReview([stored()])).toBeUndefined();
		const storage = new MemoryStorage();
		storage.setItem('k', '{not json');
		expect(loadImportReview('k', storage)).toBeUndefined();
	});

	it('survives storage that throws', () => {
		const broken = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		};
		const review = parseImportReview(stored())!;
		expect(() => saveImportReview('k', review, broken)).not.toThrow();
		expect(loadImportReview('k', broken)).toBeUndefined();
		expect(() => clearImportReview('k', broken)).not.toThrow();
		expect(serializeImportReview(review)).toContain('"version":1');
	});
});

describe('the file', () => {
	const pdf = { name: 'cv.pdf', type: 'application/pdf', size: 200_000 };

	it('takes PDFs of up to 4 MB', () => {
		expect(resumeFileProblem(pdf)).toBeUndefined();
		expect(resumeFileProblem({ ...pdf, size: MAX_RESUME_PDF_BYTES })).toBeUndefined();
		// Some systems give no type: the extension is enough
		expect(resumeFileProblem({ ...pdf, name: 'CV.PDF', type: '' })).toBeUndefined();
		expect(resumeFileProblem({ ...pdf, size: MAX_RESUME_PDF_BYTES + 1 })).toBe(
			'This PDF is 4 MB: the import takes files of up to 4 MB. Export a lighter version (fewer images) and try again.'
		);
		expect(resumeFileProblem({ ...pdf, size: 6_500_000 })).toContain('This PDF is 6.2 MB');
		expect(resumeFileProblem({ ...pdf, size: 0 })).toBe('This file is empty. Choose another PDF.');
		expect(resumeFileProblem({ name: 'cv.docx', type: 'application/msword', size: 10 })).toBe(
			'Choose a PDF file: the import only reads PDF résumés.'
		);
	});

	it('recognises a PDF by its first bytes', () => {
		expect(hasPdfHeader(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
		expect(hasPdfHeader(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false);
		expect(hasPdfHeader(new Uint8Array())).toBe(false);
	});

	it('keeps the base64 of a data URL', () => {
		expect(base64OfDataUrl('data:application/pdf;base64,JVBERi0=')).toBe('JVBERi0=');
	});

	it('formats sizes', () => {
		expect(formatFileSize(300)).toBe('1 KB');
		expect(formatFileSize(820 * 1024)).toBe('820 KB');
		expect(formatFileSize(3.44 * 1024 * 1024)).toBe('3.4 MB');
		expect(formatFileSize(2 * 1024 * 1024)).toBe('2 MB');
	});
});

describe('quota and messages', () => {
	it('says how many imports are left', () => {
		expect(quotaText({ limit: 3, remaining: 2 })).toBe('2 of 3 imports left this month');
		expect(quotaText({ limit: 1, remaining: 0 })).toBe('0 of 1 import left this month');
	});

	it('formats the reset date, naming its time zone', () => {
		expect(formatResetDate('2026-11-20T13:05:00.000Z', 'UTC')).toBe('Nov 20, 1:05 PM UTC');
		expect(formatResetDate('2026-11-20T13:05:00.000Z', 'Europe/Paris')).toBe(
			'Nov 20, 2:05 PM GMT+1'
		);
		expect(formatResetDate(null)).toBe('');
		expect(formatResetDate('soon')).toBe('');
	});

	it('formats the elapsed time', () => {
		expect(formatElapsed(0)).toBe('0:00');
		expect(formatElapsed(42.7)).toBe('0:42');
		expect(formatElapsed(185)).toBe('3:05');
	});

	it('shows the API’s message for the errors it explains', () => {
		const message = 'You have used your 3 résumé imports for this period.';
		for (const status of [404, 413, 422, 429, 503]) {
			expect(importErrorMessage(status, `  ${message}  `)).toBe(message);
		}
		expect(importErrorMessage(401, 'Unauthorized')).toBe(
			'Your session expired. Sign in again, then import your résumé.'
		);
		// No usable text: a default per status
		expect(importErrorMessage(429, '')).toBe(
			'You have used all your imports for now. Try again later.'
		);
		expect(importErrorMessage(503, '<html>Bad gateway</html>')).toBe(
			'Résumé import is temporarily unavailable, try again later.'
		);
		expect(importErrorMessage(422, { type: 'validation', message: 'Expected string' })).toBe(
			'This file could not be read as a résumé. Choose another PDF.'
		);
		expect(importErrorMessage(500, 'Internal Server Error')).toBe(
			'The import failed. Try again in a moment.'
		);
		expect(importErrorMessage(undefined, undefined)).toBe(
			'The import failed. Try again in a moment.'
		);
	});

	it('waits for an import longer than the API can take, with a margin for the upload', () => {
		expect(IMPORT_CLIENT_TIMEOUT_MS).toBeGreaterThanOrEqual(
			RESUME_IMPORT_TIMEOUTS.countMs + RESUME_IMPORT_TIMEOUTS.extractMs + 60_000
		);
	});

	it('says to edit the drafts refused for their content, and to retry the others', () => {
		expect([400, 413, 422].map(saveErrorNeedsEdit)).toEqual([true, true, true]);
		expect([500, 503, undefined].map(saveErrorNeedsEdit)).toEqual([false, false, false]);
		expect(failedDraftsText(1, 1)).toBe(
			'1 experience could not be added. Edit it to fix the problem, then add it again.'
		);
		expect(failedDraftsText(2, 2)).toBe(
			'2 experiences could not be added. Edit them to fix the problem, then add them again.'
		);
		expect(failedDraftsText(1, 0)).toBe(
			'1 experience could not be added. Try adding it again in a moment.'
		);
		expect(failedDraftsText(2, 0)).toBe(
			'2 experiences could not be added. Try adding them again in a moment.'
		);
		expect(failedDraftsText(3, 1)).toBe(
			'3 experiences could not be added. Edit the ones marked with a problem, then add them again.'
		);
	});

	it('explains why a draft could not be added, naming fields as the editor does', () => {
		const draft = form({
			projects: [
				{ ...emptyProject() },
				{ ...emptyProject(), name: 'Second' },
				{ ...emptyProject(), name: 'Third' }
			]
		});
		const invalid = (property: string, message = 'Too long') => ({
			type: 'validation',
			on: 'body',
			property,
			message
		});
		expect(saveErrorMessage(422, invalid('title'), draft)).toBe('Title: Too long');
		// The blank first project is not sent: index 1 of the request is the form's third project
		expect(saveErrorMessage(422, invalid('projects.1.name'), draft)).toBe(
			'Project 3 · Name: Too long'
		);
		expect(saveErrorMessage(422, invalid('root', 'Bad'), draft)).toBe('Bad');
		expect(saveErrorMessage(422, 'Skill name too long', draft)).toBe('Skill name too long');
		expect(saveErrorMessage(422, {}, draft)).toBe('Some fields are invalid: edit it to fix them.');
		expect(saveErrorMessage(413, 'Payload Too Large', draft)).toBe(
			'This experience is too large: shorten its texts.'
		);
		expect(saveErrorMessage(500, 'Internal Server Error', draft)).toBe(
			'Could not add it. Try again in a moment.'
		);
	});
});
