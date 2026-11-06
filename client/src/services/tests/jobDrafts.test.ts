import { describe, it, expect } from 'vitest';
import {
	clearImportedDraft,
	clearJobDraft,
	editorDraftStorageKey,
	importEditsStorageKey,
	importedDraftStorageKey,
	jobDraftStorageKey,
	jobFormFromStorage,
	loadImportedDraft,
	loadJobDraft,
	saveImportedDraft,
	saveJobDraft,
	startingJobForms,
	draftBasis,
	hasPendingText
} from '../jobDrafts';
import { emptyJobForm, jobFormSignature, jobToForm, type JobForm } from '../jobPosting';

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

const throwing = {
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

const filledForm = (overrides: Partial<JobForm> = {}): JobForm => ({
	...emptyJobForm(),
	title: 'Backend engineer',
	city: 'Lyon',
	skills: ['Go'],
	...overrides
});

describe('storage keys', () => {
	it('scopes drafts per user and posting', () => {
		expect(jobDraftStorageKey('u1')).toBe('jobDraft:u1:new');
		expect(jobDraftStorageKey('u1', 'j9')).toBe('jobDraft:u1:j9');
		expect(importedDraftStorageKey('u1')).toBe('jobImportDraft:u1');
		expect(importEditsStorageKey('u1')).toBe('jobDraft:u1:import');
	});

	it('keeps a blank form, an import and each posting under keys of their own', () => {
		expect(editorDraftStorageKey('u1')).toBe('jobDraft:u1:new');
		expect(editorDraftStorageKey('u1', { imported: true })).toBe('jobDraft:u1:import');
		expect(editorDraftStorageKey('u1', { jobId: 'j9' })).toBe('jobDraft:u1:j9');
		expect(editorDraftStorageKey('u1', { jobId: 'j9', imported: true })).toBe('jobDraft:u1:j9');
		expect(new Set([jobDraftStorageKey('u1'), importEditsStorageKey('u1')]).size).toBe(2);
	});
});

describe('jobFormFromStorage', () => {
	it('keeps the fields of the right type and drops the others', () => {
		const form = jobFormFromStorage({
			title: 'Data analyst',
			city: 42,
			status: 'open',
			workMode: 'moon',
			contractType: 'cdi',
			durationMonths: '6',
			startDate: 'next week',
			seniority: 'senior',
			education: 'phd',
			skills: ['SQL', 3, 'Python'],
			unknown: 'field'
		});
		expect(form).toEqual({
			...emptyJobForm(),
			title: 'Data analyst',
			status: 'open',
			seniority: 'senior',
			skills: ['SQL', 'Python']
		});
	});

	it('is undefined for what is not a form', () => {
		expect(jobFormFromStorage(null)).toBeUndefined();
		expect(jobFormFromStorage('form')).toBeUndefined();
		expect(jobFormFromStorage([])).toBeUndefined();
	});
});

describe('editor drafts', () => {
	it('saves, loads and clears a draft', () => {
		const storage = new MemoryStorage();
		const key = jobDraftStorageKey('u1');
		saveJobDraft(key, { form: filledForm(), basis: 'b' }, storage);
		expect(loadJobDraft(key, storage)).toEqual({ form: filledForm(), basis: 'b' });
		clearJobDraft(key, storage);
		expect(loadJobDraft(key, storage)).toBeUndefined();
	});

	it('ignores unreadable drafts and blocked storage', () => {
		const storage = new MemoryStorage();
		storage.setItem('jobDraft:u1:new', '{not json');
		expect(loadJobDraft('jobDraft:u1:new', storage)).toBeUndefined();
		storage.setItem('jobDraft:u1:new', JSON.stringify({ basis: 'b' }));
		expect(loadJobDraft('jobDraft:u1:new', storage)).toBeUndefined();
		expect(loadJobDraft('k', throwing)).toBeUndefined();
		expect(() => saveJobDraft('k', { form: filledForm() }, throwing)).not.toThrow();
		expect(() => clearJobDraft('k', throwing)).not.toThrow();
		expect(loadJobDraft('k', undefined)).toBeUndefined();
	});
});

describe('imported drafts', () => {
	const imported = {
		draft: {
			title: 'Product designer',
			status: 'draft' as const,
			location: { country: 'FR' as const, city: 'Nantes' },
			contract: { type: 'cdd' as const, startDate: new Date('2027-02-01T00:00:00Z') }
		},
		warnings: ['The pay was not found'],
		fileName: 'designer.pdf'
	};

	it('saves and loads the import of a user (dates come back as strings)', () => {
		const storage = new MemoryStorage();
		saveImportedDraft('u1', imported, storage);
		const loaded = loadImportedDraft('u1', storage);
		expect(loaded?.warnings).toEqual(['The pay was not found']);
		expect(loaded?.fileName).toBe('designer.pdf');
		expect(loaded?.draft.contract?.startDate).toBe('2027-02-01T00:00:00.000Z');
		expect(jobToForm(loaded!.draft).startDate).toBe('2027-02-01');
		expect(loadImportedDraft('u2', storage)).toBeUndefined();
		clearImportedDraft('u1', storage);
		expect(loadImportedDraft('u1', storage)).toBeUndefined();
	});

	it('removes the changes made to an import with it, never the draft of a blank form', () => {
		const storage = new MemoryStorage();
		const blankDraft = { form: filledForm({ title: 'Blank draft' }), basis: 'blank' };
		saveJobDraft(jobDraftStorageKey('u1'), blankDraft, storage);
		saveImportedDraft('u1', imported, storage);
		const importEdits = { form: filledForm({ title: 'Imported, edited' }), basis: 'import' };
		saveJobDraft(importEditsStorageKey('u1'), importEdits, storage);
		expect(loadJobDraft(jobDraftStorageKey('u1'), storage)).toEqual(blankDraft);

		// A new import replaces the previous one and the changes made to it
		saveImportedDraft('u1', { ...imported, fileName: 'other.pdf' }, storage);
		expect(loadJobDraft(importEditsStorageKey('u1'), storage)).toBeUndefined();
		expect(loadImportedDraft('u1', storage)?.fileName).toBe('other.pdf');

		saveJobDraft(importEditsStorageKey('u1'), importEdits, storage);
		clearImportedDraft('u1', storage);
		expect(loadImportedDraft('u1', storage)).toBeUndefined();
		expect(loadJobDraft(importEditsStorageKey('u1'), storage)).toBeUndefined();
		expect(loadJobDraft(jobDraftStorageKey('u1'), storage)).toEqual(blankDraft);
	});

	it('cleans what it reads back', () => {
		const storage = new MemoryStorage();
		storage.setItem(
			importedDraftStorageKey('u1'),
			JSON.stringify({ draft: { title: 'X' }, warnings: ['ok', 1], fileName: 7 })
		);
		expect(loadImportedDraft('u1', storage)).toEqual({
			draft: { title: 'X' },
			warnings: ['ok'],
			fileName: ''
		});
		storage.setItem(importedDraftStorageKey('u1'), JSON.stringify({ warnings: [] }));
		expect(loadImportedDraft('u1', storage)).toBeUndefined();
		storage.setItem(
			importedDraftStorageKey('u1'),
			JSON.stringify({ draft: { requirements: { skills: 5 } } })
		);
		expect(loadImportedDraft('u1', storage)).toBeUndefined();
		expect(loadImportedDraft('u1', throwing)).toBeUndefined();
	});
});

describe('startingJobForms', () => {
	const blank = emptyJobForm();

	it('starts from an empty form without a draft', () => {
		const start = startingJobForms({}, () => undefined);
		expect(start).toEqual({
			baseline: blank,
			form: blank,
			restored: false,
			stale: false,
			basis: draftBasis(blank),
			draftBasis: draftBasis(blank),
			pending: { skills: '', languages: '', benefits: '' }
		});
	});

	it('restores text typed in a list and not added yet, even as the only change', () => {
		const storage = new MemoryStorage();
		const key = jobDraftStorageKey('u1', 'j1');
		const job = {
			title: 'Backend engineer',
			description: 'Build things',
			status: 'open' as const,
			location: { country: 'FR' as const, city: 'Lyon', workMode: 'on_site' as const }
		};
		const form = jobToForm(job);
		saveJobDraft(
			key,
			{
				form,
				basis: draftBasis(form),
				pending: { skills: 'Rust', languages: '', benefits: 'Gym' }
			},
			storage
		);

		const start = startingJobForms({ job }, () => loadJobDraft(key, storage));

		expect(start.restored).toBe(true);
		expect(start.pending).toEqual({ skills: 'Rust', languages: '', benefits: 'Gym' });
		expect(hasPendingText(start.pending)).toBe(true);
		// Blank text alone is no change; what is not text is dropped
		saveJobDraft(key, { form, pending: { skills: '  ', languages: '', benefits: '' } }, storage);
		expect(startingJobForms({ job }, () => loadJobDraft(key, storage)).restored).toBe(false);
		storage.setItem(key, JSON.stringify({ form, pending: { skills: 3, languages: 'English' } }));
		expect(loadJobDraft(key, storage)?.pending).toEqual({
			skills: '',
			languages: 'English',
			benefits: ''
		});
	});

	it('restores the draft of a blank form', () => {
		const draft = { form: filledForm(), basis: draftBasis(blank) };
		const start = startingJobForms({}, () => draft);
		expect(start.restored).toBe(true);
		expect(start.form).toEqual(filledForm());
		expect(start.baseline).toEqual(blank);
		expect(start.draftBasis).toBe(draftBasis(blank));
	});

	it('restores the draft of a blank form whatever basis it carries (its key says what it is)', () => {
		expect(startingJobForms({}, () => ({ form: filledForm() })).restored).toBe(true);
		expect(startingJobForms({}, () => ({ form: filledForm(), basis: 'older' })).restored).toBe(
			true
		);
	});

	it('does not restore a draft that does not differ from the start', () => {
		const start = startingJobForms({}, () => ({ form: emptyJobForm(), basis: draftBasis(blank) }));
		expect(start.restored).toBe(false);
	});

	it('starts from an import, and restores only the draft made from that import', () => {
		const imported = { title: 'Designer', location: { country: 'FR' as const, city: 'Nantes' } };
		const importForm = jobToForm(imported);
		const fresh = startingJobForms({ imported }, () => ({
			form: filledForm(),
			basis: draftBasis(blank)
		}));
		expect(fresh.restored).toBe(false);
		expect(fresh.form).toEqual(importForm);
		expect(fresh.basis).toBe(draftBasis(importForm));

		const edited = { ...importForm, title: 'Senior designer' };
		const back = startingJobForms({ imported }, () => ({
			form: edited,
			basis: draftBasis(importForm)
		}));
		expect(back.restored).toBe(true);
		expect(back.form.title).toBe('Senior designer');
		expect(back.baseline).toEqual(importForm);
	});

	it('restores the draft of a posting being edited, whatever it started from', () => {
		const job = {
			title: 'Backend engineer',
			description: 'Build things',
			status: 'open' as const,
			location: { country: 'FR' as const, city: 'Lyon', workMode: 'on_site' as const }
		};
		const edited = { ...jobToForm(job), title: 'Staff engineer' };
		const start = startingJobForms({ job }, () => ({ form: edited, basis: 'older' }));
		expect(start.restored).toBe(true);
		expect(start.stale).toBe(true);
		expect(start.form.title).toBe('Staff engineer');
		expect(jobFormSignature(start.baseline)).toBe(jobFormSignature(jobToForm(job)));
		const current = startingJobForms({ job }, () => ({
			form: edited,
			basis: draftBasis(jobToForm(job))
		}));
		expect(current.stale).toBe(false);
		expect(current.draftBasis).toBe(current.basis);
	});

	it('keeps the basis of a stale draft: it still warns after the next reload', () => {
		const job = {
			title: 'Backend engineer',
			description: 'Build things',
			status: 'open' as const,
			location: { country: 'FR' as const, city: 'Lyon', workMode: 'on_site' as const },
			pay: { min: 53000, max: 60000, currency: 'EUR' as const, period: 'year' as const }
		};
		const older = draftBasis(jobToForm({ ...job, pay: { ...job.pay, min: 52000 } }));
		const edited = { ...jobToForm(job), title: 'Staff engineer', payMin: '52000' };
		const storage = new MemoryStorage();
		const key = jobDraftStorageKey('u1', 'j1');
		saveJobDraft(key, { form: edited, basis: older }, storage);

		// First visit: stale; the editor stores the draft again with the basis it is given
		const first = startingJobForms({ job }, () => loadJobDraft(key, storage));
		expect(first.stale).toBe(true);
		expect(first.draftBasis).toBe(older);
		saveJobDraft(key, { form: first.form, basis: first.draftBasis }, storage);

		// Second visit: still stale
		const second = startingJobForms({ job }, () => loadJobDraft(key, storage));
		expect(second.stale).toBe(true);
		expect(second.form.payMin).toBe('52000');
	});

	it('restores an import draft only over the same import, and keeps it stale-free', () => {
		const imported = { title: 'Designer', location: { country: 'FR' as const, city: 'Nantes' } };
		const importForm = jobToForm(imported);
		const edited = { ...importForm, company: 'Acme' };
		const start = startingJobForms({ imported }, () => ({
			form: edited,
			basis: draftBasis(importForm)
		}));
		expect(start).toMatchObject({ restored: true, stale: false });
		expect(start.draftBasis).toBe(draftBasis(importForm));
		const other = startingJobForms({ imported }, () => ({ form: edited, basis: 'another import' }));
		expect(other.restored).toBe(false);
	});

	it('gives a copy of the baseline, not the same object', () => {
		const start = startingJobForms({}, () => undefined);
		start.form.skills.push('Go');
		expect(start.baseline.skills).toEqual([]);
	});
});
