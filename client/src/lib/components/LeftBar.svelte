<script lang="ts">
	import { page } from '$app/stores';
	import { UserRole } from 'portfolio-common';
	import { hasOneOf } from '$services/authentication';

	import { AppRail, AppRailAnchor } from '@skeletonlabs/skeleton';
	import { LightSwitch } from '@skeletonlabs/skeleton';
	import { AcademicCap, ComputerDesktop, WrenchScrewdriver } from 'svelte-heros-v2';

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
			restrictToRoles: [UserRole.Recruiter],
			selected: pathStartsWith,
			icon: AcademicCap
		},
		{
			path: '/admin',
			label: 'Admin',
			restrictToRoles: [UserRole.Admin],
			displayToRoles: [UserRole.Admin],
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

	{#each menuItems as { path, label, selected, restrictToRoles, displayToRoles, icon }}
		{#if !displayToRoles || $hasOneOf(displayToRoles)}
			<AppRailAnchor
				class={!restrictToRoles || $hasOneOf(restrictToRoles) || 'opacity-30 pointer-events-none'}
				href={path}
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
