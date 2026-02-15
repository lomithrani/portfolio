<script lang="ts">
	import { page } from '$app/stores';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';
	import type { Domain, Experience } from 'portfolio-api/models/database';
	import { AcademicCap, ComputerDesktop, WrenchScrewdriver, ChevronRight, Sun, Moon } from 'svelte-heros-v2';
	import { authenticationStore } from '$services/stores';
	import { browser } from '$app/environment';

	let { domain }: { domain: Omit<Domain, 'experiences'> & { experiences: Experience[] } } = $props();

	let mounted = $state(false);
	$effect(() => {
		mounted = true;
	});

	let isAdmin = $derived(
		mounted &&
			browser &&
			$authenticationStore.user?._id != null &&
			domain?.admin != null &&
			$authenticationStore.user._id == domain.admin
	);

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

	const DARK_MODE_KEY = 'portfolio-dark-mode';

	function getInitialDarkMode(): boolean {
		if (!browser) return true;
		const stored = localStorage.getItem(DARK_MODE_KEY);
		if (stored !== null) return stored === 'true';
		if (domain?.defaultDarkMode !== undefined && domain.defaultDarkMode !== null)
			return domain.defaultDarkMode;
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	let darkMode = $state(getInitialDarkMode());

	$effect(() => {
		if (!browser) return;
		document.documentElement.classList.toggle('dark', darkMode);
		document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
		localStorage.setItem(DARK_MODE_KEY, String(darkMode));
	});

	function toggleDarkMode() {
		darkMode = !darkMode;
	}

	let isOpen = $state(true);
	let pinned = $state(false);

	// Auto-collapse after 3 seconds on mount
	$effect(() => {
		if (!browser) return;
		const timer = setTimeout(() => {
			if (!pinned) {
				isOpen = false;
			}
		}, 3000);
		return () => clearTimeout(timer);
	});

	function onMouseEnter() {
		if (!pinned) {
			isOpen = true;
		}
	}

	function onMouseLeave() {
		if (!pinned) {
			isOpen = false;
		}
	}

	function handleToggle() {
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
	class="drawer-wrapper"
	class:drawer-open={isOpen}
	onmouseenter={onMouseEnter}
	onmouseleave={onMouseLeave}
>
	<div class="drawer-content">
		<Navigation layout="rail">
			<Navigation.Content>
				{#each menuItems as item}
					{#if !item.display || item.display()}
						{@const isActive = (item.selected ?? pathAreEquals)(item.path, $page.url.pathname)}
						<Navigation.TriggerAnchor
							href={`/${domain.name}${item.path}`}
							aria-current={isActive ? 'page' : undefined}
							data-active={isActive || undefined}
						>
							{#if item.icon}
								{@const Icon = item.icon}
								<Icon />
							{/if}
							<span>{item.label}</span>
						</Navigation.TriggerAnchor>
					{/if}
				{/each}
			</Navigation.Content>
			<Navigation.Footer class="mt-auto flex justify-center">
				<button
					class="theme-toggle"
					class:is-dark={darkMode}
					onclick={toggleDarkMode}
					aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
				>
					<span class="toggle-track">
						<span class="toggle-icon sun-icon">
							<Sun size="14" />
						</span>
						<span class="toggle-icon moon-icon">
							<Moon size="14" />
						</span>
						<span class="toggle-thumb"></span>
					</span>
				</button>
			</Navigation.Footer>
		</Navigation>
	</div>

	<button
		class="drawer-handle"
		onclick={handleToggle}
		aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
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
	}

	.drawer-wrapper.drawer-open {
		transform: translateX(0);
	}

	.drawer-content {
		height: 100%;
		flex-shrink: 0;
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

	/* Sun/Moon theme toggle */
	.theme-toggle {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		justify-content: center;
	}

	.toggle-track {
		position: relative;
		width: 48px;
		height: 26px;
		border-radius: 13px;
		background: linear-gradient(135deg, #89CFF0, #FFD700);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 5px;
		transition: background 0.4s ease;
	}

	.is-dark .toggle-track {
		background: linear-gradient(135deg, #1a1a3e, #2d2d6b);
	}

	.toggle-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
		transition: opacity 0.3s ease;
	}

	.sun-icon {
		color: #f59e0b;
	}

	.is-dark .sun-icon {
		opacity: 0.3;
	}

	.moon-icon {
		color: #fbbf24;
	}

	:not(.is-dark) > .toggle-track > .moon-icon {
		opacity: 0.3;
	}

	.toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		transition: transform 0.3s ease;
	}

	.is-dark .toggle-thumb {
		transform: translateX(22px);
		background: #e2e8f0;
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
