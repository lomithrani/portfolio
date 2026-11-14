<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import { ExperienceType } from 'portfolio-common';
	import { flushSync } from 'svelte';
	import {
		AcademicCap,
		Briefcase,
		Heart,
		MagnifyingGlassMinus,
		MagnifyingGlassPlus,
		User
	} from 'svelte-heros-v2';
	import {
		buildTimeline,
		closestMonthWidth,
		defaultMonthWidth,
		placeSpan,
		timelineTicks
	} from '#services/timeline.ts';
	import {
		experiencePeriod,
		formatMonthRange,
		formatProjectMonths
	} from '#services/experienceDates.ts';
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
	let months = $derived(timeline.end - timeline.start);
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

	// --- Zoom -----------------------------------------------------------------------------------
	// The zoom is the width of a month. The timeline opens with its shortest bar wide enough to be
	// read (see defaultMonthWidth) and scrolls sideways; the wheel, a pinch or the buttons change
	// it, between the whole axis in sight and the closest zoom.
	let scroller: HTMLElement | undefined = $state();
	let track: HTMLElement | undefined = $state();
	/** The month's width the visitor chose; null until they zoom */
	let zoom: number | null = $state(null);
	/** The width the axis has to fill: the scroller's, without its padding (0 until measured) */
	let available = $state(0);
	/** The month's width that shows the whole axis: the farthest zoom (0 until measured) */
	let fit = $derived(available > 0 && months > 0 ? available / months : 0);
	let closest = $derived(Math.max(closestMonthWidth(months), fit));
	// A page wider than the axis stretches it: a month is never narrower than at the farthest zoom
	let monthWidth = $derived(Math.max(zoom ?? defaultMonthWidth(timeline), fit));
	let ticks = $derived(timelineTicks(axis, monthWidth));
	let monthly = $derived(ticks.some((tick) => !tick.year));
	let canZoomIn = $derived(monthWidth < closest - 0.01);
	let canZoomOut = $derived(fit > 0 && monthWidth > fit + 0.01);

	/**
	 * Sets the month's width, within the zoom's limits, keeping the month at `clientX` where it
	 * is on the screen. False when the zoom is already at that limit.
	 */
	const zoomTo = (width: number, clientX: number): boolean => {
		if (!scroller || !track || months <= 0 || fit <= 0) return false;
		const next = Math.min(Math.max(width, fit), closest);
		if (Math.abs(next - monthWidth) < 0.001) return false;
		const before = track.getBoundingClientRect();
		const ratio = before.width > 0 ? (clientX - before.left) / before.width : 0;
		flushSync(() => (zoom = next));
		const after = track.getBoundingClientRect();
		scroller.scrollLeft += after.left + ratio * after.width - clientX;
		return true;
	};

	/** The buttons: around the middle of what is in sight */
	const zoomBy = (factor: number) => {
		if (!scroller) return;
		const view = scroller.getBoundingClientRect();
		zoomTo(monthWidth * factor, view.left + view.width / 2);
	};

	$effect(() => {
		const element = scroller;
		if (!element) return;

		// The wheel zooms once the pointer was moved over the timeline. A page scrolled with the
		// wheel brings the timeline under a pointer that did not move: it keeps scrolling the page.
		// (Browsers send a move event for that too, at the same place on the screen.)
		let armed = false;
		let screenX = NaN;
		let screenY = NaN;
		const onPointerMove = (event: PointerEvent) => {
			if (event.screenX === screenX && event.screenY === screenY) return;
			screenX = event.screenX;
			screenY = event.screenY;
			armed = event.target instanceof Node && element.contains(event.target);
		};

		const onWheel = (event: WheelEvent) => {
			// Ctrl + wheel is also what a trackpad's pinch sends
			const pinching = event.ctrlKey;
			// A sideways wheel (or Shift + wheel) scrolls along the axis
			const sideways = event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY);
			if (!pinching && (!armed || sideways)) return;
			const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 400 : 1;
			const factor = Math.exp(-event.deltaY * unit * (pinching ? 0.01 : 0.002));
			// At a limit the wheel goes back to the page: the timeline never traps the scroll
			if (zoomTo(monthWidth * factor, event.clientX) || pinching) event.preventDefault();
		};

		// Two fingers: the timeline's zoom follows their spread (the page's own pinch zoom is off
		// over the timeline, see touch-action)
		let pinch: { spread: number; width: number } | null = null;
		const spread = (touches: TouchList) =>
			Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
		const onTouchStart = (event: TouchEvent) => {
			pinch =
				event.touches.length === 2 ? { spread: spread(event.touches), width: monthWidth } : null;
		};
		const onTouchMove = (event: TouchEvent) => {
			if (!pinch || event.touches.length !== 2) return;
			if (event.cancelable) event.preventDefault();
			if (pinch.spread <= 0) return;
			zoomTo(
				(pinch.width * spread(event.touches)) / pinch.spread,
				(event.touches[0].clientX + event.touches[1].clientX) / 2
			);
		};
		const onTouchEnd = (event: TouchEvent) => {
			if (event.touches.length < 2) pinch = null;
		};

		document.addEventListener('pointermove', onPointerMove, { passive: true });
		element.addEventListener('wheel', onWheel, { passive: false });
		element.addEventListener('touchstart', onTouchStart, { passive: true });
		element.addEventListener('touchmove', onTouchMove, { passive: false });
		element.addEventListener('touchend', onTouchEnd);
		element.addEventListener('touchcancel', onTouchEnd);
		return () => {
			document.removeEventListener('pointermove', onPointerMove);
			element.removeEventListener('wheel', onWheel);
			element.removeEventListener('touchstart', onTouchStart);
			element.removeEventListener('touchmove', onTouchMove);
			element.removeEventListener('touchend', onTouchEnd);
			element.removeEventListener('touchcancel', onTouchEnd);
		};
	});

	// Opens on the most recent months: a career scrolls back in time
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
		<div
			class="scroller overflow-x-auto px-3 pt-3 pb-2 md:px-4 md:pt-4"
			bind:this={scroller}
			data-timeline-scroller
		>
			<!-- As wide as the scroller's content box, whatever the axis overflows by -->
			<div class="h-0" bind:clientWidth={available}></div>
			<div
				class="relative min-w-full"
				style:width="{Math.round(months * monthWidth)}px"
				bind:this={track}
				data-timeline-track
			>
				<!-- The axis' lines and the current month, behind the bars -->
				<div class="pointer-events-none absolute inset-0" aria-hidden="true">
					{#each ticks as tick (tick.month)}
						<div
							class="absolute inset-y-0 border-l {tick.year && monthly
								? 'border-surface-300-700'
								: 'border-surface-200-800'}"
							style:left={at(tick.month)}
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
					{#each ticks as tick (tick.month)}
						{#if tick.label}
							<span
								class="absolute pl-1.5 whitespace-nowrap {tick.year && monthly
									? 'font-semibold'
									: ''}"
								style:left={at(tick.month)}
								data-timeline-tick>{tick.label}</span
							>
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
													, {formatProjectMonths(entry.project, experiencePeriod(experience)) ||
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
			<p>Select a bar to read about it. Scroll or pinch over the timeline to zoom.</p>
			<div class="flex gap-1" role="group" aria-label="Zoom">
				<button
					type="button"
					class="btn-icon btn-icon-sm size-8 hover:preset-tonal"
					aria-label="Zoom out"
					title="Zoom out"
					disabled={!canZoomOut}
					onclick={() => zoomBy(1 / 1.6)}
				>
					<MagnifyingGlassMinus size="16" aria-hidden="true" />
				</button>
				<button
					type="button"
					class="btn-icon btn-icon-sm size-8 hover:preset-tonal"
					aria-label="Zoom in"
					title="Zoom in"
					disabled={!canZoomIn}
					onclick={() => zoomBy(1.6)}
				>
					<MagnifyingGlassPlus size="16" aria-hidden="true" />
				</button>
			</div>
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

	/* Two fingers zoom the timeline, not the page (one still scrolls both ways) */
	.scroller {
		touch-action: pan-x pan-y;
	}

	.bar {
		display: flex;
		align-items: center;
		/* A bar keeps to its months, however few: its label is cut at its edge (clip, not hidden:
			the label stays sticky to the timeline's scroll), so a short bar never covers the next */
		overflow: clip;
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
