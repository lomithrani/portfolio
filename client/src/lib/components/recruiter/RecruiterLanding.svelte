<!--
@component
/recruiter for a visitor who is not signed in: what the recruiter space does, and a "Sign in with
Google" button that signs in straight into it (POST /login with mode 'recruiter': the space is
created the first time). `onSignedIn` runs once the session is stored.

Google Identity Services routes every credential to the handler registered last (this page's,
once it is shown). The handler is not released when the page goes: the header's own sign-in
button, still on screen on the next page, would be left without one. Once this page is gone it
signs in without choosing a space, like the header does.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowPath,
		Briefcase,
		DocumentArrowUp,
		DocumentText,
		ExclamationTriangle,
		Users
	} from 'svelte-heros-v2';
	import { login } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { toaster } from '#services/toaster.ts';
	import { FREE_PLAN_IMPORTS } from '#services/jobImport.ts';

	let { onSignedIn }: { onSignedIn?: () => void } = $props();

	const uid = $props.id();
	let buttonContainer: HTMLDivElement | undefined = $state();
	let gsiState = $state<'loading' | 'ready' | 'unavailable'>('loading');
	let signingIn = $state(false);
	let errorMessage = $state('');

	const features = [
		{
			icon: DocumentText,
			title: 'Write clear job descriptions',
			text: 'Contract, working time, pay range, team: the facts candidates look for, in one place.'
		},
		{
			icon: DocumentArrowUp,
			title: 'Start from a PDF',
			text: `Import an existing job description: Claude drafts it for you to complete. ${FREE_PLAN_IMPORTS} imports are free.`
		},
		{
			icon: Users,
			title: 'Meet candidates through their portfolio',
			text: 'See who applies, open their portfolio, and add the portfolios you found yourself.'
		}
	];

	const isDark = () => document.documentElement.classList.contains('dark');

	onMount(() => {
		let mounted = true;

		setupGoogleIdentity(async ({ credential }) => {
			if (!mounted) {
				// This page is gone: the header's sign-in button (see above)
				if (!(await login(credential))) toaster.error({ title: 'Sign-in failed. Try again.' });
				return;
			}
			errorMessage = '';
			signingIn = true;
			// Read before signing in: this component unmounts as soon as the session is stored
			const notify = onSignedIn;
			const ok = await login(credential, 'recruiter');
			signingIn = false;
			if (!ok) {
				errorMessage = 'Sign-in failed. Try again.';
				return;
			}
			toaster.success({
				title: 'Welcome to your recruiter space',
				description: 'Write your first job description, or import one from a PDF.'
			});
			notify?.();
		})
			.then((gsi) => {
				if (!mounted || !buttonContainer) return;
				gsi.id.renderButton(buttonContainer, {
					theme: isDark() ? 'filled_black' : 'outline',
					size: 'large',
					type: 'standard',
					text: 'signin_with',
					shape: 'pill',
					logo_alignment: 'left',
					width: Math.min(320, Math.max(200, buttonContainer.clientWidth))
				});
				gsiState = 'ready';
			})
			.catch(() => {
				if (mounted) gsiState = 'unavailable';
			});

		return () => {
			mounted = false;
		};
	});
</script>

<section class="mx-auto max-w-3xl space-y-8" aria-labelledby="{uid}-title">
	<div class="space-y-4 text-center">
		<div class="mx-auto flex size-14 items-center justify-center rounded-full preset-tonal-primary">
			<Briefcase size="28" aria-hidden="true" />
		</div>
		<h2 id="{uid}-title" class="text-2xl font-bold md:text-3xl">Recruit through portfolios</h2>
		<p class="mx-auto max-w-xl text-surface-700-300">
			The recruiter space keeps your job descriptions in one place. Publish them, and see the
			candidates who apply with their portfolio.
		</p>
	</div>

	<ul class="grid gap-3 sm:grid-cols-3">
		{#each features as feature (feature.title)}
			<li class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-2 p-4">
				<feature.icon size="22" class="text-primary-700-300" aria-hidden="true" />
				<p class="font-semibold">{feature.title}</p>
				<p class="text-sm text-surface-700-300">{feature.text}</p>
			</li>
		{/each}
	</ul>

	<div class="flex flex-col items-center gap-3 text-center">
		{#if errorMessage}
			<p
				class="flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50"
				role="alert"
			>
				<ExclamationTriangle
					size="18"
					class="mt-0.5 shrink-0 text-error-700-300"
					aria-hidden="true"
				/>
				{errorMessage}
			</p>
		{/if}
		{#if signingIn}
			<p class="flex items-center gap-2 text-sm font-medium" role="status">
				<ArrowPath size="16" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				Signing in…
			</p>
		{/if}
		<!-- Google renders its button in there; a placeholder of its size until it does -->
		<div
			class={['relative flex min-h-11 w-full max-w-80 justify-center', { invisible: signingIn }]}
		>
			<div bind:this={buttonContainer} class="flex w-full justify-center"></div>
			{#if gsiState === 'loading'}
				<div
					class="absolute inset-0 animate-pulse rounded-full bg-surface-200-800 motion-reduce:animate-none"
					aria-hidden="true"
				></div>
			{/if}
		</div>
		{#if gsiState === 'unavailable'}
			<p class="max-w-md text-sm text-error-700-300" role="alert">
				Google sign-in could not load. Check your connection (or allow accounts.google.com if a
				blocker is on), then reload the page.
			</p>
		{/if}
		<p class="max-w-md text-sm text-surface-700-300">
			Free to use. The same Google account can also keep a candidate portfolio: switch spaces from
			the account menu.
		</p>
		<a href={resolve('/(app)/jobs')} class="btn btn-sm hover:preset-tonal underline">
			Browse open jobs
		</a>
	</div>
</section>
