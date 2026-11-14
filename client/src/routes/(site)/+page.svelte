<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Check,
		ChevronDown,
		Funnel,
		Map as MapIcon,
		PaperAirplane,
		Swatch
	} from 'svelte-heros-v2';
	import type { Snippet } from 'svelte';
	import CandidateOnboarding from '#components/landing/CandidateOnboarding.svelte';
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';

	// The landing page (/), for candidates: what a portfolio is, and the card that creates one
	// (CandidateOnboarding). Rendered on the server, signed out, so link previews and search
	// engines read it; the signed-in state only shows in the browser once the session is checked.

	const EXAMPLE_DOMAIN = 'louis.gentil';

	const title = 'Your career on one page | Portfolio';
	const description =
		'Create a free public portfolio of your experiences and projects, with a timeline and skill filters, at an address that is yours. Recruiters follow the hiring journey you choose before booking a meeting with you.';

	let canonical = $derived(new URL(resolve('/(site)'), page.url.origin).href);
	let ogImage = $derived(new URL('/og-image.png', page.url.origin).href);
	let host = $derived(page.url.host);

	let ownedDomain = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user?.domain
			: undefined
	);

	let onboarding: ReturnType<typeof CandidateOnboarding> | undefined = $state();

	const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** "Create your portfolio": to the card (it is under the hero on small screens), its first field */
	const startCreating = (event: MouseEvent) => {
		event.preventDefault();
		document.getElementById('create')?.scrollIntoView({
			behavior: prefersReducedMotion() ? 'instant' : 'smooth',
			block: 'start'
		});
		onboarding?.focusStart({ preventScroll: true });
	};

	const howItWorks = [
		{
			title: 'Sign in with Google',
			text: 'Confirm your age, accept the terms, and sign in. No password to create.'
		},
		{
			title: 'Claim your address',
			text: 'Pick the address of your portfolio. It stays yours until you delete your account.'
		},
		{
			title: 'Add your résumé',
			text: 'Import your PDF résumé and review the drafts, or write your experiences yourself.'
		}
	];

	const features = [
		{
			icon: Funnel,
			title: 'A timeline and skill filters',
			text: 'Your experiences as a list or a timeline. Visitors pick a skill and see the projects where you used it.'
		},
		{
			icon: MapIcon,
			title: 'Your hiring journey',
			text: 'Recruiters go through the steps you choose, such as a note to read or a job description to share, before they book a meeting with you.'
		},
		{
			icon: PaperAirplane,
			title: 'Apply with your portfolio',
			text: 'Apply to the job descriptions published here in one step: the recruiter opens your portfolio.'
		},
		{
			icon: Swatch,
			title: 'Light and dark',
			text: 'Your portfolio reads well on a phone or a large screen, in light or dark mode.'
		}
	];

	const linkClass =
		'font-medium text-primary-700-300 underline underline-offset-2 hover:decoration-2';
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Your career on one page, at an address that is yours" />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="Your career on one page, at an address that is yours. A browser address bar reads portfolio/jane.doe, available."
	/>
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="relative isolate overflow-hidden">
	<!-- Soft colour behind the hero, in the theme's colours -->
	<div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem]" aria-hidden="true">
		<div
			class="absolute -top-24 left-1/2 h-[28rem] w-[56rem] max-w-[140vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary-500/20 via-secondary-400/15 to-tertiary-500/20 blur-3xl dark:from-primary-500/25 dark:via-secondary-500/10 dark:to-tertiary-500/25"
		></div>
	</div>

	<div class="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 md:px-6 md:pt-14 lg:pt-16">
		<!-- Hero: what it is, and the card that creates one -->
		<div class="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-12">
			<section class="space-y-6 lg:pt-6" aria-labelledby="hero-title">
				<p class="badge preset-tonal-primary text-xs font-semibold tracking-wide uppercase">
					For candidates · Free
				</p>
				<h2
					id="hero-title"
					class="text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl lg:text-[3.4rem]"
				>
					Your career on one page,
					<span
						class="bg-gradient-to-br from-primary-600 to-tertiary-500 bg-clip-text text-transparent box-decoration-clone dark:from-primary-300 dark:to-tertiary-300"
						>at an address that is yours.</span
					>
				</h2>
				<p class="max-w-xl text-lg text-surface-700-300">
					A public portfolio of your experiences and projects, with a timeline and skill filters,
					that recruiters can read. They follow the hiring journey you choose before booking a
					meeting with you.
				</p>
				<div class="flex flex-wrap gap-3">
					{#if ownedDomain}
						<a
							href={resolve('/[domain]/experiences', { domain: ownedDomain })}
							class="btn preset-filled-primary-700-300 min-h-12 px-6 text-base max-sm:w-full"
						>
							Open my portfolio
							<ArrowRight size="18" aria-hidden="true" />
						</a>
					{:else}
						<a
							href="#create"
							class="btn preset-filled-primary-700-300 min-h-12 px-6 text-base max-sm:w-full"
							onclick={startCreating}
						>
							Create your portfolio
							<ArrowRight size="18" aria-hidden="true" />
						</a>
					{/if}
					<a
						href={resolve('/[domain]/experiences', { domain: EXAMPLE_DOMAIN })}
						class="btn preset-tonal min-h-12 px-6 text-base max-sm:w-full"
					>
						See an example
					</a>
				</div>
				<ul class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-surface-700-300">
					{#each ['Free, no card', 'Sign in with Google', 'Delete your account at any time'] as point (point)}
						<li class="flex items-center gap-1.5">
							<Check size="16" class="shrink-0 text-success-700-300" aria-hidden="true" />
							{point}
						</li>
					{/each}
				</ul>
			</section>

			<CandidateOnboarding bind:this={onboarding} />
		</div>

		<!-- How it works: the card's three steps -->
		<section class="mt-20 space-y-8 md:mt-28" aria-labelledby="how-title">
			<div class="mx-auto max-w-2xl space-y-3 text-center">
				<h2 id="how-title" class="text-2xl font-bold md:text-3xl">How it works</h2>
				<p class="text-surface-700-300">
					A few minutes from here to a portfolio at
					<span class="font-medium text-surface-950-50">{host}/your-name</span>.
				</p>
			</div>
			<ol class="grid gap-4 md:grid-cols-3">
				{#each howItWorks as step, index (step.title)}
					<li class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-5">
						<span
							class="flex size-9 items-center justify-center rounded-full preset-tonal-primary font-bold"
							aria-hidden="true">{index + 1}</span
						>
						<h3 class="font-semibold">
							<span class="sr-only">Step {index + 1}:</span>
							{step.title}
						</h3>
						<p class="text-sm text-surface-700-300">{step.text}</p>
					</li>
				{/each}
			</ol>
		</section>

		<!-- What you get -->
		<section class="mt-20 space-y-8 md:mt-28" aria-labelledby="features-title">
			<div class="mx-auto max-w-2xl space-y-3 text-center">
				<h2 id="features-title" class="text-2xl font-bold md:text-3xl">What you get</h2>
				<p class="text-surface-700-300">
					One page that tells your story, and a simple way for recruiters to reach you.
				</p>
			</div>
			<ul class="grid gap-4 sm:grid-cols-2">
				{#each features as feature (feature.title)}
					<li class="card preset-outlined-surface-200-800 bg-surface-50-950 flex gap-4 p-5">
						<span
							class="flex size-11 shrink-0 items-center justify-center rounded-full preset-tonal-primary"
						>
							<feature.icon size="22" aria-hidden="true" />
						</span>
						<div class="space-y-1">
							<h3 class="font-semibold">{feature.title}</h3>
							<p class="text-sm text-surface-700-300">{feature.text}</p>
						</div>
					</li>
				{/each}
			</ul>
			<p class="text-center text-sm text-surface-700-300">
				Free to use. Want to see one first?
				<a href={resolve('/[domain]/experiences', { domain: EXAMPLE_DOMAIN })} class={linkClass}
					>Open an example portfolio</a
				>.
			</p>
		</section>

		<!-- Questions -->
		<section class="mx-auto mt-20 max-w-3xl space-y-8 md:mt-28" aria-labelledby="faq-title">
			<h2 id="faq-title" class="text-center text-2xl font-bold md:text-3xl">Questions</h2>
			<div class="space-y-3">
				{@render question('Is it free?', isFree)}
				{@render question('What happens to my résumé PDF?', resumePdf)}
				{@render question('Who can see my portfolio?', whoCanSee)}
				{@render question('Can I delete my account?', deleteEverything)}
				{@render question('Why do you ask my age?', whyAge)}
				{@render question('Which data do you keep?', whichData)}
			</div>
		</section>

		<!-- Last call -->
		{#if !ownedDomain}
			<section
				class="card mt-20 space-y-4 bg-gradient-to-br from-primary-500/15 via-surface-50-950 to-tertiary-500/15 p-8 text-center md:mt-28 md:p-12 preset-outlined-surface-200-800"
				aria-labelledby="cta-title"
			>
				<h2 id="cta-title" class="text-2xl font-bold md:text-3xl">Your address is waiting</h2>
				<p class="mx-auto max-w-lg text-surface-700-300">
					Pick it now, before someone with the same name does. You can fill your portfolio later.
				</p>
				<a
					href="#create"
					class="btn preset-filled-primary-700-300 min-h-12 px-6 text-base"
					onclick={startCreating}
				>
					Create your portfolio
					<ArrowRight size="18" aria-hidden="true" />
				</a>
			</section>
		{/if}
	</div>
</div>

{#snippet question(summary: string, answer: Snippet)}
	<details
		class="group card preset-outlined-surface-200-800 bg-surface-50-950 open:preset-outlined-primary-200-800"
	>
		<summary
			class="flex cursor-pointer list-none items-center justify-between gap-4 rounded-container p-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary-500 [&::-webkit-details-marker]:hidden"
		>
			{summary}
			<ChevronDown
				size="18"
				class="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
				aria-hidden="true"
			/>
		</summary>
		<div class="space-y-2 px-4 pb-4 text-surface-700-300">
			{@render answer()}
		</div>
	</details>
{/snippet}

{#snippet isFree()}
	<p>
		Yes. Creating and keeping a portfolio is free, and so is the résumé import, within a monthly
		limit.
	</p>
{/snippet}

{#snippet resumePdf()}
	<p>
		To be read, it is sent to Anthropic, in the United States, whose model Claude turns it into
		drafts of your experiences. It is not stored here, and Anthropic does not use it to train its
		models. You review each draft: nothing is published until you add it.
	</p>
{/snippet}

{#snippet whoCanSee()}
	<p>
		Anyone with its address: a portfolio is public, and search engines may list it. Write only what
		you want to be public. Your email address is not shown on it.
	</p>
{/snippet}

{#snippet deleteEverything()}
	<p>
		Yes. Your <a href={resolve('/(site)/account')} class={linkClass}>account page</a> deletes your account
		and everything tied to it at once: portfolio, hiring journey, applications and Google Calendar access.
		Your address becomes free for someone else.
	</p>
	<p>
		Meetings already in someone's calendar and step suggestions already on GitHub (which do not name
		you) stay; server logs expire on their own. Details in the
		<a href={resolve('/(site)/legal/privacy')} class={linkClass}>privacy policy</a>.
	</p>
{/snippet}

{#snippet whyAge()}
	<p>
		Portfolios are for people who can work: you must be at least 16 and have reached the minimum
		legal working age in your country. We record that you confirmed it, with the date and the
		version of the terms, never your date of birth.
	</p>
{/snippet}

{#snippet whichData()}
	<p>
		Your Google account id and email address, what you publish, and what the features you use need,
		such as your applications or your meeting settings. The
		<a href={resolve('/(site)/legal/privacy')} class={linkClass}>privacy policy</a> lists everything,
		how long it is kept, and your rights.
	</p>
{/snippet}
