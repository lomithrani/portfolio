<script lang="ts">
	import { untrack } from 'svelte';
	import { previewedSkill, resolvePreview, skillTimeline } from '#services/projectPreview.ts';
	import { placeSpan, type ExperienceView } from '#services/timeline.ts';

	// The short card shown next to a skill tag, or a bar of the timeline, while it is hovered or
	// focused with the keyboard: only the projects concerned (see projectPreview.ts). One for the
	// page: it follows every element with a `data-preview` attribute (see previewTarget), so tags
	// and bars only name what they preview. A tag that does nothing else (a card's skill chip)
	// also shows it when tapped, for touch screens. On the timeline view, the filters' tags draw
	// their projects as a small timeline of their own instead of a list: only them, over the years.

	type Experiences = Parameters<typeof resolvePreview>[0];

	let {
		experiences,
		view = 'list',
		onSkill
	}: {
		/** Every experience of the page: what the previews are made from */
		experiences: Experiences;
		/**
		 * The view of the page: a skill's projects are a list on the list; on the timeline, a small
		 * timeline for the filters' tags (a card's tags keep the list)
		 */
		view?: ExperienceView;
		/** The skill being previewed (its key), null when none: the page can point at its projects */
		onSkill?: (key: string | null) => void;
	} = $props();

	const uid = $props.id();
	/** Before a preview opens under the pointer (none while moving from one preview to the next) */
	const SHOW_DELAY = 150;
	/** Time to reach the preview with the pointer before it closes */
	const HIDE_DELAY = 200;
	const MARGIN = 8;
	const GAP = 6;

	let anchor: HTMLElement | null = $state.raw(null);
	let target: string | null = $state(null);
	let popover: HTMLElement | undefined = $state();
	let position: { left: number; top: number } | null = $state(null);
	let preview = $derived(target ? (resolvePreview(experiences, target) ?? null) : null);
	// A skill's projects over time: for the filters' tags on the timeline view only. A tag inside
	// an experience's card keeps the list, on the timeline view too (the card under the chart is
	// the list's card). None either when none of the projects can be placed: their experiences
	// have no dates.
	let chart = $derived.by(() => {
		if (view !== 'timeline' || !preview || !anchor || anchor.closest('article')) return null;
		const skill = previewedSkill(target);
		return skill ? (skillTimeline(experiences, skill) ?? null) : null;
	});

	// Plain spaces around the dot (a text expression: the template would trim them)
	const SEPARATOR = ' · ';
	type Axis = { start: number; end: number };
	const at = (month: number, axis: Axis) => placeSpan({ start: month, end: month }, axis).left;
	/** A year's label fits when its line is not at the very end of the axis */
	const labelFits = (month: number, axis: Axis) =>
		(axis.end - month) / Math.max(1, axis.end - axis.start) >= 0.09;

	/** Where the pointer entered the anchor: a wide bar shows its preview there */
	let pointerX: number | undefined;
	/** Opened by the keyboard's focus or by a tap: the pointer moving away does not close it */
	let pinned = false;
	/** The element just pressed (or dismissed with Escape): no preview until the pointer leaves it */
	let muted: HTMLElement | null = null;
	let showTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	const cancelShow = () => clearTimeout(showTimer);
	const cancelHide = () => clearTimeout(hideTimer);

	const hide = () => {
		cancelShow();
		cancelHide();
		anchor = null;
		target = null;
		position = null;
		pinned = false;
	};

	const show = (element: HTMLElement, x: number | undefined, pin = false) => {
		cancelShow();
		cancelHide();
		pointerX = x;
		pinned = pin;
		if (element !== anchor) position = null;
		anchor = element;
		target = element.dataset.preview ?? null;
	};

	const place = () => {
		if (!anchor || !popover) return;
		const rect = anchor.getBoundingClientRect();
		const viewWidth = document.documentElement.clientWidth;
		const viewHeight = document.documentElement.clientHeight;
		const outOfSight =
			rect.bottom < 0 || rect.top > viewHeight || rect.right < 0 || rect.left > viewWidth;
		// Focused with the keyboard while the page is still bringing it into view (it scrolls
		// smoothly): the preview waits for it, and is placed as the scroll goes (see onMove).
		// Only until it was placed once: scrolled away afterwards, it closes like any other
		if (
			anchor.isConnected &&
			outOfSight &&
			pinned &&
			!position &&
			anchor.contains(document.activeElement)
		) {
			return;
		}
		// Gone (removed, or scrolled out of sight): nothing to point at
		if (!anchor.isConnected || outOfSight) {
			hide();
			return;
		}
		const width = popover.offsetWidth;
		const height = popover.offsetHeight;
		let left = rect.left;
		// A wide anchor (a bar of the timeline): near the pointer rather than at its far left
		if (rect.width > width && pointerX !== undefined) {
			left = Math.min(Math.max(pointerX - 24, rect.left), rect.right - width);
		}
		left = Math.max(MARGIN, Math.min(left, viewWidth - width - MARGIN));
		// Under the anchor, or above it when only that side has the room
		let top = rect.bottom + GAP;
		if (top + height > viewHeight - MARGIN && rect.top - GAP - height >= MARGIN) {
			top = rect.top - GAP - height;
		}
		position = { left: Math.round(left), top: Math.round(Math.max(MARGIN, top)) };
	};

	$effect(() => {
		// Placed once rendered (it is measured), and again when its content changes
		if (anchor && preview && popover) untrack(place);
	});

	// The anchor is described by its preview while it shows (read after the tag's own name)
	$effect(() => {
		const element = anchor;
		if (!element || !preview) return;
		element.setAttribute('aria-describedby', `${uid}-preview`);
		return () => element.removeAttribute('aria-describedby');
	});

	$effect(() => {
		const key = preview ? previewedSkill(target) : null;
		untrack(() => onSkill?.(key));
	});

	$effect(() => {
		const anchorOf = (node: EventTarget | null) =>
			node instanceof Element ? node.closest<HTMLElement>('[data-preview]') : null;
		const inPopover = (node: EventTarget | null) =>
			node instanceof Node && !!popover?.contains(node);

		const onPointerOver = (event: PointerEvent) => {
			// A touch has no hover: tags answer taps (onClick)
			if (event.pointerType === 'touch') return;
			if (inPopover(event.target)) {
				cancelHide();
				return;
			}
			const element = anchorOf(event.target);
			if (element !== muted) muted = null;
			if (!element || element === muted) {
				cancelShow();
				if (anchor && !pinned) {
					cancelHide();
					hideTimer = setTimeout(hide, HIDE_DELAY);
				}
				return;
			}
			cancelHide();
			if (element === anchor) return;
			cancelShow();
			const x = event.clientX;
			showTimer = setTimeout(() => show(element, x), anchor ? 0 : SHOW_DELAY);
		};

		const onPointerLeave = () => {
			cancelShow();
			if (anchor && !pinned) hide();
		};

		const onFocusIn = (event: FocusEvent) => {
			const element = anchorOf(event.target);
			// Keyboard focus only: a pressed button keeps the focus without asking for a preview
			if (!element || !(event.target as Element).matches(':focus-visible')) return;
			show(element, undefined, true);
		};

		const onFocusOut = (event: FocusEvent) => {
			if (anchor && anchorOf(event.target) === anchor) hide();
		};

		const onClick = (event: MouseEvent) => {
			if (inPopover(event.target)) return;
			const element = anchorOf(event.target);
			if (element && !element.closest('button, a')) {
				// A tag that does nothing else: a press shows its preview, or closes it
				if (element === anchor && pinned) hide();
				else show(element, event.clientX, true);
				return;
			}
			// A button was pressed (a filter, a bar): its preview gets out of the way
			hide();
			muted = element;
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !anchor) return;
			muted = anchor;
			hide();
		};

		// The page moved under the preview: it follows its anchor
		let frame = 0;
		const onMove = (event: Event) => {
			if (!anchor || inPopover(event.target)) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(place);
		};

		const root = document.documentElement;
		document.addEventListener('pointerover', onPointerOver);
		root.addEventListener('pointerleave', onPointerLeave);
		document.addEventListener('focusin', onFocusIn);
		document.addEventListener('focusout', onFocusOut);
		document.addEventListener('click', onClick);
		document.addEventListener('keydown', onKeyDown);
		window.addEventListener('scroll', onMove, { capture: true, passive: true });
		window.addEventListener('resize', onMove);
		return () => {
			document.removeEventListener('pointerover', onPointerOver);
			root.removeEventListener('pointerleave', onPointerLeave);
			document.removeEventListener('focusin', onFocusIn);
			document.removeEventListener('focusout', onFocusOut);
			document.removeEventListener('click', onClick);
			document.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('scroll', onMove, { capture: true });
			window.removeEventListener('resize', onMove);
			cancelAnimationFrame(frame);
			cancelShow();
			cancelHide();
		};
	});
</script>

{#if anchor && preview}
	<div
		bind:this={popover}
		id="{uid}-preview"
		role="tooltip"
		class="card fixed z-30 {chart
			? 'w-96'
			: 'w-80'} max-w-[calc(100vw-1rem)] space-y-2 border border-surface-300-700 bg-surface-50-950 p-3 text-sm shadow-xl"
		style:left="{position?.left ?? 0}px"
		style:top="{position?.top ?? 0}px"
		style:visibility={position ? 'visible' : 'hidden'}
		data-project-preview={preview.kind}
	>
		<div>
			<p class="font-semibold wrap-anywhere">{preview.title}</p>
			{#if preview.caption}
				<p class="text-xs text-surface-700-300 wrap-anywhere">{preview.caption}</p>
			{/if}
			{#if preview.period}
				<p class="text-xs text-surface-700-300">{preview.period}</p>
			{/if}
		</div>
		{#if preview.skills.hard.length > 0 || preview.skills.soft.length > 0}
			<ul class="flex flex-wrap gap-1" aria-label="Skills">
				{#each preview.skills.hard as name (name)}
					<li class="chip preset-tonal-primary px-1.5 py-0.5 text-xs">{name}</li>
				{/each}
				{#each preview.skills.soft as name (name)}
					<li
						class="chip bg-[color-mix(in_oklab,var(--color-primary-50-950)_45%,transparent)] px-1.5 py-0.5 text-xs text-primary-950-50"
					>
						{name}
					</li>
				{/each}
			</ul>
		{/if}
		{#if chart}
			<!-- The skill's projects alone, over the years: a line of text and a bar each -->
			<div
				class="max-h-64 overflow-x-hidden overflow-y-auto border-t border-surface-200-800 pt-2"
				data-preview-timeline
			>
				<div class="relative">
					<div class="pointer-events-none absolute inset-0" aria-hidden="true">
						{#each chart.years as year (year.year)}
							{#if year.labelled}
								<div
									class="absolute inset-y-0 border-l border-surface-200-800"
									style:left={at(year.month, chart)}
								></div>
							{/if}
						{/each}
						{#if chart.today !== undefined}
							<div
								class="absolute inset-y-0 border-l border-dotted border-primary-500"
								style:left={chart.today === chart.end ? 'calc(100% - 1px)' : at(chart.today, chart)}
							></div>
						{/if}
					</div>
					<div
						class="relative h-4 text-[0.6875rem] leading-4 text-surface-700-300"
						aria-hidden="true"
					>
						{#each chart.years as year (year.year)}
							{#if year.labelled && labelFits(year.month, chart)}
								<span class="absolute pl-1" style:left={at(year.month, chart)}>{year.year}</span>
							{/if}
						{/each}
					</div>
					<ul class="relative space-y-2 pt-1 pb-0.5" aria-label="Projects">
						{#each chart.bars as bar, index (index)}
							{@const place = placeSpan(bar.span, chart)}
							<li>
								<!-- Its own background: the year lines run between the lines of text, behind the bars -->
								<div class="flex items-baseline justify-between gap-x-3 bg-surface-50-950">
									<p class="min-w-0 truncate">
										<span class="font-medium">{bar.name}</span>{#if bar.context}<span
												class="text-xs text-surface-700-300">{SEPARATOR}{bar.context}</span
											>{/if}
									</p>
									{#if bar.period}
										<p class="text-xs whitespace-nowrap text-surface-700-300">{bar.period}</p>
									{/if}
								</div>
								<div
									class="mt-0.5 h-1.5 min-w-1 rounded-full {bar.undated
										? 'border border-dashed border-primary-500'
										: 'bg-primary-500'} {bar.ongoing ? 'rounded-r-none' : ''}"
									style:margin-left={place.left}
									style:width={place.width}
									data-preview-bar
								></div>
							</li>
						{/each}
					</ul>
				</div>
				{#if chart.undated.length > 0}
					<p class="pt-2 text-xs text-surface-700-300">
						Without dates: {chart.undated.map((entry) => entry.name).join(', ')}
					</p>
				{/if}
			</div>
		{:else if preview.entries.length > 0}
			<ul
				class="max-h-60 space-y-1.5 overflow-y-auto border-t border-surface-200-800 pt-2"
				aria-label="Projects"
			>
				{#each preview.entries as entry, index (index)}
					<li>
						<div class="flex flex-wrap items-baseline justify-between gap-x-3">
							<p class="font-medium wrap-anywhere">{entry.name}</p>
							{#if entry.period}
								<p class="text-xs whitespace-nowrap text-surface-700-300">{entry.period}</p>
							{/if}
						</div>
						{#if entry.context}
							<p class="text-xs text-surface-700-300 wrap-anywhere">{entry.context}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
