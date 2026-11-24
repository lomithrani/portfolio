import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_SEARCH, type SkillSuggestion } from 'portfolio-common';

// The skill search of the experience editor (services/skillSearch.ts), with the API answered
// here: what is asked and when (after a pause in typing, an earlier text's search dropped), how
// each answer is read, a failure never told, and what the field then suggests

// vi.mock factories are hoisted: they cannot reference outer variables (but vi.hoisted ones)
const api = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock('../portfolio.ts', () => ({
	textApi: { skills: { search: { get: api.search } } }
}));

import {
	catalogueSpellings,
	createSkillSearcher,
	mergeSkillSuggestions,
	ownSkillMatches,
	readSkillSuggestions,
	resetSkillSearch,
	searchSkills,
	suggestionKeyAction,
	type SkillSearchOutcome
} from '../skillSearch';

/** Eden's answers */
const answered = (data: unknown) => ({ data, error: null, status: 200, response: new Response() });
const refused = (status: number, headers?: Record<string, string>) => ({
	data: null,
	error: { status, value: 'refused' },
	status,
	response: new Response(null, { status, headers })
});

const KUBERNETES: SkillSuggestion = { name: 'Kubernetes', category: 'infrastructure' };
const K8S: SkillSuggestion = { ...KUBERNETES, alias: 'K8s' };
const DOTNET_CORE: SkillSuggestion = { name: '.NET Core', category: 'framework', parent: '.NET' };

beforeEach(() => {
	api.search.mockReset();
	resetSkillSearch();
});

describe('searchSkills', () => {
	it('asks for what was typed, tidied, with the session', async () => {
		api.search.mockResolvedValue(answered({ skills: [KUBERNETES] }));
		const signal = new AbortController().signal;
		expect(await searchSkills('  kube   rnetes ', signal)).toEqual({
			status: 'found',
			skills: [KUBERNETES]
		});
		expect(api.search).toHaveBeenCalledExactlyOnceWith({
			query: { q: 'kube rnetes' },
			fetch: { credentials: 'include', signal }
		});
	});

	it('asks nothing for a text that is empty or too long to be a skill', async () => {
		for (const typed of ['', '   ', 'a'.repeat(SKILL_SEARCH.maxLength + 1)]) {
			expect(await searchSkills(typed)).toEqual({ status: 'found', skills: [] });
		}
		expect(api.search).not.toHaveBeenCalled();
	});

	it('keeps of an answer only what the field shows', () => {
		expect(
			readSkillSuggestions({
				skills: [
					{ ...K8S, _id: '65e2e0000000000000000001', names: ['k8s'], classification: 'manual' },
					{ name: '  Go  ', category: 'not-a-category', parent: 7, alias: '' },
					{ name: '' },
					{ name: 'a'.repeat(101) },
					{ category: 'tool' },
					'Kafka',
					null
				]
			})
		).toEqual([K8S, { name: 'Go' }]);
		for (const junk of [null, undefined, 'skills', [], {}, { skills: 'Kafka' }]) {
			expect(readSkillSuggestions(junk)).toEqual([]);
		}
		// Never more than the search answers with
		const many = Array.from({ length: 20 }, (_, index) => ({ name: `Skill ${index}` }));
		expect(readSkillSuggestions({ skills: many })).toHaveLength(SKILL_SEARCH.results);
	});

	it('takes a failure as an outcome, never as an error', async () => {
		// An API without the route: nothing asks again
		api.search.mockResolvedValueOnce(refused(404));
		expect(await searchSkills('kub')).toEqual({ status: 'off' });
		// Too many searches: asked again once the API says so
		api.search.mockResolvedValueOnce(refused(429, { 'Retry-After': '12' }));
		expect(await searchSkills('kub')).toEqual({ status: 'unavailable', retryAfterMs: 12_000 });
		// A wait that is not one, or longer than the field stays quiet
		api.search.mockResolvedValueOnce(refused(429, { 'Retry-After': 'soon' }));
		expect(await searchSkills('kub')).toEqual({ status: 'unavailable', retryAfterMs: 60_000 });
		api.search.mockResolvedValueOnce(refused(429, { 'Retry-After': '86400' }));
		expect(await searchSkills('kub')).toEqual({ status: 'unavailable', retryAfterMs: 300_000 });
		// Signed out: the editor says so when it saves, not this field
		api.search.mockResolvedValueOnce(refused(401));
		expect(await searchSkills('kub')).toEqual({ status: 'unavailable', retryAfterMs: 60_000 });
		api.search.mockResolvedValueOnce(refused(503));
		expect(await searchSkills('kub')).toEqual({ status: 'unavailable', retryAfterMs: 10_000 });
		// No answer at all (offline, aborted)
		api.search.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		expect(await searchSkills('kub')).toEqual({ status: 'unavailable', retryAfterMs: 10_000 });
	});
});

describe('createSkillSearcher', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	/** A search answered by hand: each call waits for `answer` */
	const manualSearch = () => {
		const calls: {
			text: string;
			signal: AbortSignal | undefined;
			answer: (outcome: SkillSearchOutcome) => void;
		}[] = [];
		const search = vi.fn(
			(text: string, signal?: AbortSignal) =>
				new Promise<SkillSearchOutcome>((resolve) => calls.push({ text, signal, answer: resolve }))
		);
		return { search, calls };
	};

	const found = (...skills: SkillSuggestion[]): SkillSearchOutcome => ({ status: 'found', skills });

	it('asks once, after a pause in typing, for what was typed last', async () => {
		const { search, calls } = manualSearch();
		const answers: SkillSuggestion[][] = [];
		const searcher = createSkillSearcher((skills) => answers.push(skills), { search });
		searcher.type('k');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs - 1);
		searcher.type('ku');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs - 1);
		searcher.type(' kub ');
		expect(search).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		expect(calls.map(({ text }) => text)).toEqual(['kub']);
		calls[0].answer(found(KUBERNETES));
		await vi.runAllTimersAsync();
		expect(answers).toEqual([[KUBERNETES]]);
	});

	it('drops the search of an earlier text: it is aborted, and its answer never told', async () => {
		const { search, calls } = manualSearch();
		const answers: SkillSuggestion[][] = [];
		const searcher = createSkillSearcher((skills) => answers.push(skills), { search });
		searcher.type('kub');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		expect(calls[0].signal?.aborted).toBe(false);
		// Typed on while the API answers
		searcher.type('kafk');
		expect(calls[0].signal?.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		// The earlier answer comes last: it is for another text
		calls[1].answer(found({ name: 'Kafka' }));
		await vi.runAllTimersAsync();
		calls[0].answer(found(KUBERNETES));
		await vi.runAllTimersAsync();
		expect(answers).toEqual([[{ name: 'Kafka' }]]);
	});

	it('asks nothing once cancelled (the field was left, a skill was picked)', async () => {
		const { search, calls } = manualSearch();
		const answers: SkillSuggestion[][] = [];
		const searcher = createSkillSearcher((skills) => answers.push(skills), { search });
		searcher.type('kub');
		searcher.cancel();
		await vi.runAllTimersAsync();
		expect(search).not.toHaveBeenCalled();
		// Cancelled while the API answers: the answer is dropped
		searcher.type('kub');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		searcher.cancel();
		calls[0].answer(found(KUBERNETES));
		await vi.runAllTimersAsync();
		expect(answers).toEqual([]);
	});

	it('has no suggestion, at once and without a request, for a text that is not searched', async () => {
		const { search } = manualSearch();
		const answers: SkillSuggestion[][] = [];
		const searcher = createSkillSearcher((skills) => answers.push(skills), { search });
		searcher.type('');
		searcher.type('   ');
		searcher.type('a'.repeat(SKILL_SEARCH.maxLength + 1));
		expect(answers).toEqual([[], [], []]);
		await vi.runAllTimersAsync();
		expect(search).not.toHaveBeenCalled();
	});

	it('swallows a failure: no suggestion, no error, and a pause before it asks again', async () => {
		const { search, calls } = manualSearch();
		const answers: SkillSuggestion[][] = [];
		const searcher = createSkillSearcher((skills) => answers.push(skills), { search });
		searcher.type('kub');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		calls[0].answer({ status: 'unavailable', retryAfterMs: 30_000 });
		await vi.advanceTimersByTimeAsync(0);
		expect(answers).toEqual([[]]);
		// Refused for now: typing asks nothing meanwhile, in any field of the page
		const other = createSkillSearcher(() => {}, { search });
		searcher.type('kube');
		other.type('lead');
		await vi.advanceTimersByTimeAsync(29_000);
		expect(search).toHaveBeenCalledTimes(1);
		// Then asks again
		await vi.advanceTimersByTimeAsync(1_000);
		searcher.type('kuber');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		expect(calls.map(({ text }) => text)).toEqual(['kub', 'kuber']);
		calls[1].answer(found(KUBERNETES));
		await vi.advanceTimersByTimeAsync(0);
		expect(answers).toEqual([[], [KUBERNETES]]);
	});

	it('never asks again a site that has no search', async () => {
		const { search, calls } = manualSearch();
		const answers: SkillSuggestion[][] = [];
		const searcher = createSkillSearcher((skills) => answers.push(skills), { search });
		searcher.type('kub');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		calls[0].answer({ status: 'off' });
		await vi.advanceTimersByTimeAsync(0);
		expect(answers).toEqual([[]]);
		searcher.type('kube');
		createSkillSearcher(() => {}, { search }).type('lead');
		await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
		expect(search).toHaveBeenCalledTimes(1);
	});

	it('goes through the API by default, and survives one that throws', async () => {
		api.search.mockRejectedValue(new TypeError('Failed to fetch'));
		const answers: SkillSuggestion[][] = [];
		createSkillSearcher((skills) => answers.push(skills)).type('kub');
		await vi.advanceTimersByTimeAsync(SKILL_SEARCH.debounceMs);
		expect(api.search).toHaveBeenCalledTimes(1);
		expect(answers).toEqual([[]]);
	});
});

describe('mergeSkillSuggestions', () => {
	const merge = (
		typed: string,
		catalogue: SkillSuggestion[],
		{
			picked = [],
			own = [],
			known = own
		}: { picked?: string[]; own?: string[]; known?: string[] } = {}
	) => mergeSkillSuggestions({ typed, picked, own, known, catalogue });

	it("lists the owner's own skills first, at once, then the catalogue's", () => {
		const own = ['Kafka', 'Apache Kafka Streams', 'Go'];
		// Before the catalogue answers
		expect(merge('kaf', [], { own })).toEqual([
			{ name: 'Kafka', source: 'own' },
			{ name: 'Apache Kafka Streams', source: 'own' }
		]);
		expect(merge('kaf', [{ name: 'Kafka Connect', category: 'data' }], { own })).toEqual([
			{ name: 'Kafka', source: 'own' },
			{ name: 'Apache Kafka Streams', source: 'own' },
			{ name: 'Kafka Connect', category: 'data', source: 'catalogue' }
		]);
	});

	it('keeps what the catalogue knows of a skill: its category, its family, the spelling that matched', () => {
		expect(merge('k8', [K8S])).toEqual([{ ...K8S, source: 'catalogue' }]);
		expect(merge('.net c', [DOTNET_CORE])).toEqual([{ ...DOTNET_CORE, source: 'catalogue' }]);
	});

	it('suggests a skill once: not one picked already, nor one the owner uses, whatever its case', () => {
		const catalogue = [KUBERNETES, { name: 'Kubeflow' }, { name: 'KUBECTL' }, { name: 'Kubeflow' }];
		expect(
			merge('kub', catalogue, { picked: ['kubernetes'], own: ['kubectl', 'Kubernetes'] }).map(
				({ name, source }) => `${source}: ${name}`
			)
		).toEqual(['own: kubectl', 'catalogue: Kubeflow']);
		// Another spelling of a skill picked already adds nothing
		expect(merge('k8', [K8S], { picked: ['Kubernetes'] })).toEqual([]);
	});

	it('leaves out what is typed itself (Enter adds it), but not another spelling typed whole', () => {
		expect(merge('kubernetes', [KUBERNETES, { name: 'Kubernetes Operators' }])).toEqual([
			{ name: 'Kubernetes Operators', source: 'catalogue' }
		]);
		expect(merge('K8S', [K8S])).toEqual([{ ...K8S, source: 'catalogue' }]);
	});

	it('drops the answer of an earlier text while the next one comes', () => {
		const forKu = [KUBERNETES, { name: 'Kustomize' }, { ...K8S, name: 'Kube', alias: 'kubectl' }];
		expect(merge('kub', forKu).map(({ name }) => name)).toEqual(['Kubernetes', 'Kube']);
		expect(merge('kubx', forKu)).toEqual([]);
		expect(merge('', forKu)).toEqual([]);
		expect(merge('   ', forKu)).toEqual([]);
	});

	it("suggests 8 skills at most, the owner's own first", () => {
		const own = Array.from({ length: 10 }, (_, index) => `Own skill ${index}`);
		const catalogue = Array.from({ length: 8 }, (_, index) => ({ name: `Skill ${index}` }));
		const options = merge('skill', catalogue, { own });
		expect(options).toHaveLength(SKILL_SEARCH.results);
		expect(options.filter(({ source }) => source === 'own')).toHaveLength(6);
		expect(options.slice(6).map(({ name }) => name)).toEqual(['Skill 0', 'Skill 1']);
	});
});

describe('ownSkillMatches', () => {
	it('matches as the field always did: starts of names first, spelled as known, not what is typed', () => {
		const own = ['Apache Kafka', 'kafka', 'Kafka Streams', 'Go'];
		expect(ownSkillMatches('kafka', [], own, ['Kafka'])).toEqual(['Kafka Streams', 'Apache Kafka']);
		expect(ownSkillMatches('kaf', ['Kafka Streams'], own, ['Kafka'])).toEqual([
			'Kafka',
			'Apache Kafka'
		]);
		expect(ownSkillMatches(' ', [], own, [])).toEqual([]);
	});
});

describe('catalogueSpellings', () => {
	it("spells typed text as the catalogue's skill of that name, never as another skill", () => {
		expect(catalogueSpellings([KUBERNETES, K8S, DOTNET_CORE])).toEqual([
			'Kubernetes',
			'Kubernetes',
			'.NET Core'
		]);
	});
});

describe('suggestionKeyAction', () => {
	const key = (name: string, state: { open?: boolean; count?: number; active?: number } = {}) =>
		suggestionKeyAction({ key: name }, { open: true, count: 3, active: -1, ...state });

	it('moves through the suggestions with the arrows, back to the text typed, then round again', () => {
		expect(key('ArrowDown')).toEqual({ action: 'move', active: 0 });
		expect(key('ArrowDown', { active: 1 })).toEqual({ action: 'move', active: 2 });
		// From the last one: none (the text typed), then the first again
		expect(key('ArrowDown', { active: 2 })).toEqual({ action: 'move', active: -1 });
		expect(key('ArrowUp')).toEqual({ action: 'move', active: 2 });
		expect(key('ArrowUp', { active: 0 })).toEqual({ action: 'move', active: -1 });
		expect(key('ArrowUp', { active: 2 })).toEqual({ action: 'move', active: 1 });
	});

	it('opens a list that Escape closed, on its first or its last suggestion', () => {
		expect(key('ArrowDown', { open: false })).toEqual({ action: 'move', active: 0 });
		expect(key('ArrowUp', { open: false })).toEqual({ action: 'move', active: 2 });
	});

	it('picks with Enter the suggestion the arrows are on, and leaves Enter alone otherwise', () => {
		expect(key('Enter', { active: 1 })).toEqual({ action: 'pick', index: 1 });
		// None: Enter adds what is typed, as ever
		expect(key('Enter')).toBeUndefined();
		expect(key('Enter', { active: 1, open: false })).toBeUndefined();
		expect(key('Enter', { active: 5 })).toBeUndefined();
	});

	it("closes the list with Escape, and only the list: closed, Escape is the dialog's", () => {
		expect(key('Escape')).toEqual({ action: 'close' });
		expect(key('Escape', { active: 2 })).toEqual({ action: 'close' });
		expect(key('Escape', { open: false })).toBeUndefined();
		expect(key('Escape', { open: false, count: 0 })).toBeUndefined();
	});

	it('takes no other key, none without suggestions, and none while a character is composed', () => {
		for (const name of ['a', ',', ';', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Home']) {
			expect(key(name, { active: 1 })).toBeUndefined();
		}
		expect(key('ArrowDown', { open: false, count: 0 })).toBeUndefined();
		expect(key('Enter', { open: false, count: 0, active: 0 })).toBeUndefined();
		for (const name of ['ArrowDown', 'Enter', 'Escape']) {
			expect(
				suggestionKeyAction({ key: name, isComposing: true }, { open: true, count: 3, active: 1 })
			).toBeUndefined();
		}
	});
});
