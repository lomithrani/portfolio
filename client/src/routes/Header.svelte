<script lang="ts">
	import { page } from '$app/stores';
	import logo from '$lib/images/svelte-logo.svg';
	import { UserRole } from 'portfolio-common';
	import { authTracker, hasOneOf } from '../services/authentication';
	import Login from './Login.svelte';

	const pathStartsWith = (path: string, pagePathName: string) => pagePathName.startsWith(path);

	let menuItems = [
		{
			path: '/',
			label: 'Experiences'
		},
		{
			path: '/hire',
			label: 'Hire',
			restrictToRoles: [UserRole.Recruiter],
			selected: pathStartsWith
		},
		{
			path: '/admin',
			label: 'Admin',
			restrictToRoles: [UserRole.Admin],
			displayToRoles: [UserRole.Admin],
			selected: pathStartsWith
		}
	];

	const pathAreEquals = (path: string, pagePathName: string) => pagePathName === path;
</script>

<header>
	<div class="corner">
		<a href="https://kit.svelte.dev">
			<img src={logo} alt="SvelteKit" />
		</a>
	</div>

	<nav>
		<svg viewBox="0 0 2 3" aria-hidden="true">
			<path d="M0,0 L1,2 C1.5,3 1.5,3 2,3 L2,0 Z" />
		</svg>
		<ul>
			{#each menuItems as { path, label, selected, restrictToRoles, displayToRoles }}
				{#if !displayToRoles || $hasOneOf(displayToRoles)}
					<li
						aria-current={(selected ?? pathAreEquals)(path, $page.url.pathname)
							? 'page'
							: undefined}
						class:disabled={restrictToRoles != undefined && !$hasOneOf(restrictToRoles)}
					>
						<a href={path}>{label}</a>
					</li>
				{/if}
			{/each}
		</ul>
		<svg viewBox="0 0 2 3" aria-hidden="true">
			<path d="M0,0 L0,3 C0.5,3 0.5,3 1,2 L2,0 Z" />
		</svg>
	</nav>

	<div class="corner">
		{#if !$authTracker.authenticated}
			<Login />
		{/if}
	</div>
</header>

<style>
	header {
		display: flex;
		justify-content: space-between;
	}

	.corner {
		width: 3em;
		height: 3em;
	}

	.corner a {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.corner img {
		width: 2em;
		height: 2em;
		object-fit: contain;
	}

	nav {
		display: flex;
		justify-content: center;
		--background: rgba(255, 255, 255, 0.7);
	}

	svg {
		width: 2em;
		height: 3em;
		display: block;
	}

	path {
		fill: var(--background);
	}

	ul {
		position: relative;
		padding: 0;
		margin: 0;
		height: 3em;
		display: flex;
		justify-content: center;
		align-items: center;
		list-style: none;
		background: var(--background);
		background-size: contain;
	}

	li {
		position: relative;
		height: 100%;
	}

	li[aria-current='page']::before {
		--size: 6px;
		content: '';
		width: 0;
		height: 0;
		position: absolute;
		top: 0;
		left: calc(50% - var(--size));
		border: var(--size) solid transparent;
		border-top: var(--size) solid var(--color-theme-1);
	}

	nav a {
		display: flex;
		height: 100%;
		align-items: center;
		padding: 0 0.5rem;
		color: var(--color-text);
		font-weight: 700;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		text-decoration: none;
		transition: color 0.2s linear;
	}

	a:hover {
		color: var(--color-theme-1);
	}

	.disabled {
		pointer-events: none;
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
