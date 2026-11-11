<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import { ExperienceType } from 'portfolio-common';
	import { AcademicCap, Briefcase, Heart, User } from 'svelte-heros-v2';
	import { buildTimeline, placeSpan, timelineMinWidth } from '#services/timeline.ts';
	import { experiencePeriod, formatMonthRange } from '#services/experienceDates.ts';
	import { projectMatchesFilters, type ExperienceFilters } from '#services/filters.ts';
	import { previewTarget } from '#services/projectPreview.ts';
	import { experienceTypeLabels } from '#components/experience-list/experienceList.ts';

	let {
		experiences,
		filters,
		previewSkill = null,
		selectedId = null,
		onSelect
	}: {
		/** Every experience of the page: the timeline dims what the filters leave out, it hides nothing */
		experiences: ExperienceModel[];
		/** The filters that apply (see activeFilters): their projects are drawn bigger */
		filters: ExperienceFilters;
		/** Key of the skill whose tag is hovered or focused: its projects are outlined */
		previewSkill?: string | null;
		/** The experience whose card is shown under the timeline */
		selectedId?: string | null;
		/** A bar was pressed: an experience's, or one of its projects' (by position) */
		onSelect: (experienceId: string, projectIndex?: number) => void;
	} = $props();

	const uid = $props.id();

	let timeline = $derived(buildTimeline(experiences));
	let axis = $derived({ start: timeline.start, end: timeline.end });
	let minWidth = $derived(timelineMinWidth(timeline.end - timeline.start));
	let filtering = $derived(filters.skills.length > 0);
	let previewFilters = $derived({ skills: previewSkill ? [previewSkill] : [] });
	let types = $derived(
		Object.values(ExperienceType).filter((type) =>
			timeline.items.some((item) => item.experience.type === type)
		)
	);

	const at = (month: number) => placeSpan({ start: month, end: month }, axis).left;

	// An experience's bar tells its type by its icon (as its card does) and its colour, both named
	// in the legend: a theme's colours can be close to one another
	const typeIcons: Record<ExperienceType, typeof Briefcase> = {
		[ExperienceType.Professional]: Briefcase,
		[ExperienceType.Educational]: AcademicCap,
		[ExperienceType.Personal]: User,
		[ExperienceType.Leisure]: Heart
	};
	const typeTones: Record<ExperienceType, string> = {
		[ExperienceType.Professional]: 'preset-tonal-primary',
		[ExperienceType.Educational]: 'preset-tonal-secondary',
		[ExperienceType.Personal]: 'preset-tonal-tertiary',
		[ExperienceType.Leisure]: 'preset-tonal-surface'
	};

	// Plain spaces around the dot (a text expression: the template would trim them)
	const SEPARATOR = ' · ';

	const periodOf = (experience: ExperienceModel) => {
		const period = experiencePeriod(experience);
		return formatMonthRange(period.start, period.ongoing ? undefined : period.end);
	};

	// Opens on the most recent years: a long career scrolls back in time
	let scroller: HTMLElement | undefined = $state();
	$effect(() => {
		if (scroller) scroller.scrollLeft = scroller.scrollWidth;
	});
</script>

<section
	class="card preset-outlined-surface-200-800 bg-surface-50-950 shadow-sm"
	aria-label="Timeline"
	data-timeline
>
	{#if timeline.items.length > 0}
		<div class="overflow-x-auto px-3 pt-3 pb-2 md:px-4 md:pt-4" bind:this={scroller}>
			<div class="relative" style:min-width="{minWidth}px">
				<!-- Year lines and the current month, behind the bars -->
				<div class="pointer-events-none absolute inset-0" aria-hidden="true">
					{#each timeline.years as year (year.year)}
						<div
							class="absolute inset-y-0 border-l border-surface-200-800"
							style:left={at(year.month)}
						></div>
					{/each}
					{#if timeline.today !== undefined}
						<div
							class="absolute inset-y-0 border-l-2 border-dotted border-primary-500"
							style:left={at(timeline.today)}
							data-today
						></div>
					{/if}
				</div>
				<div class="relative h-6 text-xs text-surface-700-300" aria-hidden="true">
					{#each timeline.years as year (year.year)}
						{#if year.labelled}
							<span class="absolute pl-1.5" style:left={at(year.month)}>{year.year}</span>
						{/if}
					{/each}
				</div>

				<!-- One row per lane: experiences that overlap in time sit under one another. Each
					experience is placed in its row by its margin and width, and its projects the same
					way inside it -->
				<ol class="lanes relative grid gap-y-4 pt-1 pb-2">
					{#each timeline.items as item (String(item.experience._id))}
						{@const experience = item.experience}
						{@const id = String(experience._id)}
						{@const block = placeSpan(item.extent, axis)}
						{@const own = placeSpan(item.span, item.extent)}
						{@const matches = item.projects.some(({ project }) =>
							projectMatchesFilters(project, filters)
						)}
						{@const selected = selectedId === id}
						{@const TypeIcon = typeIcons[experience.type] ?? Briefcase}
						<li
							class="min-w-0 space-y-1"
							style:grid-row={item.lane + 1}
							style:margin-left={block.left}
							style:width={block.width}
							data-lane={item.lane}
						>
							<button
								type="button"
								class="bar h-8 border border-surface-300-700 text-sm font-semibold {filtering &&
								!matches
									? 'bg-surface-100-900 text-surface-700-300'
									: typeTones[experience.type]} {item.ongoing ? 'rounded-r-none' : ''} {selected
									? 'ring-2 ring-primary-500'
									: ''}"
								style:margin-left={own.left}
								style:width={own.width}
								aria-pressed={selected}
								data-preview={previewTarget.experience(id)}
								data-timeline-experience
								onclick={() => onSelect(id)}
							>
								<span class="bar-label">
									<TypeIcon size="14" aria-hidden="true" class="mr-1 inline-block align-[-2px]" />
									{experience.title}{#if experience.company?.name}<span class="font-normal"
											>{SEPARATOR}{experience.company.name}</span
										>{/if}
								</span>
								<span class="sr-only">
									, {experienceTypeLabels[experience.type]}, {periodOf(experience)}
								</span>
							</button>
							{#if item.projects.length > 0}
								<ul class="lanes grid gap-y-1" aria-label="Projects of {experience.title}">
									{#each item.projects as entry (entry.index)}
										{@const place = placeSpan(entry.span, item.extent)}
										{@const matched = projectMatchesFilters(entry.project, filters)}
										{@const previewed = projectMatchesFilters(entry.project, previewFilters)}
										<li
											class="min-w-0 self-center"
											style:grid-row={entry.row + 1}
											style:margin-left={place.left}
											style:width={place.width}
										>
											<button
												type="button"
												class="bar w-full border text-xs {matched
													? 'h-9 border-primary-700-300 preset-filled-primary-700-300 font-semibold'
													: filtering
														? 'h-6 border-surface-200-800 bg-surface-50-950 text-surface-700-300'
														: 'h-7 border-surface-300-700 bg-surface-100-900'} {entry.undated
													? 'border-dashed'
													: ''} {entry.ongoing ? 'rounded-r-none' : ''} {previewed
													? 'ring-2 ring-primary-500'
													: ''}"
												data-preview={previewTarget.project(id, entry.index)}
												data-timeline-project
												data-matched={matched || undefined}
												data-previewed={previewed || undefined}
												onclick={() => onSelect(id, entry.index)}
											>
												<span class="bar-label">{entry.project.name}</span>
												<span class="sr-only">
													, {formatMonthRange(entry.project.start, entry.project.end) ||
														'no dates'}{#if matched}, uses the selected skills{/if}
												</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		</div>

		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-surface-200-800 px-3 py-2 text-xs text-surface-700-300 md:px-4"
		>
			<p>Select a bar to read about it.</p>
			{#if types.length > 1}
				<ul class="ml-auto flex flex-wrap gap-x-3 gap-y-1" aria-label="Types of experience">
					{#each types as type (type)}
						{@const TypeIcon = typeIcons[type]}
						<li class="flex items-center gap-1.5">
							<span
								class="flex size-5 items-center justify-center rounded-sm border border-surface-300-700 {typeTones[
									type
								]}"
								aria-hidden="true"
							>
								<TypeIcon size="12" />
							</span>
							{experienceTypeLabels[type]}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<p class="p-6 text-center text-surface-700-300">
			None of these experiences has dates yet: there is nothing to place on a timeline.
		</p>
	{/if}

	{#if timeline.undated.length > 0}
		<div
			class="flex flex-wrap items-center gap-2 border-t border-surface-200-800 px-3 py-2 text-sm md:px-4"
		>
			<p id="{uid}-undated" class="text-xs text-surface-700-300">Without dates</p>
			<ul class="flex flex-wrap gap-2" aria-labelledby="{uid}-undated">
				{#each timeline.undated as experience (String(experience._id))}
					{@const id = String(experience._id)}
					<li>
						<button
							type="button"
							class="chip min-h-8 border border-surface-300-700 {selectedId === id
								? 'ring-2 ring-primary-500'
								: ''}"
							aria-pressed={selectedId === id}
							data-preview={previewTarget.experience(id)}
							onclick={() => onSelect(id)}
						>
							{experience.title}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

<style>
	/* Every item of a row shares the row's one cell, each at its own place along the time axis */
	.lanes {
		grid-template-columns: minmax(0, 1fr);
	}
	.lanes > :global(li) {
		grid-column: 1;
	}

	.bar {
		display: flex;
		align-items: center;
		min-width: 0.75rem;
		border-radius: var(--radius-base, 0.375rem);
		cursor: pointer;
		text-align: left;
		transition:
			height 150ms,
			background-color 150ms,
			box-shadow 150ms;
	}
	.bar:hover {
		filter: brightness(0.96);
	}
	.bar:focus-visible {
		outline: 2px solid var(--color-primary-500);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.bar {
			transition: none;
		}
	}

	/* The name stays in sight while its bar is scrolled partly out of the timeline, and is cut
		with an ellipsis when the bar is too short for it */
	.bar-label {
		position: sticky;
		left: 0;
		min-width: 0;
		overflow: hidden;
		padding-inline: 0.5rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
