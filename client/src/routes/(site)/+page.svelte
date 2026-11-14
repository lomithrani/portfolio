<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Bars3BottomLeft,
		Check,
		ChevronDown,
		EyeSlash,
		Funnel,
		PaperAirplane,
		Swatch
	} from 'svelte-heros-v2';
	import type { Snippet } from 'svelte';
	import CandidateOnboarding from '#components/landing/CandidateOnboarding.svelte';
	import DemoVideo from '#components/landing/DemoVideo.svelte';
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';

	// The landing page (/), for candidates: what a portfolio is, and the card that creates one
	// (CandidateOnboarding). It sells two things, each with a short recording of the app
	// (DemoVideo): a portfolio the candidate makes their own, and a hiring journey that spares
	// them the back-and-forth with recruiters. Rendered on the server, signed out, so link previews
	// and search engines read it; the signed-in state only shows in the browser once the session
	// is checked.

	const EXAMPLE_DOMAIN = 'louis.gentil';

	const title = 'Your portfolio, your way | Portfolio';
	const tagline = 'Your portfolio, your way. Hiring without the back-and-forth.';
	const description =
		'A free portfolio you make your own: pick its theme, show your experiences as a list or a timeline, and set the steps recruiters follow, from sharing their job to booking a meeting with you.';

	let canonical = $derived(new URL(resolve('/(site)'), page.url.origin).href);
	let ogImage = $derived(new URL('/og-image.png', page.url.origin).href);

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
			text: "Pick the name in your portfolio's link. It stays yours until you delete your account."
		},
		{
			title: 'Add your résumé',
			text: 'Import your PDF résumé and review the drafts, or write your experiences yourself.'
		}
	];

	/** What the owner chooses about the look of their portfolio (admin tab "Appearance", the views) */
	const personalisation = [
		{
			icon: Swatch,
			title: 'Your look',
			text: 'Pick one of more than twenty themes, your title and your tagline, and whether visitors first see it light or dark.'
		},
		{
			icon: Bars3BottomLeft,
			title: 'A list or a timeline',
			text: 'The same experiences as cards to read or as a timeline to scan. Visitors switch in one tap.'
		},
		{
			icon: Funnel,
			title: 'Skills that filter',
			text: 'Visitors pick a skill and see the projects where you used it, and for how long.'
		}
	];

	/** The step types of a hiring journey, in the order most owners would put them */
	const journey = [
		{
			title: 'They read your note',
			text: 'What you are looking for and your conditions, confirmed before going further.'
		},
		{
			title: 'They share the job',
			text: 'One of their job descriptions, picked or written here. You find it in the meeting invitation.'
		},
		{
			title: 'The job is scored',
			text: 'Out of 100, against what you rated: pay, remote days, commute, skills and more, with your deal-breakers. Under your minimum, it stops there.'
		},
		{
			title: 'They book a meeting',
			text: 'In a free slot of your Google Calendar. No emails to find a time.'
		}
	];

	const alsoIncluded = [
		{
			icon: EyeSlash,
			title: 'What you ask stays private',
			text: 'A recruiter sees the score of their job and, if you allow it, how it does on each criterion. Never what you asked for.'
		},
		{
			icon: PaperAirplane,
			title: 'Apply with your portfolio',
			text: 'Apply to the job descriptions published here in one step: the recruiter opens your portfolio.'
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
	<meta property="og:title" content={tagline} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="{tagline} The steps of a hiring journey: note, job, match 86 out of 100, book a meeting."
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
					Your portfolio, your way.
					<span
						class="bg-gradient-to-br from-primary-600 to-tertiary-500 bg-clip-text text-transparent box-decoration-clone dark:from-primary-300 dark:to-tertiary-300"
						>Hiring without the <span class="whitespace-nowrap">back-and-forth.</span></span
					>
				</h2>
				<p class="max-w-xl text-lg text-surface-700-300">
					Choose how your career is shown and the steps recruiters take to reach you: they share
					their job, see how it matches what you are looking for, then book a meeting in your
					calendar.
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

		<!-- Make it yours: the look and the views of the experiences page -->
		<section
			class="mt-20 grid items-center gap-10 md:mt-28 lg:grid-cols-2 lg:gap-16"
			aria-labelledby="yours-title"
		>
			<div class="space-y-6 lg:order-2">
				<div class="space-y-3">
					<h2 id="yours-title" class="text-2xl font-bold md:text-3xl">Make it yours</h2>
					<p class="text-surface-700-300">
						Your portfolio does not have to look like everyone else's. You choose how your career is
						shown, and you can change it whenever you like.
					</p>
				</div>
				<ul class="space-y-5">
					{#each personalisation as feature (feature.title)}
						<li class="flex gap-4">
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
				<p class="text-sm text-surface-700-300">
					Want to see a real one?
					<a href={resolve('/[domain]/experiences', { domain: EXAMPLE_DOMAIN })} class={linkClass}
						>Open an example portfolio</a
					>.
				</p>
			</div>
			<div class="lg:order-1">
				<DemoVideo
					name="demo-style"
					label="Recording: the experiences page of an example portfolio, shown in five colour themes, light and dark, first as a list of cards, then as a timeline."
					caption="One portfolio in five themes, as a list and as a timeline."
				/>
			</div>
		</section>

		<!-- Hiring without the back-and-forth: the hiring journey and the perfect job -->
		<section
			class="mt-20 grid items-center gap-10 md:mt-28 lg:grid-cols-2 lg:gap-16"
			aria-labelledby="hiring-title"
		>
			<div class="space-y-6">
				<div class="space-y-3">
					<h2 id="hiring-title" class="text-2xl font-bold md:text-3xl">
						Hiring without the <span class="whitespace-nowrap">back-and-forth</span>
					</h2>
					<p class="text-surface-700-300">
						Set your steps once. Every recruiter goes through them, in the order you chose, before a
						meeting lands in your calendar.
					</p>
				</div>
				<ol class="space-y-5">
					{#each journey as step, index (step.title)}
						<li class="flex gap-4">
							<span
								class="flex size-9 shrink-0 items-center justify-center rounded-full preset-tonal-primary font-bold"
								aria-hidden="true">{index + 1}</span
							>
							<div class="space-y-1">
								<h3 class="font-semibold">{step.title}</h3>
								<p class="text-sm text-surface-700-300">{step.text}</p>
							</div>
						</li>
					{/each}
				</ol>
				<p class="text-sm text-surface-700-300">
					Keep the steps you want: a portfolio starts with the meeting alone.
				</p>
			</div>
			<DemoVideo
				name="demo-journey"
				label="Recording: a recruiter confirms the candidate's note and picks a job on site in Grenoble. The job scores 0 out of 100: every criterion matches except the commute, a deal-breaker for this candidate."
				caption="A job in Grenoble, for a candidate who made a short commute from Lyon a deal-breaker."
			/>
			<ul class="grid gap-4 sm:grid-cols-2 lg:col-span-2">
				{#each alsoIncluded as feature (feature.title)}
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
		</section>

		<!-- How it works: the card's three steps -->
		<section class="mt-20 space-y-8 md:mt-28" aria-labelledby="how-title">
			<div class="mx-auto max-w-2xl space-y-3 text-center">
				<h2 id="how-title" class="text-2xl font-bold md:text-3xl">How it works</h2>
				<p class="text-surface-700-300">
					A few minutes from here to a portfolio you can share. Free to use.
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

		<!-- Questions -->
		<section class="mx-auto mt-20 max-w-3xl space-y-8 md:mt-28" aria-labelledby="faq-title">
			<h2 id="faq-title" class="text-center text-2xl font-bold md:text-3xl">Questions</h2>
			<div class="space-y-3">
				{@render question('Is it free?', isFree)}
				{@render question('What happens to my résumé PDF?', resumePdf)}
				{@render question('Who can see my portfolio?', whoCanSee)}
				{@render question('What do recruiters see of what I am looking for?', whatRecruitersSee)}
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
				<h2 id="cta-title" class="text-2xl font-bold md:text-3xl">
					Set it up once, share one link
				</h2>
				<p class="mx-auto max-w-lg text-surface-700-300">
					Import your résumé, pick a theme, choose your steps. You can change all of it later.
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

{#snippet whatRecruitersSee()}
	<p>
		The score of their job and the minimum you set. If you allow it, they also see how the job does
		on each criterion (it matches, partly, or not) and which of your deal-breakers it misses, never
		what you asked for or how much the other criteria matter to you.
	</p>
	<p>
		Recruiters never see the address you give for your commute. To find it and compute travel times,
		it is sent to the Géoplateforme of IGN, the French state's map service, without your name or
		your account. Details in the
		<a href={resolve('/(site)/legal/privacy')} class={linkClass}>privacy policy</a>.
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
