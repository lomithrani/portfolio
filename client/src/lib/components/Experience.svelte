<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import { PencilSquare, Briefcase, User, AcademicCap, Heart } from 'svelte-heros-v2';
	import { ExperienceType } from 'portfolio-common';
	import Project from './Project.svelte';
	import Markdown from './Markdown.svelte';
	import {
		experienceSubtitle,
		experienceTypeLabels
	} from '#components/experience-list/experienceList.ts';
	import { experiencePeriod } from '#services/experienceDates.ts';
	import { projectMatchesFilters } from '#services/filters.ts';

	const typeIcons: Record<ExperienceType, typeof Briefcase> = {
		[ExperienceType.Professional]: Briefcase,
		[ExperienceType.Personal]: User,
		[ExperienceType.Educational]: AcademicCap,
		[ExperienceType.Leisure]: Heart
	};

	let {
		experience,
		canEdit = false,
		onEdit,
		highlightSkill = () => false,
		highlighted = false,
		revealedProject = null,
		previewSkill = null,
		muted = false
	}: {
		experience: ExperienceModel;
		/** Shows the owner's Edit button */
		canEdit?: boolean;
		onEdit?: () => void;
		/** Whether a skill (by display name) matches the active filters */
		highlightSkill?: (displayName: string) => boolean;
		/** Briefly outlined after it was saved */
		highlighted?: boolean;
		/** Position of the project to outline briefly: the one picked on the timeline */
		revealedProject?: number | null;
		/** Key of the skill whose tag is hovered or focused: its projects are outlined */
		previewSkill?: string | null;
		/** Stepped back while that skill is previewed: none of its projects uses it */
		muted?: boolean;
	} = $props();

	let id = $derived(String(experience._id));
	let DefaultIcon = $derived(typeIcons[experience.type] ?? Briefcase);
	// Plain spaces around the dot: lines may break after it
	const SEPARATOR = ' · ';
	let subtitle = $derived(experienceSubtitle(experience));
	// Its projects' dates are read inside it: one without an end stopped with it when it ended
	let period = $derived(experiencePeriod(experience));
	let previewFilters = $derived({ skills: previewSkill ? [previewSkill] : [] });
	let summary = $derived(experience.summary?.trim() ?? '');

	// The summary is clamped to ~4 lines; "Show more" appears only when it overflows, which
	// can only be measured in the browser (the server render shows the clamp alone)
	let summaryElement: HTMLDivElement | undefined = $state();
	let toggleButton: HTMLButtonElement | undefined = $state();
	let expanded = $state(false);
	let overflows = $state(false);

	$effect(() => {
		const element = summaryElement;
		if (!element) return;
		void summary;
		const measure = () => {
			if (!expanded) overflows = element.scrollHeight > element.clientHeight + 1;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	});

	const toggleSummary = () => {
		expanded = !expanded;
		// Collapsing a long summary can leave the button above the viewport: bring it back
		if (!expanded) requestAnimationFrame(() => toggleButton?.scrollIntoView({ block: 'nearest' }));
	};
</script>

<article
	id="experience-{id}"
	aria-labelledby="experience-{id}-title"
	class="card preset-outlined-surface-200-800 bg-surface-50-950 scroll-mt-4 space-y-4 rounded-lg p-4 shadow-sm motion-safe:[transition:box-shadow_700ms_ease,opacity_150ms_ease] md:p-5 {highlighted
		? 'ring-2 ring-primary-500'
		: 'ring-0 ring-transparent'} {muted ? 'opacity-50' : ''}"
	data-highlighted={highlighted || undefined}
	data-muted={muted || undefined}
>
	<div class="flex items-start gap-3">
		<div
			class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md preset-tonal-primary"
		>
			{#if experience.icon}
				<img src={experience.icon} alt="" class="size-8 object-contain" />
			{:else}
				<DefaultIcon size="22" aria-hidden="true" />
			{/if}
		</div>
		<div class="min-w-0 flex-1 space-y-0.5">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				<h2
					id="experience-{id}-title"
					class="text-lg font-bold leading-snug wrap-anywhere md:text-xl"
				>
					{experience.title}
				</h2>
				{#if experience.type !== ExperienceType.Professional && experienceTypeLabels[experience.type]}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium preset-tonal-secondary whitespace-nowrap"
					>
						{experienceTypeLabels[experience.type]}
					</span>
				{/if}
			</div>
			{#if subtitle.length > 0}
				<!-- Lines break between parts, and never inside a period or a duration -->
				<p class="text-sm text-surface-700-300">
					{#each subtitle as part, index (part.kind)}{#if index > 0}{SEPARATOR}{/if}<span
							class:whitespace-nowrap={part.kind === 'period' || part.kind === 'duration'}
							>{part.text}</span
						>{/each}
				</p>
			{/if}
		</div>
		{#if canEdit}
			<!-- In the flex row (not absolutely positioned): a long title wraps instead of running under it -->
			<button
				type="button"
				class="btn preset-tonal min-h-10 min-w-10 shrink-0 px-2.5 sm:px-3"
				aria-label="Edit {experience.title}"
				data-edit-experience
				onclick={() => onEdit?.()}
			>
				<PencilSquare size="18" aria-hidden="true" />
				<span class="hidden sm:inline">Edit</span>
			</button>
		{/if}
	</div>

	{#if summary}
		<div>
			<div
				id="experience-{id}-summary"
				class="summary text-sm"
				class:clamped={!expanded}
				class:faded={!expanded && overflows}
				bind:this={summaryElement}
			>
				<Markdown content={summary} headingOffset={2} compact />
			</div>
			{#if overflows}
				<button
					type="button"
					class="btn btn-sm -ml-2 mt-1 min-h-9 px-2 text-primary-700-300 hover:underline"
					aria-expanded={expanded}
					aria-controls="experience-{id}-summary"
					onclick={toggleSummary}
					bind:this={toggleButton}
				>
					{expanded ? 'Show less' : 'Show more'}
				</button>
			{/if}
		</div>
	{/if}

	{#if experience.projects.length > 0}
		<!-- Each project has its own vertical padding (see Project.svelte): 1rem between two -->
		<div class="ml-1 space-y-1 border-l-2 border-surface-200-800 pl-4">
			{#each experience.projects as project, index (String(project._id ?? index))}
				<div class="scroll-my-4" data-project-index={index}>
					<Project
						{project}
						experienceId={id}
						within={period}
						{highlightSkill}
						revealed={revealedProject === index}
						previewed={projectMatchesFilters(project, previewFilters)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</article>

<style>
	/* ~4 lines of the summary (line-height 1.6, see Markdown.svelte) */
	.clamped {
		max-height: calc(1.6em * 4);
		overflow: hidden;
	}
	.faded {
		mask-image: linear-gradient(to bottom, #000 calc(100% - 1.6em), transparent);
	}
</style>
