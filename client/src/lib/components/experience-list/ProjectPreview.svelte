<script lang="ts">
	import { untrack } from 'svelte';
	import { previewedSkill, resolvePreview } from '#services/projectPreview.ts';

	// The short card shown next to a skill tag, or a bar of the timeline, while it is hovered or
	// focused with the keyboard: only the projects concerned (see projectPreview.ts). One for the
	// page: it follows every element with a `data-preview` attribute (see previewTarget), so tags
	// and bars only name what they preview. A tag that does nothing else (a card's skill chip)
	// also shows it when tapped, for touch screens.

	type Experiences = Parameters<typeof resolvePreview>[0];

	let {
		experiences,
		onSkill
	}: {
		/** Every experience of the page: what the previews are made from */
		experiences: Experiences;
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
		// Gone (removed, or scrolled out of sight): nothing to point at
		if (
			!anchor.isConnected ||
			rect.bottom < 0 ||
			rect.top > viewHeight ||
			rect.right < 0 ||
			rect.left > viewWidth
		) {
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
		class="card fixed z-30 w-80 max-w-[calc(100vw-1rem)] space-y-2 border border-surface-300-700 bg-surface-50-950 p-3 text-sm shadow-xl"
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
		{#if preview.entries.length > 0}
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
