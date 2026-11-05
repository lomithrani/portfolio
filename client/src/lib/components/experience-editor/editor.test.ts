import { describe, it, expect } from 'vitest';
import { EXPERIENCE_LIMITS, ExperienceType } from 'portfolio-common';
import type { Experience } from 'portfolio-api/models/database';
import {
	emptyExperienceForm,
	emptyProject,
	formSignature,
	type FormData
} from '#services/experienceForm.ts';
import { fitWithin, iconFits, iconKind } from './icon';
import {
	clearDraft,
	draftStorageKey,
	loadDraft,
	removeLegacyDraft,
	saveDraft,
	startingForms
} from './drafts';

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

describe('drafts', () => {
	const form: FormData = { ...emptyExperienceForm(), title: 'Draft', type: ExperienceType.Leisure };

	it('scopes drafts per user and domain, and per experience', () => {
		expect(draftStorageKey('u1:jane.doe')).toBe('experienceDraft:u1:jane.doe:new');
		expect(draftStorageKey('u1:jane.doe', 'e1')).toBe('experienceDraft:u1:jane.doe:e1');
	});

	it('saves, loads and clears a draft', () => {
		const storage = new MemoryStorage();
		const key = draftStorageKey('u1:jane.doe');
		saveDraft(key, form, storage);
		expect(loadDraft(key, storage)).toEqual(form);
		expect(loadDraft(draftStorageKey('u2:jane.doe'), storage)).toBeUndefined();
		clearDraft(key, storage);
		expect(loadDraft(key, storage)).toBeUndefined();
	});

	it('ignores corrupt drafts', () => {
		const storage = new MemoryStorage();
		storage.setItem('k', '{not json');
		expect(loadDraft('k', storage)).toBeUndefined();
		storage.setItem('k', '"text"');
		expect(loadDraft('k', storage)).toBeUndefined();
	});

	it('never throws when storage is blocked or full', () => {
		expect(loadDraft('k', throwing)).toBeUndefined();
		expect(() => saveDraft('k', form, throwing)).not.toThrow();
		expect(() => clearDraft('k', throwing)).not.toThrow();
		expect(() => removeLegacyDraft(throwing)).not.toThrow();
		expect(loadDraft('k', undefined)).toBeUndefined();
	});

	it('removes the global draft of older clients', () => {
		const storage = new MemoryStorage();
		storage.setItem('newExperience', '{}');
		removeLegacyDraft(storage);
		expect(storage.getItem('newExperience')).toBeNull();
	});
});

describe('startingForms', () => {
	const experience = {
		_id: 'e1',
		title: 'Staff Engineer',
		type: ExperienceType.Professional,
		summary: 'Saved',
		start: '2024-03-01T00:00:00.000Z',
		projects: []
	} as unknown as Experience;
	const prefilled: FormData = {
		...emptyExperienceForm(),
		title: 'From my résumé',
		projects: [{ ...emptyProject(), name: 'Imported project', start: '2021-02', end: '2022-06' }]
	};
	const draft: FormData = { ...emptyExperienceForm(), title: 'Typed before a reload' };

	it('starts an add form empty, or from the stored add draft', () => {
		const empty = startingForms({}, () => undefined);
		expect(empty.restored).toBe(false);
		expect(formSignature(empty.form)).toBe(formSignature(emptyExperienceForm()));

		const restored = startingForms({ experience: null }, () => draft);
		expect(restored).toMatchObject({ restored: true, form: draft });
		expect(formSignature(restored.baseline)).toBe(formSignature(emptyExperienceForm()));
	});

	it('starts an edit form from the experience, or from its draft', () => {
		const opened = startingForms({ experience }, () => undefined);
		expect(opened.restored).toBe(false);
		expect(opened.form).toMatchObject({ title: 'Staff Engineer', start: '2024-03', ongoing: true });
		expect(opened.form).not.toBe(opened.baseline);

		const edited = { ...opened.baseline, title: 'Principal Engineer' };
		expect(startingForms({ experience }, () => edited)).toMatchObject({
			restored: true,
			form: { title: 'Principal Engineer' },
			baseline: { title: 'Staff Engineer' }
		});
	});

	it('does not announce a draft equal to the saved state', () => {
		const same = startingForms({ experience }, () => undefined).baseline;
		expect(startingForms({ experience }, () => structuredClone(same)).restored).toBe(false);
	});

	it('starts from a prefilled add form, never restoring the add draft over it', () => {
		let read = false;
		const start = startingForms({ initialForm: prefilled }, () => {
			read = true;
			return draft;
		});
		expect(read).toBe(false);
		expect(start.restored).toBe(false);
		expect(start.form).toEqual(prefilled);
		// The baseline of the dirty check: untouched, the prefilled form is not "unsaved changes"
		expect(formSignature(start.baseline)).toBe(formSignature(prefilled));
		expect(start.form).not.toBe(prefilled);
		expect(start.form.projects[0]).not.toBe(prefilled.projects[0]);
	});

	it('repairs a prefilled form like a stored draft', () => {
		const loose = {
			...prefilled,
			ongoing: true,
			start: '2020-01',
			end: '2020-05',
			projects: [prefilled.projects[0], { ...prefilled.projects[0] }]
		};
		const { form } = startingForms({ initialForm: loose }, () => undefined);
		// Ongoing means no end; two projects never share an id
		expect(form).toMatchObject({ start: '2020-01', end: '', ongoing: true });
		expect(new Set(form.projects.map((project) => project.id)).size).toBe(2);
	});

	it('ignores the prefilled form in edit mode', () => {
		const start = startingForms({ experience, initialForm: prefilled }, () => undefined);
		expect(start.form.title).toBe('Staff Engineer');
	});
});

describe('icon helpers', () => {
	it('accepts PNG, JPEG, WebP, SVG and ICO', () => {
		expect(iconKind({ type: 'image/png', name: 'a.png' })?.kind).toBe('raster');
		expect(iconKind({ type: 'image/jpeg', name: 'a.jpg' })?.kind).toBe('raster');
		expect(iconKind({ type: 'image/webp', name: 'a.webp' })?.kind).toBe('raster');
		expect(iconKind({ type: 'image/svg+xml', name: 'a.svg' })?.kind).toBe('svg');
		expect(iconKind({ type: 'image/vnd.microsoft.icon', name: 'a.ico' })).toEqual({
			kind: 'ico',
			type: 'image/x-icon'
		});
	});

	it('falls back on the extension when the browser gives no type', () => {
		expect(iconKind({ type: '', name: 'favicon.ICO' })).toEqual({
			kind: 'ico',
			type: 'image/x-icon'
		});
		expect(iconKind({ type: '', name: 'logo.svg' })?.kind).toBe('svg');
		expect(iconKind({ type: '', name: 'notes.txt' })).toBeUndefined();
	});

	it('refuses other types', () => {
		expect(iconKind({ type: 'image/gif', name: 'a.gif' })).toBeUndefined();
		expect(iconKind({ type: 'application/pdf', name: 'a.png' })).toBeUndefined();
	});

	it('scales down to fit, keeping the ratio and never upscaling', () => {
		expect(fitWithin(1024, 512)).toEqual({ width: 128, height: 64 });
		expect(fitWithin(300, 900, 96)).toEqual({ width: 32, height: 96 });
		expect(fitWithin(64, 32)).toEqual({ width: 64, height: 32 });
		expect(fitWithin(5000, 1)).toEqual({ width: 128, height: 1 });
		// An SVG without an intrinsic size
		expect(fitWithin(0, 0)).toEqual({ width: 128, height: 128 });
	});

	it('checks the stored size limit', () => {
		expect(iconFits('x'.repeat(EXPERIENCE_LIMITS.icon))).toBe(true);
		expect(iconFits('x'.repeat(EXPERIENCE_LIMITS.icon + 1))).toBe(false);
	});
});
