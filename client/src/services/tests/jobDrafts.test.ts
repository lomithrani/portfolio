import { describe, it, expect } from 'vitest';
import { withLocale } from 'portfolio-common';
import {
	clearImportedDraft,
	clearJobDraft,
	duplicateDraftStorageKey,
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
	hasPendingText,
	heldTermsDraft,
	withHeldTerms
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
		expect(editorDraftStorageKey('u1', { duplicateOf: 'j9' })).toBe('jobDraft:u1:copy:j9');
		expect(duplicateDraftStorageKey('u1', 'j9')).toBe('jobDraft:u1:copy:j9');
		expect(
			new Set([
				jobDraftStorageKey('u1'),
				importEditsStorageKey('u1'),
				jobDraftStorageKey('u1', 'j9'),
				duplicateDraftStorageKey('u1', 'j9')
			]).size
		).toBe(4);
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

	it('leaves out the warnings of an import made in the other language, and says so', () => {
		const storage = new MemoryStorage();
		withLocale('fr', () => saveImportedDraft('u1', imported, storage));
		expect(JSON.parse(storage.getItem(importedDraftStorageKey('u1'))!).locale).toBe('fr');

		const inEnglish = loadImportedDraft('u1', storage)!;
		expect(inEnglish.warnings).toEqual([]);
		expect(inEnglish.warningsHidden).toBe(true);
		expect(inEnglish.fileName).toBe('designer.pdf');

		const inFrench = withLocale('fr', () => loadImportedDraft('u1', storage)!);
		expect(inFrench.warnings).toEqual(['The pay was not found']);
		expect(inFrench.warningsHidden).toBeUndefined();

		// Nothing to leave out: nothing to say
		withLocale('fr', () => saveImportedDraft('u1', { ...imported, warnings: [] }, storage));
		expect(loadImportedDraft('u1', storage)!.warningsHidden).toBeUndefined();
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
			pending: { skills: '', languages: '', benefits: '' },
			capped: false,
			droppedTerms: []
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

describe('startingJobForms of a copy (Duplicate)', () => {
	const source = {
		_id: 'j1',
		title: 'Backend engineer',
		description: 'Build things',
		status: 'open' as const,
		location: { country: 'FR' as const, city: 'Lyon', workMode: 'on_site' as const },
		pay: { min: 45000, max: 55000, currency: 'EUR' as const, period: 'year' as const },
		requirements: { skills: ['Go'] }
	};

	it('starts from every field of the posting, as a new draft', () => {
		const start = startingJobForms({ duplicate: source }, () => undefined);
		expect(start.baseline).toEqual({ ...jobToForm(source), status: 'draft' });
		expect(start.form).toEqual(start.baseline);
		expect(start.form).toMatchObject({ title: 'Backend engineer', city: 'Lyon', skills: ['Go'] });
		// No openings stated: the copy states none either
		expect(start.form.openings).toBe('');
		expect(start.restored).toBe(false);
	});

	it("restores the copy's draft whatever basis it carries (its key names the posting copied)", () => {
		const storage = new MemoryStorage();
		const key = editorDraftStorageKey('u1', { duplicateOf: source._id });
		const changed = { ...jobToForm(source), status: 'draft' as const, payMin: '50000' };
		saveJobDraft(key, { form: changed }, storage);

		const start = startingJobForms({ duplicate: source }, () => loadJobDraft(key, storage));

		expect(start.restored).toBe(true);
		expect(start.stale).toBe(false);
		expect(start.form.payMin).toBe('50000');
	});
});

describe('startingJobForms of an opened posting (its terms locked)', () => {
	const job = {
		_id: 'j1',
		title: 'Backend engineer',
		description: 'Build things',
		status: 'open' as const,
		location: { country: 'FR' as const, city: 'Lyon', workMode: 'on_site' as const },
		pay: { min: 45000, max: 55000, currency: 'EUR' as const, period: 'year' as const },
		requirements: { skills: ['Go'], languages: ['English'] }
	};
	const posting = jobToForm(job);

	it("keeps the draft's other changes, and the posting's terms", () => {
		const draft = {
			form: { ...posting, title: 'Staff engineer', payMin: '50000', description: 'New text' },
			basis: draftBasis(posting),
			pending: { skills: 'Rust', languages: 'German', benefits: '' }
		};

		const start = startingJobForms({ job, locked: true }, () => draft);

		expect(start.restored).toBe(true);
		expect(start.form).toEqual({ ...posting, description: 'New text' });
		// Text typed in a locked list goes too; in the others it stays
		expect(start.pending).toEqual({ skills: '', languages: 'German', benefits: '' });
		// The terms it changed are named, and the draft is given back as it was stored
		expect(start.droppedTerms).toEqual(['title', 'payMin', 'skills']);
		expect(start.typedDraft).toBe(draft);
		// Not locked: the draft comes back whole, nothing dropped
		const open = startingJobForms({ job }, () => draft);
		expect([open.form.title, open.droppedTerms, open.typedDraft]).toEqual([
			'Staff engineer',
			[],
			undefined
		]);
	});

	it('names the terms of a draft that changed its terms alone, without restoring it', () => {
		const draft = { form: { ...posting, title: 'Staff engineer' }, basis: draftBasis(posting) };
		const start = startingJobForms({ job, locked: true }, () => draft);
		expect(start.restored).toBe(false);
		expect(start.form).toEqual(posting);
		expect(start.droppedTerms).toEqual(['title']);
		expect(start.typedDraft).toBe(draft);
	});

	it('drops nothing for terms the API would not see change', () => {
		// Typed the same once normalised, or in a field that does not apply (an on-site job)
		const draft = {
			form: { ...posting, title: '  Backend   engineer ', remoteDaysPerWeek: '2' },
			basis: draftBasis(posting)
		};
		const start = startingJobForms({ job, locked: true }, () => draft);
		expect([start.droppedTerms, start.typedDraft]).toEqual([[], undefined]);
		expect(startingJobForms({ job, locked: true }, () => undefined).droppedTerms).toEqual([]);
	});

	it('keeps held terms over the form, and over the posting once its other changes are saved', () => {
		const held = {
			form: { ...posting, title: 'Staff engineer', payMin: '50000', description: 'Old text' },
			pending: { skills: 'Rust', languages: 'German', benefits: '' }
		};
		const kept = withHeldTerms(
			{ ...posting, description: 'New text' },
			{ skills: '', languages: 'French', benefits: '' },
			held
		);
		// The terms are the held ones, the rest the form's (a locked list's text included)
		expect(kept.form).toEqual({
			...posting,
			title: 'Staff engineer',
			payMin: '50000',
			description: 'New text'
		});
		expect(kept.pending).toEqual({ skills: 'Rust', languages: 'French', benefits: '' });

		const saved = { ...job, description: 'New text' };
		const draft = heldTermsDraft(saved, held);
		expect(draft.form).toEqual({ ...jobToForm(saved), title: 'Staff engineer', payMin: '50000' });
		expect(draft.pending).toEqual({ skills: 'Rust', languages: '', benefits: '' });
		// Read again, the posting as saved: nothing else to restore, the terms still named
		const again = startingJobForms({ job: saved, locked: true }, () => draft);
		expect([again.restored, again.droppedTerms]).toEqual([false, ['title', 'payMin', 'skills']]);
	});

	it('shows a range saved wider than the cap with the top it is scored with', () => {
		const wide = { ...job, pay: { ...job.pay, max: 80000 } };
		const start = startingJobForms({ job: wide, locked: true }, () => undefined);
		expect(start.capped).toBe(true);
		expect([start.baseline.payMax, start.form.payMax]).toEqual(['67500', '67500']);
		// Its baseline: no change to save until something else changes
		expect(start.restored).toBe(false);
		expect(startingJobForms({ job: wide }, () => undefined).capped).toBe(false);
	});
});
