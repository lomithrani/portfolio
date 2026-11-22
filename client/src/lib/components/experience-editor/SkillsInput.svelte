<!--
@component
The skills of a project, as tags: typed and entered (Enter, a comma, a semicolon, a paste, or
leaving the field). While a skill is typed the field suggests, under it, the owner's own skills
(at once) then those of the site's catalogue (GET /skills/search, after a pause in typing), each
with its category, and another spelling of a skill with the skill it stands for
("K8s → Kubernetes": picking it adds that skill). The arrows move through the suggestions, Enter
picks the one they are on (none: Enter adds what is typed, as ever), Escape closes the list and
only the list. A search that fails, is refused or is not there leaves the owner's own skills,
without a word: the field only ever suggests, any name can be typed.
-->
<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
	import { XMark } from 'svelte-heros-v2';
	import { EXPERIENCE_LIMITS, type SkillSuggestion } from 'portfolio-common';
	import { normalizeSkillNames } from '#services/experienceForm.ts';
	import {
		catalogueSpellings,
		createSkillSearcher,
		mergeSkillSuggestions,
		suggestionKeyAction,
		type SkillOption
	} from '#services/skillSearch.ts';
	import FieldError from './FieldError.svelte';
	import SkillSuggestions from './SkillSuggestions.svelte';
	import { getEditorContext } from './context';
	import { m } from './editor.messages.ts';

	let {
		field,
		label,
		value,
		known,
		suggestions,
		variant,
		onchange
	}: {
		/** Form field key ('projects.<id>.hardSkills') */
		field: string;
		label: string;
		value: string[];
		/** Spellings to reuse: 'typescript' is stored as a known 'TypeScript' */
		known: readonly string[];
		/** The owner's own skills, offered while typing */
		suggestions: readonly string[];
		/** Technical skills tonal chips, soft skills a lighter tint (as on the cards) */
		variant: 'hard' | 'soft';
		onchange: (value: string[]) => void;
	} = $props();

	const editor = getEditorContext();
	const inputId = $derived(editor.fieldId(field));
	const hintId = $derived(`${inputId}-hint`);
	const listId = $derived(`${inputId}-suggestions`);
	let error = $derived(editor.error(field));

	let inputValue = $state('');
	let suggestionBox: HTMLElement | undefined = $state();

	/** The catalogue's skills for what was typed last (the last answer of the search) */
	let catalogue = $state.raw<SkillSuggestion[]>([]);
	/** Escape closed the list: it stays closed until something else is typed, or an arrow opens it */
	let dismissed = $state(false);
	let focused = $state(false);
	/** The name of the suggestion the arrows are on: it stays on it when the catalogue's answer comes */
	let activeName = $state<string | null>(null);

	const search = createSkillSearcher((skills) => (catalogue = skills));
	onDestroy(search.cancel);

	let full = $derived(value.length >= EXPERIENCE_LIMITS.skillsPerProject);

	// The owner's own skills first (not picked yet; starts of names first), then the catalogue's.
	// A list of options rather than a <datalist>: mobile Chrome draws a datalist input as a
	// drop-down, and a datalist cannot say what a suggestion is
	let options = $derived(
		full
			? []
			: mergeSkillSuggestions({
					typed: inputValue,
					picked: value,
					own: suggestions,
					known,
					catalogue
				})
	);
	let open = $derived(focused && !dismissed && options.length > 0);
	let active = $derived(
		open && activeName !== null ? options.findIndex(({ name }) => name === activeName) : -1
	);

	/** What is in the field changed: the suggestions follow it */
	const typed = (text: string) => {
		if (text === inputValue) return;
		inputValue = text;
		dismissed = false;
		activeName = null;
		if (full) search.cancel();
		else search.type(text);
	};

	/** The text in the field became a skill, or was dropped: nothing left to suggest for */
	const clearTyped = () => {
		inputValue = '';
		activeName = null;
		dismissed = false;
		catalogue = [];
		search.cancel();
	};

	/** Typed text spelled like the owner's own skill of that name, else like the catalogue's */
	const spellings = $derived([...known, ...catalogueSpellings(catalogue)]);

	const pick = (option: SkillOption) => {
		onchange(normalizeSkillNames([...value, option.name], known));
		clearTyped();
		document.getElementById(inputId)?.focus();
	};

	// The suggestions' keys, then Enter, comma and semicolon, which commit here, synchronously.
	// The tags input would clear its text on the next animation frame, so a key typed right after
	// the delimiter could be lost.
	const onkeydown = async (event: KeyboardEvent) => {
		const step = suggestionKeyAction(event, { open, count: options.length, active });
		if (step) {
			// The key is the list's: not the tags input's (Enter would add what is typed), nor the
			// dialog's (Escape closes the list only; ExperienceEditor leaves an open list its Escape)
			event.preventDefault();
			event.stopPropagation();
			if (step.action === 'pick') {
				pick(options[step.index]);
			} else if (step.action === 'close') {
				dismissed = true;
				activeName = null;
				// The answer of a search under way would open nothing: the list stays closed
				search.cancel();
			} else {
				dismissed = false;
				activeName = options[step.active]?.name ?? null;
				await tick();
				if (step.active >= 0) {
					document.getElementById(`${listId}-${step.active}`)?.scrollIntoView({ block: 'nearest' });
				}
			}
			return;
		}
		if (event.isComposing || ![',', ';', 'Enter'].includes(event.key)) return;
		const text = inputValue.trim();
		if (!text || full) {
			// A delimiter alone is not text; Enter is left to the tags input
			if (event.key !== 'Enter') event.preventDefault();
			return;
		}
		event.preventDefault();
		onchange(normalizeSkillNames([...value, text], spellings));
		clearTyped();
	};

	// Reaching a suggestion (click or Tab) must not commit the half-typed text as a tag
	const keepTyping = (event: { detail: { originalEvent: Event }; preventDefault: () => void }) => {
		const target = event.detail.originalEvent.target;
		if (target instanceof Node && suggestionBox?.contains(target)) event.preventDefault();
	};

	const chipClass = $derived(
		variant === 'hard'
			? 'preset-tonal-primary'
			: 'bg-[color-mix(in_oklab,var(--color-primary-50-950)_45%,transparent)] text-primary-950-50'
	);
</script>

<div class="space-y-1">
	<TagsInput
		{value}
		onValueChange={(details) => {
			onchange(normalizeSkillNames(details.value, spellings));
			// A tag added by the tags input itself (a paste, leaving the field) took the text with it
			if (details.value.length > value.length) clearTyped();
		}}
		{inputValue}
		onInputValueChange={(details) => typed(details.inputValue)}
		onInteractOutside={keepTyping}
		ids={{ input: inputId }}
		delimiter={/[,;]/}
		addOnPaste
		blurBehavior="add"
		editable={false}
		max={EXPERIENCE_LIMITS.skillsPerProject}
		invalid={!!error}
		placeholder={m.skills.placeholder}
		translations={m.skills.tags}
		class="gap-1"
	>
		<TagsInput.Label>{label}</TagsInput.Label>
		<TagsInput.Control class="items-center">
			{#each value as tag, index (tag)}
				<TagsInput.Item value={tag} {index}>
					<TagsInput.ItemPreview class="{chipClass} gap-1 pe-1">
						<TagsInput.ItemText>{tag}</TagsInput.ItemText>
						<TagsInput.ItemDeleteTrigger class="size-6 rounded-full hover:preset-tonal">
							<XMark size="14" aria-hidden="true" />
						</TagsInput.ItemDeleteTrigger>
					</TagsInput.ItemPreview>
				</TagsInput.Item>
			{/each}
			<!-- size=1 + flex basis: the input fills the row instead of overflowing it on mobile -->
			<TagsInput.Input
				size={1}
				maxlength={EXPERIENCE_LIMITS.skillName}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls={listId}
				aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
				aria-describedby={[hintId, error ? editor.errorId(field) : ''].filter(Boolean).join(' ')}
				class="min-h-7 min-w-0 flex-[1_1_8rem]"
				onkeydowncapture={onkeydown}
				onfocus={() => (focused = true)}
				onblur={() => {
					focused = false;
					activeName = null;
					search.cancel();
				}}
			/>
		</TagsInput.Control>
		<TagsInput.HiddenInput />
	</TagsInput>
	<!-- No height of its own: the list lies over what follows the field -->
	<div bind:this={suggestionBox} class="relative">
		<SkillSuggestions id={listId} {options} {open} {active} onpick={pick} />
	</div>
	<p class="sr-only" role="status">{open ? m.skills.count(options.length) : ''}</p>
	<!-- Out of sight under an open list (its place kept: nothing moves), whose rounded corner would
	     otherwise show the top of its first letter; it still describes the field -->
	<p id={hintId} class={['text-xs text-surface-700-300', open && 'invisible']}>
		{m.skills.hint}
	</p>
	<FieldError {field} />
</div>
