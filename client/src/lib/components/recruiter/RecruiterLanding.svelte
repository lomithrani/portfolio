<!--
@component
/recruiter for a visitor who is not signed in: what the recruiter space is for (finding people
by what a portfolio shows of each skill: the projects it was used in and for how long), and a
"Sign in with Google" button that signs in straight into it (POST /login with mode 'recruiter':
the space is created the first time). `onSignedIn` runs once the session is stored.

Google's sign-in is loaded only once the visitor asks for it: a local "Sign in with Google" button
first (nothing reaches accounts.google.com before), then Google's button and its One Tap prompt.
Google Identity Services routes every credential to the handler registered last: this page
registers its own when its button is clicked, and the header's sign-in takes the role back when
it is clicked in turn. googleIdentity.ts cannot give the role back yet (`release` clears it):
after a click here that did not end in a sign-in (popup closed, sign-in failed), a sign-in from
the header's button (if it was set up before) comes here, and once this page is gone, signs in
without choosing a space.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowPath,
		CalendarDays,
		ChartBar,
		Clock,
		DocumentArrowUp,
		DocumentText,
		ExclamationTriangle,
		Funnel,
		Sparkles,
		Users
	} from 'svelte-heros-v2';
	import { getLocale } from 'portfolio-common';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { login } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { toaster } from '#services/toaster.ts';
	import { FREE_PLAN_IMPORTS } from '#services/jobImport.ts';
	import { m } from './RecruiterLanding.messages.ts';

	const EXAMPLE_DOMAIN = 'louis.gentil';

	let { onSignedIn }: { onSignedIn?: () => void } = $props();

	const uid = $props.id();
	let buttonContainer: HTMLDivElement | undefined = $state();
	let gsiState = $state<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
	/** Loads Google's sign-in (set once mounted) */
	let start: () => void = () => {};
	let signingIn = $state(false);
	let errorMessage = $state('');

	/** What a portfolio shows of a skill (the experiences page's filters, previews and timeline) */
	const skills = [
		{ icon: Funnel, ...m.skills.where },
		{ icon: Clock, ...m.skills.howLong },
		{ icon: CalendarDays, ...m.skills.when }
	];

	const features = [
		{ icon: DocumentText, ...m.features.job },
		{ icon: ChartBar, ...m.features.match },
		{ icon: Users, ...m.features.applicants },
		{
			icon: DocumentArrowUp,
			title: m.features.pdf.title,
			text: m.features.pdf.text(FREE_PLAN_IMPORTS)
		}
	];

	const isDark = () => document.documentElement.classList.contains('dark');

	onMount(() => {
		let mounted = true;

		const onCredential = async ({ credential }: google.accounts.id.CredentialResponse) => {
			if (!mounted) {
				// This page is gone, and its handler was the last registered (see above)
				if (!(await login(credential))) toaster.error({ title: common.signInFailed });
				return;
			}
			errorMessage = '';
			signingIn = true;
			// Read before signing in: this component unmounts as soon as the session is stored
			const notify = onSignedIn;
			const ok = await login(credential, 'recruiter');
			signingIn = false;
			if (!ok) {
				errorMessage = common.signInFailed;
				return;
			}
			toaster.success({ title: m.welcome.title, description: m.welcome.description });
			notify?.();
		};

		start = () => {
			if (gsiState === 'loading' || gsiState === 'ready') return;
			gsiState = 'loading';
			// Asked for here: this page takes the credential callback (into the recruiter space)
			setupGoogleIdentity(onCredential)
				.then(({ id }) => {
					if (!mounted || !buttonContainer) return;
					id.renderButton(buttonContainer, {
						theme: isDark() ? 'filled_black' : 'outline',
						size: 'large',
						type: 'standard',
						text: 'signin_with',
						shape: 'pill',
						logo_alignment: 'left',
						// Google's button, in the page's language
						locale: getLocale(),
						width: Math.min(320, Math.max(200, buttonContainer.clientWidth)),
						// Clicked after the header's sign-in took the callback back: here again
						click_listener: () => void setupGoogleIdentity(onCredential).catch(() => {})
					});
					gsiState = 'ready';
					id.prompt();
				})
				.catch(() => {
					if (mounted) gsiState = 'unavailable';
				});
		};

		return () => {
			mounted = false;
		};
	});
</script>

<section class="mx-auto max-w-4xl space-y-10" aria-labelledby="{uid}-title">
	<div class="space-y-4 text-center">
		<div class="mx-auto flex size-14 items-center justify-center rounded-full preset-tonal-primary">
			<Sparkles size="28" aria-hidden="true" />
		</div>
		<h2 id="{uid}-title" class="text-2xl font-bold text-balance md:text-4xl">{m.title}</h2>
		<p class="mx-auto max-w-2xl text-surface-700-300 md:text-lg">{m.lead}</p>
	</div>

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
				{common.signingIn}
			</p>
		{/if}
		{#if gsiState === 'idle' || gsiState === 'unavailable'}
			<button
				type="button"
				class="btn preset-filled-primary-700-300 min-h-11 w-full max-w-80 rounded-full"
				onclick={() => start()}
			>
				{common.signInWithGoogle}
			</button>
		{/if}
		<!-- Google renders its button in there; a placeholder of its size until it does -->
		<div
			class={[
				'relative flex min-h-11 w-full max-w-80 justify-center',
				{ invisible: signingIn, hidden: gsiState === 'idle' || gsiState === 'unavailable' }
			]}
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
			<p class="max-w-md text-sm text-error-700-300" role="alert">{common.googleUnavailable}</p>
		{/if}
		<p class="max-w-md text-sm text-surface-700-300">{m.free}</p>
	</div>

	<!-- What a portfolio says about a skill: the reason to recruit here -->
	<div
		class="card space-y-5 bg-gradient-to-br from-primary-500/10 via-surface-50-950 to-tertiary-500/10 p-5 preset-outlined-surface-200-800 md:p-8"
		role="group"
		aria-labelledby="{uid}-skills"
	>
		<h3 id="{uid}-skills" class="text-center text-xl font-bold text-balance md:text-2xl">
			{m.skills.title}
		</h3>
		<ul class="grid gap-5 sm:grid-cols-3">
			{#each skills as skill (skill.title)}
				<li class="space-y-2">
					<span class="flex size-10 items-center justify-center rounded-full preset-tonal-primary">
						<skill.icon size="20" aria-hidden="true" />
					</span>
					<p class="font-semibold">{skill.title}</p>
					<p class="text-sm text-surface-700-300">{skill.text}</p>
				</li>
			{/each}
		</ul>
		<p class="text-center text-sm text-surface-700-300">
			<Rich text={m.skills.example}>
				{#snippet example(text: string)}<a
						href={resolve('/[domain]/experiences', { domain: EXAMPLE_DOMAIN })}
						class="font-medium text-primary-700-300 underline underline-offset-2 hover:decoration-2"
						>{text}</a
					>{/snippet}
			</Rich>
		</p>
	</div>

	<ul class="grid gap-3 sm:grid-cols-2">
		{#each features as feature (feature.title)}
			<li class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-2 p-4">
				<feature.icon size="22" class="text-primary-700-300" aria-hidden="true" />
				<p class="font-semibold">{feature.title}</p>
				<p class="text-sm text-surface-700-300">{feature.text}</p>
			</li>
		{/each}
	</ul>

	<p class="text-center">
		<a href={resolve('/(app)/jobs')} class="btn btn-sm hover:preset-tonal underline">
			{m.browse}
		</a>
	</p>
</section>
