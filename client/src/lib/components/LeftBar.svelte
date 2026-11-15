<script lang="ts">
	import { page } from '$app/state';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';
	import type { Domain, Experience } from 'portfolio-api/models/database';
	import { AcademicCap, ComputerDesktop, WrenchScrewdriver, ChevronRight } from 'svelte-heros-v2';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { isDomainAdmin } from '#services/authentication.ts';
	import ThemeToggle from '#components/ThemeToggle.svelte';
	import { browser } from '$app/env';

	let { domain }: { domain: Omit<Domain, 'experiences'> & { experiences: Experience[] } } =
		$props();

	// Admin-only entries appear once the session has been checked with the API (in the browser,
	// after hydration), so the server and client markup match
	let isAdmin = $derived($sessionCheckedStore && isDomainAdmin($authenticationStore, domain));

	const pathStartsWith = (path: string, pagePathName: string) => pagePathName.startsWith(path);

	let menuItems = [
		{
			path: '/experiences',
			label: 'Experiences',
			icon: ComputerDesktop
		},
		{
			path: '/hire',
			label: 'Hire',
			selected: pathStartsWith,
			icon: AcademicCap
		},
		{
			path: '/admin',
			label: 'Admin',
			display: () => isAdmin,
			selected: pathStartsWith,
			icon: WrenchScrewdriver
		}
	];

	const pathAreEquals = (path: string, pagePathName: string) => pagePathName === path;

	let isOpen = $state(false);
	let pinned = $state(false);
	// The rail shows for 3 s on page load, as a hint, where it fits in the margin beside the page.
	// Elsewhere it never does: it is laid over the page, so it would cover the start of every line.
	// The CSS decides where it fits (--peek-fits below, so the server render never flashes it).
	let peeking = $state(true);
	let open = $derived(isOpen || peeking);
	let wrapper: HTMLElement | undefined = $state();

	const peekFits = () =>
		!!wrapper && getComputedStyle(wrapper).getPropertyValue('--peek-fits').trim() === '1';

	// The peek ends after 3 s, or as soon as it stops fitting (a narrower window, a wider page:
	// the timeline): the CSS has collapsed the rail then, and the handle must read "Open sidebar"
	$effect(() => {
		if (!browser || !peeking) return;
		if (!peekFits()) {
			peeking = false;
			return;
		}
		const end = () => (peeking = false);
		const endUnlessFits = () => {
			if (!peekFits()) end();
		};
		const timer = setTimeout(end, 3000);
		window.addEventListener('resize', endUnlessFits);
		// A page that becomes wide (data-page-wide) changes what fits without a resize
		const observer = new MutationObserver(endUnlessFits);
		observer.observe(document.body, { childList: true, subtree: true });
		return () => {
			clearTimeout(timer);
			window.removeEventListener('resize', endUnlessFits);
			observer.disconnect();
		};
	});

	function onMouseEnter() {
		if (!pinned) {
			isOpen = true;
		}
	}

	function onMouseLeave() {
		peeking = false;
		if (!pinned) {
			isOpen = false;
		}
	}

	function handleToggle() {
		if (peeking && !isOpen) {
			// Only the load-time peek shows it: the handle reads "Close sidebar"
			peeking = false;
			return;
		}
		peeking = false;
		if (pinned) {
			pinned = false;
			isOpen = false;
		} else {
			pinned = true;
			isOpen = true;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={wrapper}
	class="drawer-wrapper"
	class:drawer-open={isOpen}
	class:drawer-peek={peeking && !isOpen}
	onmouseenter={onMouseEnter}
	onmouseleave={onMouseLeave}
>
	<!-- Hidden while collapsed (visibility, in the CSS below): the off-screen links must not stay in
	     the tab order, before the page hydrates either -->
	<div class="drawer-content">
		<Navigation layout="rail">
			<Navigation.Content>
				{#each menuItems as item (item.path)}
					{#if !item.display || item.display()}
						{@const isActive = (item.selected ?? pathAreEquals)(item.path, page.url.pathname)}
						<Navigation.TriggerAnchor
							href={`/${domain.name}${item.path}`}
							aria-current={isActive ? 'page' : undefined}
							data-active={isActive || undefined}
						>
							{#if item.icon}
								{@const Icon = item.icon}
								<Icon />
							{/if}
							<Navigation.TriggerText>{item.label}</Navigation.TriggerText>
						</Navigation.TriggerAnchor>
					{/if}
				{/each}
			</Navigation.Content>
			<Navigation.Footer class="mt-auto flex justify-center">
				<ThemeToggle defaultDark={domain?.defaultDarkMode} />
			</Navigation.Footer>
		</Navigation>
	</div>

	<button
		class="drawer-handle"
		onclick={handleToggle}
		aria-label={open ? 'Close sidebar' : 'Open sidebar'}
	>
		<span class="handle-icon" class:rotated={isOpen}>
			<ChevronRight size="14" />
		</span>
	</button>
</div>

<style>
	.drawer-wrapper {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		z-index: 20;
		display: flex;
		/* Peek: slide left so only the handle is visible */
		transform: translateX(calc(-100% + var(--handle-w)));
		transition: transform 0.3s ease;
		--handle-w: 20px;
		/* 1 where the rail and its handle (7.5rem) fit in the margin beside the page, 0 where they
		   would cover it. A page's content is centred and at most 56rem wide (max-w-4xl), which
		   leaves that margin from 72rem (1rem to spare for a scrollbar); what is wider is marked
		   data-page-wide and is at most 80rem (max-w-7xl: the timeline), so from 96rem.
		   --peek-visibility says the same for the links: a custom property cannot be computed
		   into a keyword. */
		--peek-fits: 0;
		--peek-visibility: hidden;
	}

	@media (min-width: 72rem) {
		.drawer-wrapper {
			--peek-fits: 1;
			--peek-visibility: visible;
		}
	}

	@media (max-width: 95.999rem) {
		:global(body:has([data-page-wide])) .drawer-wrapper {
			--peek-fits: 0;
			--peek-visibility: hidden;
		}
	}

	.drawer-wrapper.drawer-open {
		transform: translateX(0);
	}

	/* The load-time peek: shown where it fits, the handle alone elsewhere */
	.drawer-wrapper.drawer-peek {
		transform: translateX(calc((1 - var(--peek-fits)) * (-100% + var(--handle-w))));
	}

	.drawer-peek .handle-icon {
		transform: rotate(calc(var(--peek-fits) * 180deg));
	}

	.drawer-content {
		height: 100%;
		flex-shrink: 0;
		/* Collapsed, the links are out of the tab order and of the accessibility tree, once the
		   rail has slid away. In CSS rather than `inert`, so it holds before the page hydrates,
		   when only the CSS knows whether the load-time peek shows */
		visibility: hidden;
		transition: visibility 0s 0.3s;
	}

	.drawer-open .drawer-content {
		visibility: visible;
		transition-delay: 0s;
	}

	.drawer-peek .drawer-content {
		visibility: var(--peek-visibility);
	}

	/* Restore the Skeleton 4 rail look after the Skeleton 5 / Tailwind 4.3 upgrade: .btn now
	   sizes direct svg children to --btn-size (1rem) and sets a 1rem line-height, and the
	   rail's `gap: 0.5` (previously dropped as invalid) now compiles to 0.5px. */
	.drawer-content
		:global([data-scope='navigation'][data-part='trigger-anchor'][data-layout='rail']) {
		line-height: var(--text-base--line-height);
		gap: calc(var(--spacing) * 2);
	}

	.drawer-content
		:global([data-scope='navigation'][data-part='trigger-anchor'][data-layout='rail'] > svg) {
		width: 1.5rem;
		height: 1.5rem;
	}

	/* The labels fit the rail: "Experiences" at the page's text size is wider than its link */
	.drawer-content :global([data-scope='navigation'][data-part='trigger-text'][data-layout='rail']) {
		font-size: var(--text-xs);
		line-height: var(--text-xs--line-height);
	}

	.drawer-handle {
		flex-shrink: 0;
		width: var(--handle-w);
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: none;
		padding: 0;
		background: transparent;
	}

	.handle-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 40px;
		border-radius: 0 6px 6px 0;
		background: var(--color-surface-200);
		opacity: 0.6;
		transition:
			opacity 0.2s,
			transform 0.3s ease;
	}

	:global(.dark) .handle-icon {
		background: var(--color-surface-800);
	}

	.drawer-handle:hover .handle-icon {
		opacity: 1;
	}

	.handle-icon.rotated {
		transform: rotate(180deg);
	}

	/* Mobile: bigger tap target */
	@media (max-width: 767px) {
		.drawer-wrapper {
			--handle-w: 28px;
		}

		.handle-icon {
			width: 22px;
			height: 48px;
		}
	}
</style>
