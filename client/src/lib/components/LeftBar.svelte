<script lang="ts">
	import { page } from '$app/stores';
	import { AppRail, AppRailAnchor } from '@skeletonlabs/skeleton';
	import { LightSwitch } from '@skeletonlabs/skeleton';
	import type { Domain, Experience } from 'portfolio-api/models/database';
	import { AcademicCap, ComputerDesktop, WrenchScrewdriver } from 'svelte-heros-v2';
	import { authTracker } from '$services/authentication';

	export let domain: Domain & { experiences: Experience[] };

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
			display: () => $authTracker.user?._id === domain.admin,
			selected: pathStartsWith,
			icon: WrenchScrewdriver
		}
	];

	const pathAreEquals = (path: string, pagePathName: string) => pagePathName === path;
</script>

<AppRail background="bg-transparent" border="border-r border-surface-500/30">
	<svelte:fragment slot="trail"
		><AppRailAnchor><svelte:fragment slot="lead"><LightSwitch /></svelte:fragment></AppRailAnchor
		></svelte:fragment
	>

	{#each menuItems as { path, label, selected, display, icon }}
		{#if !display || display()}
			<AppRailAnchor
				href={`/${domain.name}${path}`}
				bind:group={label}
				name={label}
				selected={(selected ?? pathAreEquals)(path, $page.url.pathname)}
				aria-current={(selected ?? pathAreEquals)(path, $page.url.pathname) ? 'page' : undefined}
			>
				<svelte:fragment slot="lead">
					{#if icon}
						<svelte:component this={icon} />
					{/if}
				</svelte:fragment>

				<span>{label}</span>
			</AppRailAnchor>
			<hr class="opacity-30" />
		{/if}
	{/each}
</AppRail>
