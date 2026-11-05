<script lang="ts">
	import { TagsInput } from '@skeletonlabs/skeleton-svelte';
	import { XMark } from 'svelte-heros-v2';
	import { EXPERIENCE_LIMITS } from 'portfolio-common';
	import { normalizeSkillNames } from '#services/experienceForm.ts';
	import FieldError from './FieldError.svelte';
	import { getEditorContext } from './context';

	const MAX_SUGGESTIONS = 6;

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
		/** Offered while typing */
		suggestions: readonly string[];
		/** Technical skills are filled chips, soft skills outlined (as on the cards) */
		variant: 'hard' | 'soft';
		onchange: (value: string[]) => void;
	} = $props();

	const editor = getEditorContext();
	const inputId = $derived(editor.fieldId(field));
	const hintId = $derived(`${inputId}-hint`);
	let error = $derived(editor.error(field));

	let inputValue = $state('');
	let suggestionBox: HTMLElement | undefined = $state();

	// Skills of the portfolio matching what is typed (not picked yet; starts of names first).
	// Buttons rather than a <datalist>: mobile Chrome draws a datalist input as a drop-down.
	let matches = $derived.by(() => {
		const query = inputValue.trim().toLowerCase();
		if (!query) return [];
		const available = normalizeSkillNames([...value, ...suggestions], known).slice(
			normalizeSkillNames(value).length
		);
		const starts = (skill: string) => skill.toLowerCase().startsWith(query);
		return available
			.filter((skill) => skill.toLowerCase().includes(query) && skill.toLowerCase() !== query)
			.sort((a, b) => Number(starts(b)) - Number(starts(a)))
			.slice(0, MAX_SUGGESTIONS);
	});

	// Enter, comma and semicolon commit here, synchronously. The tags input would clear its text
	// on the next animation frame, so a key typed right after the delimiter could be lost.
	const commitOnKey = (event: KeyboardEvent) => {
		if (event.isComposing || ![',', ';', 'Enter'].includes(event.key)) return;
		const typed = inputValue.trim();
		if (!typed || value.length >= EXPERIENCE_LIMITS.skillsPerProject) {
			// A delimiter alone is not text; Enter is left to the tags input
			if (event.key !== 'Enter') event.preventDefault();
			return;
		}
		event.preventDefault();
		onchange(normalizeSkillNames([...value, typed], known));
		inputValue = '';
	};

	const pick = (skill: string) => {
		onchange(normalizeSkillNames([...value, skill], known));
		inputValue = '';
		document.getElementById(inputId)?.focus();
	};

	// Reaching a suggestion (click or Tab) must not commit the half-typed text as a tag
	const keepTyping = (event: { detail: { originalEvent: Event }; preventDefault: () => void }) => {
		const target = event.detail.originalEvent.target;
		if (target instanceof Node && suggestionBox?.contains(target)) event.preventDefault();
	};

	const chipClass = $derived(
		variant === 'hard'
			? 'preset-tonal-primary'
			: 'bg-transparent text-surface-800-200 border border-surface-300-700'
	);
</script>

<div class="space-y-1">
	<TagsInput
		{value}
		onValueChange={(details) => onchange(normalizeSkillNames(details.value, known))}
		{inputValue}
		onInputValueChange={(details) => (inputValue = details.inputValue)}
		onInteractOutside={keepTyping}
		ids={{ input: inputId }}
		delimiter={/[,;]/}
		addOnPaste
		blurBehavior="add"
		editable={false}
		max={EXPERIENCE_LIMITS.skillsPerProject}
		invalid={!!error}
		placeholder="Type a skill and press Enter"
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
				aria-describedby={[hintId, error ? editor.errorId(field) : ''].filter(Boolean).join(' ')}
				class="min-h-7 min-w-0 flex-[1_1_8rem]"
				onkeydowncapture={commitOnKey}
			/>
		</TagsInput.Control>
		<TagsInput.HiddenInput />
	</TagsInput>
	<div bind:this={suggestionBox}>
		{#if matches.length > 0}
			<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Suggestions">
				<span class="me-1 text-xs text-surface-600-400" aria-hidden="true">Suggestions:</span>
				{#each matches as skill (skill)}
					<button
						type="button"
						class="chip min-h-8 preset-outlined-surface-300-700 hover:preset-tonal"
						aria-label="Add {skill}"
						onclick={() => pick(skill)}
					>
						{skill}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	<p id={hintId} class="text-xs text-surface-600-400">
		Press Enter, or separate skills with a comma.
	</p>
	<FieldError {field} />
</div>
