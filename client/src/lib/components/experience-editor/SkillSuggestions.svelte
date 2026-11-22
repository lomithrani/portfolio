<!--
@component
The suggestions of a skills field (SkillsInput): the owner's own skills matching what is typed,
then the skills of the site's catalogue, each with what the catalogue knows of it (its category,
the skill it is part of, and for another spelling of a skill the skill it stands for:
"K8s → Kubernetes").

A listbox the field controls (ARIA combobox): the keyboard stays in the field, which names the
suggestion its arrows are on (`aria-activedescendant`); the pointer picks here.
-->
<script lang="ts">
	import { ArrowRight } from 'svelte-heros-v2';
	import { skillCategoryLabel } from 'portfolio-common';
	import type { SkillOption } from '#services/skillSearch.ts';
	import { m } from './editor.messages.ts';

	let {
		id,
		options,
		open,
		active,
		onpick
	}: {
		/** The listbox's id, which the field names with `aria-controls`; its options are `<id>-<index>` */
		id: string;
		options: readonly SkillOption[];
		/** Whether the list shows: it stays in the page while closed, empty */
		open: boolean;
		/** The suggestion the field's arrows are on; -1: none */
		active: number;
		onpick: (option: SkillOption) => void;
	} = $props();

	let shown = $derived(open ? options : []);
	let box: HTMLDivElement | undefined = $state();

	// The whole list in sight when it shows or grows: the form scrolls in its dialog, whose footer
	// would otherwise cover the last suggestions. Nothing moves when it is in sight already
	$effect(() => {
		if (shown.length > 0) box?.scrollIntoView({ block: 'nearest' });
	});

	const category = (option: SkillOption) =>
		option.category ? skillCategoryLabel(option.category) : undefined;

	/** What a screen reader says of a suggestion: its skill, then what the row shows beside it */
	const optionName = (option: SkillOption) =>
		option.source === 'own'
			? m.skills.option.own(option.name)
			: m.skills.option.catalogue({
					name: option.name,
					alias: option.alias,
					category: category(option),
					parent: option.parent
				});
</script>

<!-- Over what follows the field, so that typing never moves the form -->
<div
	bind:this={box}
	class={[
		'absolute inset-x-0 top-0 z-20 scroll-mb-3 overflow-hidden card border border-surface-300-700 bg-surface-50-950 shadow-lg',
		shown.length === 0 && 'hidden'
	]}
	data-skill-suggestions
>
	<!-- A press anywhere in the list keeps the focus, and what is typed, in the field: on an option
	     (picked by its click) and on the list's own scrollbar, which would otherwise take the focus
	     and close the list instead of scrolling it -->
	<ul
		{id}
		role="listbox"
		aria-label={m.skills.suggestions}
		class="max-h-60 overflow-y-auto"
		onpointerdown={(event) => event.preventDefault()}
	>
		{#each shown as option, index (option.name)}
			{@const group = category(option)}
			<!-- The keyboard picks from the field (the arrows, Enter); this is for the pointer, which
			     does not move the arrows' place: a list opening under a resting pointer must not make
			     Enter pick the skill under it -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id="{id}-{index}"
				role="option"
				tabindex="-1"
				aria-selected={index === active}
				aria-label={optionName(option)}
				class={[
					'flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm',
					index === active ? 'preset-tonal-primary' : 'hover:preset-tonal'
				]}
				data-skill-option={option.source}
				onclick={() => onpick(option)}
			>
				<span class="flex min-w-0 flex-wrap items-center gap-x-1.5">
					{#if option.alias}
						<span class="break-words text-surface-700-300">{option.alias}</span>
						<ArrowRight size="14" class="shrink-0 opacity-70" aria-hidden="true" />
					{/if}
					<span class="min-w-0 font-medium break-words">{option.name}</span>
				</span>
				<span class="ms-auto flex flex-wrap justify-end gap-x-1.5 text-xs text-surface-700-300">
					{#if option.source === 'own'}
						<span>{m.skills.own}</span>
					{:else}
						{#if group}
							<span>{group}</span>
						{/if}
						{#if group && option.parent}
							<span aria-hidden="true">·</span>
						{/if}
						{#if option.parent}
							<span>{m.skills.partOf(option.parent)}</span>
						{/if}
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</div>
