import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { EXPERIENCE_LIMITS, ExperienceType, withLocale } from 'portfolio-common';
import type { Experience } from 'portfolio-api/models/database';
import {
	emptyExperienceForm,
	emptyProject,
	formSignature,
	type FormData
} from '#services/experienceForm.ts';
import {
	mergeSkillSuggestions,
	suggestionKeyAction,
	type SkillOption
} from '#services/skillSearch.ts';
import SkillSuggestions from './SkillSuggestions.svelte';
import suggestionsSource from './SkillSuggestions.svelte?raw';
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

// The suggestions of a skills field as they render (SkillSuggestions.svelte), from what the field
// gives it: the owner's own skills merged with the catalogue's answer (services/skillSearch.ts)
describe('the suggestions of a skills field', () => {
	/** The markup's text, as a reader gets it: tags dropped, spaces collapsed */
	const textOf = (body: string) =>
		body
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&#39;/g, "'")
			.replace(/\s+/g, ' ')
			.trim();

	/** Each option of the list: its attributes, and its text */
	const optionsOf = (body: string) =>
		[...body.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)].map(([, attributes, content]) => ({
			id: /\sid="([^"]*)"/.exec(attributes)?.[1],
			name: /aria-label="([^"]*)"/.exec(attributes)?.[1].replace(/&amp;/g, '&'),
			selected: /aria-selected="([^"]*)"/.exec(attributes)?.[1],
			source: /data-skill-option="([^"]*)"/.exec(attributes)?.[1],
			text: textOf(content)
		}));

	/** What the field suggests for "k": two of the owner's skills, then the catalogue's answer */
	const options: SkillOption[] = mergeSkillSuggestions({
		typed: 'k',
		picked: ['Kotlin'],
		own: ['Kafka', 'Kotlin', 'Leadership', 'Apache Spark'],
		known: [],
		catalogue: [
			{ name: 'Kafka', category: 'data' },
			{ name: 'Kotlin', category: 'language' },
			{ name: 'Kubernetes', category: 'infrastructure', alias: 'K8s' },
			{ name: 'Kotlin Multiplatform', category: 'framework', parent: 'Kotlin' },
			{ name: 'Kanban', category: 'practice' },
			{ name: 'Keycloak' }
		]
	});

	const draw = (props: Partial<{ open: boolean; active: number }> = {}) =>
		render(SkillSuggestions, {
			props: { id: 'f-suggestions', options, open: true, active: -1, onpick: () => {}, ...props }
		}).body;

	it("merges the owner's own skills with the catalogue's, each skill once", () => {
		expect(options.map(({ name, source }) => `${source}: ${name}`)).toEqual([
			'own: Kafka',
			'own: Apache Spark',
			// Kafka is the owner's already, Kotlin is picked
			'catalogue: Kubernetes',
			'catalogue: Kotlin Multiplatform',
			'catalogue: Kanban',
			'catalogue: Keycloak'
		]);
		const drawn = optionsOf(draw());
		expect(drawn.map(({ source }) => source)).toEqual([
			'own',
			'own',
			'catalogue',
			'catalogue',
			'catalogue',
			'catalogue'
		]);
		// The ids the field names with aria-activedescendant
		expect(drawn.map(({ id }) => id)).toEqual([0, 1, 2, 3, 4, 5].map((i) => `f-suggestions-${i}`));
	});

	it('keeps the focus in the field for a press anywhere in the list, its scrollbar included', () => {
		// A press on the scrollbar is a press on the list, not on an option: cancelled there, it
		// scrolls the list; left alone, it takes the focus and the list closes. Handlers are not
		// in the server's markup: read from the component
		const markup = suggestionsSource.replace(/\s+/g, ' ');
		const listbox = markup.slice(markup.indexOf('<ul '), markup.indexOf('{#each'));
		expect(listbox).toContain('role="listbox"');
		expect(listbox).toContain('onpointerdown={(event) => event.preventDefault()}');
		const option = markup.slice(markup.indexOf('<li '), markup.indexOf('<span'));
		expect(option).toContain('role="option"');
		expect(option).not.toContain('onpointerdown');
	});

	it('shows what each suggestion is: its category, its family, the skill another spelling stands for', () => {
		const body = draw();
		expect(body).toContain('role="listbox"');
		expect(body).toContain('aria-label="Suggestions"');
		expect(optionsOf(body).map(({ text }) => text)).toEqual([
			'Kafka On your portfolio',
			'Apache Spark On your portfolio',
			// The spelling that matched, then the skill picking it adds
			'K8s Kubernetes Cloud & infrastructure',
			'Kotlin Multiplatform Frameworks & runtimes · Part of Kotlin',
			'Kanban Practices & domains',
			// A skill the catalogue has not placed: its name alone
			'Keycloak'
		]);
	});

	it('names each suggestion for screen readers, in English and in French', () => {
		expect(optionsOf(draw()).map(({ name }) => name)).toEqual([
			'Kafka, on your portfolio',
			'Apache Spark, on your portfolio',
			'Kubernetes, also known as K8s, Cloud & infrastructure',
			'Kotlin Multiplatform, Frameworks & runtimes, part of Kotlin',
			'Kanban, Practices & domains',
			'Keycloak'
		]);
		const french = withLocale('fr', () => optionsOf(draw()));
		expect(french.map(({ name }) => name)).toEqual([
			'Kafka, sur votre portfolio',
			'Apache Spark, sur votre portfolio',
			// French typography: a non-breaking space before the colon (defineMessages)
			'Kubernetes, autre nom\u00a0: K8s, Cloud et infrastructure',
			'Kotlin Multiplatform, Frameworks et runtimes, fait partie de Kotlin',
			'Kanban, Pratiques et domaines',
			'Keycloak'
		]);
		expect(french.map(({ text }) => text)).toEqual([
			'Kafka Sur votre portfolio',
			'Apache Spark Sur votre portfolio',
			'K8s Kubernetes Cloud et infrastructure',
			'Kotlin Multiplatform Frameworks et runtimes · Fait partie de Kotlin',
			'Kanban Pratiques et domaines',
			'Keycloak'
		]);
	});

	it('marks the suggestion the arrows are on, and follows the keyboard', () => {
		const state = { open: true, count: options.length, active: -1 };
		expect(optionsOf(draw()).map(({ selected }) => selected)).toEqual(Array(6).fill('false'));
		// ArrowDown twice: the second suggestion
		expect(suggestionKeyAction({ key: 'ArrowDown' }, state)).toEqual({ action: 'move', active: 0 });
		expect(suggestionKeyAction({ key: 'ArrowDown' }, { ...state, active: 0 })).toEqual({
			action: 'move',
			active: 1
		});
		expect(optionsOf(draw({ active: 1 })).map(({ selected }) => selected)).toEqual([
			'false',
			'true',
			'false',
			'false',
			'false',
			'false'
		]);
		// Enter picks it: the skill's own name, for another spelling too
		expect(suggestionKeyAction({ key: 'Enter' }, { ...state, active: 2 })).toEqual({
			action: 'pick',
			index: 2
		});
		expect(options[2].name).toBe('Kubernetes');
	});

	it('stays in the page while closed, empty and out of sight: Escape closes the list alone', () => {
		expect(suggestionKeyAction({ key: 'Escape' }, { open: true, count: 6, active: 1 })).toEqual({
			action: 'close'
		});
		const closed = draw({ open: false });
		// The listbox the field's aria-controls names is still there
		expect(closed).toContain('id="f-suggestions"');
		expect(optionsOf(closed)).toEqual([]);
		expect(
			/<div class="[^"]*(?<![-\w])hidden(?![-\w])[^"]*"[^>]*data-skill-suggestions/.test(closed)
		).toBe(true);
		expect(
			/<div class="[^"]*(?<![-\w])hidden(?![-\w])[^"]*"[^>]*data-skill-suggestions/.test(draw())
		).toBe(false);
		// Closed, Escape is no longer the list's: the dialog around the field takes it
		expect(
			suggestionKeyAction({ key: 'Escape' }, { open: false, count: 6, active: -1 })
		).toBeUndefined();
	});

	it('writes what people typed as text, never as markup', () => {
		const body = render(SkillSuggestions, {
			props: {
				id: 'f-suggestions',
				options: [{ name: '<img src=x onerror=alert(1)>', alias: '"><b>', source: 'catalogue' }],
				open: true,
				active: 0,
				onpick: () => {}
			}
		}).body;
		expect(body).not.toContain('<img');
		expect(body).not.toContain('<b>');
		expect(body).toContain('&lt;img src=x onerror=alert(1)>');
	});
});
