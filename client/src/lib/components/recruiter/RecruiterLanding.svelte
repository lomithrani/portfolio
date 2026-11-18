<!--
@component
/recruiter for a visitor who is not signed in: what the recruiter space is for (finding people
by what a portfolio shows of each skill: the projects it was used in and for how long), and the
sign-in that opens it: the age and terms checkbox (AgeTermsConsent, with what the terms ask of
recruiters) comes first, then "Sign in with Google", which signs in straight into the recruiter
space (POST /login with the mode 'recruiter' and the confirmation, recorded from the source
'recruiter': the space is created the first time, and needs the terms in force). `onSignedIn` runs
once the session is stored.

Google's script is loaded, and its button rendered, only once the box is ticked (as on the landing
page): before that nothing is asked from accounts.google.com. Google Identity Services routes every
credential to the handler registered last: this page registers its own when the box is ticked,
and again when its button is clicked, and the header's sign-in takes the role back when it is
clicked in turn. googleIdentity.ts cannot give the role back yet (`release` clears it): once this
page is gone, a sign-in from the header's button (if it was set up before) signs in without
choosing a space.
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
	import { currentConsent, getLocale, legalMessages } from 'portfolio-common';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { login, signIn } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { toaster } from '#services/toaster.ts';
	import { FREE_PLAN_IMPORTS } from '#services/jobImport.ts';
	import { m } from './RecruiterLanding.messages.ts';

	const EXAMPLE_DOMAIN = 'louis.gentil';

	let { onSignedIn }: { onSignedIn?: () => void } = $props();

	const uid = $props.id();
	const consentId = `${uid}-consent`;
	let consent = $state(false);
	let consentError = $state('');
	let buttonContainer: HTMLDivElement | undefined = $state();
	let gsiState = $state<'loading' | 'ready' | 'unavailable'>('loading');
	let signingIn = $state(false);
	let errorMessage = $state('');
	let mounted = false;

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

	/** Google's answer to its button: signs in to the recruiter space with the box ticked above */
	const onCredential = async ({ credential }: google.accounts.id.CredentialResponse) => {
		if (!mounted) {
			// This page is gone, and its handler was the last registered (see above)
			if (!(await login(credential))) toaster.error({ title: common.signInFailed });
			return;
		}
		// The box may have been unticked since the button showed
		if (!consent) {
			consentError = m.tickToSignIn;
			document.getElementById(consentId)?.focus();
			return;
		}
		errorMessage = '';
		signingIn = true;
		// Read before signing in: this component unmounts as soon as the session is stored
		const notify = onSignedIn;
		const result = await signIn(credential, {
			mode: 'recruiter',
			consent: currentConsent(),
			consentSource: 'recruiter'
		});
		signingIn = false;
		if (!result.ok) {
			// Terms changed since the page loaded: retrying sends the same version, only a reload helps
			errorMessage =
				result.reason === 'stale-terms' ? legalMessages.staleTerms : common.signInFailed;
			return;
		}
		toaster.success({ title: m.welcome.title, description: m.welcome.description });
		notify?.();
	};

	// Google's script and button, once the box is ticked (and for as long as it stays ticked: the
	// button goes away with the tick, the script stays loaded)
	$effect(() => {
		const container = buttonContainer;
		if (!consent || !container) return;
		let cancelled = false;
		gsiState = 'loading';
		// Asked for here: this page takes the credential callback (into the recruiter space)
		setupGoogleIdentity(onCredential)
			.then(({ id }) => {
				if (cancelled) return;
				id.renderButton(container, {
					theme: isDark() ? 'filled_black' : 'outline',
					size: 'large',
					type: 'standard',
					text: 'signin_with',
					shape: 'pill',
					logo_alignment: 'left',
					// Google's button, in the page's language
					locale: getLocale(),
					width: Math.min(320, Math.max(200, container.clientWidth)),
					// Clicked after the header's sign-in took the callback back: here again
					click_listener: () => void setupGoogleIdentity(onCredential).catch(() => {})
				});
				gsiState = 'ready';
			})
			.catch(() => {
				if (!cancelled) gsiState = 'unavailable';
			});
		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		mounted = true;
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

	<div class="mx-auto flex max-w-md flex-col items-center gap-4">
		<!-- The box first: Google is asked for nothing before it is ticked -->
		<div class="w-full text-start">
			<AgeTermsConsent
				bind:checked={consent}
				error={consent ? undefined : consentError || undefined}
				disabled={signingIn}
				id={consentId}
				recruiter
			/>
		</div>
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
		{#if consent}
			<!-- Google renders its button in there; a placeholder of its size until it does -->
			<div
				class={['relative flex min-h-11 w-full max-w-80 justify-center', { invisible: signingIn }]}
			>
				<div
					bind:this={buttonContainer}
					class="flex w-full justify-center"
					data-testid="google-button"
				></div>
				{#if gsiState === 'loading'}
					<div
						class="absolute inset-0 animate-pulse rounded-full bg-surface-200-800 motion-reduce:animate-none"
						aria-hidden="true"
					></div>
				{/if}
			</div>
			{#if gsiState === 'unavailable'}
				<p class="text-sm text-error-700-300" role="alert">{common.googleUnavailable}</p>
			{/if}
		{:else}
			<p
				class="flex min-h-11 w-full max-w-80 items-center justify-center rounded-full border border-dashed border-surface-300-700 px-4 text-center text-sm text-surface-700-300"
			>
				{m.tickToContinue}
			</p>
		{/if}
		<p class="text-center text-sm text-surface-700-300">{m.free}</p>
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
