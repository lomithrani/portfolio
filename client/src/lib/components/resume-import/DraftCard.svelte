<!--
@component
One experience read from a résumé, in the import's review: what it holds at a glance, whether it
is ticked to be added, and why it may need a look first (an experience with the same title and
company already in the portfolio, fields the editor would refuse, a failed attempt to add it).
-->
<script lang="ts">
	import { CheckCircle, ExclamationTriangle, PencilSquare, XCircle } from 'svelte-heros-v2';
	import { ExperienceType } from 'portfolio-common';
	import type { FieldError } from '#services/experienceForm.ts';
	import {
		draftPeriodText,
		draftSkills,
		problemsText,
		summaryPreview,
		type ImportDraft
	} from '#services/resumeImport.ts';
	import { experienceTypeLabels } from '#components/experience-list/experienceList.ts';

	let {
		draft,
		duplicate,
		problems,
		disabled = false,
		onselect,
		onedit
	}: {
		draft: ImportDraft;
		/** The portfolio already has an experience with this title and company */
		duplicate: boolean;
		/** What the editor would refuse: the draft cannot be added as it is */
		problems: FieldError[];
		/** While drafts are being added */
		disabled?: boolean;
		onselect: (selected: boolean) => void;
		onedit: () => void;
	} = $props();

	const SKILLS_SHOWN = 6;
	// Plain spaces around the dot: lines may break after it
	const SEPARATOR = ' · ';
	const uid = $props.id();

	let added = $derived(draft.status === 'added');
	let title = $derived(draft.form.title.trim() || 'Untitled experience');
	let subtitle = $derived(
		[
			draft.form.company.name.trim(),
			draft.form.location.trim(),
			draftPeriodText(draft.form)
		].filter(Boolean)
	);
	let preview = $derived(summaryPreview(draft.form.summary));
	let skills = $derived(draftSkills(draft.form));
	let projectCount = $derived(draft.form.projects.length);
</script>

<article
	aria-labelledby="{uid}-title"
	class="rounded-container border p-3 transition-colors sm:p-4 {added
		? 'border-success-500/40 bg-success-50-950/40'
		: draft.selected
			? 'border-primary-500/70 bg-surface-50-950'
			: 'border-surface-200-800 bg-surface-50-950'}"
	data-import-draft={draft.id}
>
	<div class="flex items-start gap-2 sm:gap-3">
		{#if added}
			<div class="flex size-10 shrink-0 items-center justify-center" aria-hidden="true">
				<CheckCircle size="24" class="text-success-700-300" />
			</div>
		{:else}
			<!-- The label makes a 40 px target around the box -->
			<label class="-ms-1 flex size-10 shrink-0 cursor-pointer items-center justify-center">
				<input
					type="checkbox"
					class="checkbox size-5"
					checked={draft.selected}
					{disabled}
					aria-label="Include {title}"
					onchange={(event) => onselect(event.currentTarget.checked)}
				/>
			</label>
		{/if}

		<div class="min-w-0 flex-1 space-y-1.5 pt-1.5">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				<h3 id="{uid}-title" class="font-semibold leading-snug wrap-anywhere">{title}</h3>
				{#if draft.form.type !== ExperienceType.Professional}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium preset-tonal-secondary whitespace-nowrap"
					>
						{experienceTypeLabels[draft.form.type]}
					</span>
				{/if}
				{#if added}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium preset-tonal-success whitespace-nowrap"
					>
						Added
					</span>
				{/if}
			</div>

			{#if subtitle.length > 0}
				<p class="text-sm text-surface-700-300">
					{#each subtitle as part, index (index)}{#if index > 0}{SEPARATOR}{/if}<span
							class:whitespace-nowrap={index === subtitle.length - 1}>{part}</span
						>{/each}
				</p>
			{/if}

			{#if !added}
				{#if preview}
					<p class="line-clamp-3 text-sm whitespace-pre-line text-surface-700-300">{preview}</p>
				{/if}

				{#if projectCount > 0 || skills.length > 0}
					<div class="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
						{#if projectCount > 0}
							<span class="me-1 font-medium text-surface-700-300">
								{projectCount}
								{projectCount === 1 ? 'project' : 'projects'}
							</span>
						{/if}
						{#if skills.length > 0}
							<span class="sr-only">Skills:</span>
							{#each skills.slice(0, SKILLS_SHOWN) as skill (skill)}
								<span class="rounded-full preset-tonal px-2 py-0.5">{skill}</span>
							{/each}
							{#if skills.length > SKILLS_SHOWN}
								<span class="text-surface-700-300">+{skills.length - SKILLS_SHOWN} more</span>
							{/if}
						{/if}
					</div>
				{/if}

				{#if duplicate}
					<p class="flex items-start gap-1.5 text-sm text-warning-800-200">
						<ExclamationTriangle size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
						<span>Already in your portfolio: an experience has the same title and company.</span>
					</p>
				{/if}
				{#if draft.status === 'failed' && draft.error}
					<p class="flex items-start gap-1.5 text-sm text-error-700-300">
						<XCircle size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
						<span>Not added: {draft.error}</span>
					</p>
				{:else if problems.length > 0}
					<p class="flex items-start gap-1.5 text-sm text-warning-800-200">
						<ExclamationTriangle size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
						<span>Edit before adding · {problemsText(problems)}</span>
					</p>
				{/if}
			{/if}
		</div>

		{#if !added}
			<button
				type="button"
				class="btn btn-sm min-h-10 shrink-0 px-2.5 sm:px-3 {draft.status === 'failed' ||
				problems.length > 0
					? 'preset-tonal-primary'
					: 'preset-tonal'}"
				{disabled}
				aria-label="Edit {title}"
				data-edit-draft
				onclick={onedit}
			>
				<PencilSquare size="16" aria-hidden="true" />
				<span class="max-sm:sr-only">Edit</span>
			</button>
		{/if}
	</div>
</article>
