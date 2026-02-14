<script lang="ts">
	import { page } from '$app/stores';
	import { Navigation, Switch } from '@skeletonlabs/skeleton-svelte';
	import type { Domain, Experience } from 'portfolio-api/models/database';
	import { AcademicCap, ComputerDesktop, WrenchScrewdriver } from 'svelte-heros-v2';
	import { authenticationStore } from '$services/stores';
	import { browser } from '$app/environment';

	let { domain }: { domain: Omit<Domain, 'experiences'> & { experiences: Experience[] } } = $props();

	let mounted = $state(false);
	$effect(() => { mounted = true; });

	let isAdmin = $derived(
		mounted && browser &&
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
		if (domain?.defaultDarkMode !== undefined && domain.defaultDarkMode !== null) return domain.defaultDarkMode;
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	let darkMode = $state(getInitialDarkMode());

	$effect(() => {
		if (!browser) return;
		document.documentElement.classList.toggle('dark', darkMode);
		document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
		localStorage.setItem(DARK_MODE_KEY, String(darkMode));
	});

	function toggleDarkMode(details: { checked: boolean }) {
		darkMode = details.checked;
	}
</script>

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
	<Navigation.Footer class="mt-auto">
		<Switch checked={darkMode} onCheckedChange={toggleDarkMode}>
			<Switch.Control>
				<Switch.Thumb />
			</Switch.Control>
			<Switch.HiddenInput />
		</Switch>
	</Navigation.Footer>
</Navigation>
