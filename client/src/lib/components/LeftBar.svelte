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

	let darkMode = $state(browser ? document.documentElement.classList.contains('dark') : true);

	function toggleDarkMode(details: { checked: boolean }) {
		darkMode = details.checked;
		document.documentElement.classList.toggle('dark', darkMode);
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
	<Navigation.Footer>
		<Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
	</Navigation.Footer>
</Navigation>
