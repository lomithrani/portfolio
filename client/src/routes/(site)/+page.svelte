<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Banknotes,
		Bars3BottomLeft,
		BuildingOffice2,
		Check,
		ChevronDown,
		EyeSlash,
		Funnel,
		MapPin,
		PaperAirplane,
		Swatch
	} from 'svelte-heros-v2';
	import type { Snippet } from 'svelte';
	import { LOCALES, getLocale } from 'portfolio-common';
	import CandidateOnboarding from '#components/landing/CandidateOnboarding.svelte';
	import DemoVideo from '#components/landing/DemoVideo.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { localeAlternate } from '#lib/i18n/urls.ts';
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { m as layout } from './layout.messages.ts';
	import { m } from './page.messages.ts';

	// The landing page (/), for talent: a portfolio that screens jobs for them. It sells two
	// things, each with a short recording of the app (DemoVideo): a job matchmaker on their side
	// (the calls they no longer take, then the hiring journey and the perfect job that stop
	// them) and a portfolio they make their own. Then the card that creates one
	// (CandidateOnboarding)'s three steps and the questions. Rendered on the server, signed out,
	// in the visitor's language (English or French, each with its address for search engines);
	// the signed-in state only shows in the browser once the session is checked.

	const EXAMPLE_DOMAIN = 'louis.gentil';

	const locale = getLocale();

	let canonical = $derived(localeAlternate(page.url, locale));
	/** The share image carries the hero's headline: one per language (scripts/og-image/) */
	let ogImage = $derived(
		new URL(locale === 'fr' ? '/og-image-fr.png' : '/og-image.png', page.url.origin).href
	);

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

	/** The calls the perfect job's criteria spare: too far, underpaid, not remote enough */
	const spared = [
		{ icon: MapPin, ...m.match.spared.commute },
		{ icon: Banknotes, ...m.match.spared.pay },
		{ icon: BuildingOffice2, ...m.match.spared.remote }
	];

	/** The step types of a hiring journey, in the order most owners would put them */
	const journey = [
		m.match.steps.note,
		m.match.steps.job,
		m.match.steps.score,
		m.match.steps.meeting
	];

	const alsoIncluded = [
		{ icon: EyeSlash, ...m.match.private },
		{ icon: PaperAirplane, ...m.match.apply }
	];

	/** What the owner chooses about the look of their portfolio (admin tab "Appearance", the views) */
	const personalisation = [
		{ icon: Swatch, ...m.yours.look },
		{ icon: Bars3BottomLeft, ...m.yours.views },
		{ icon: Funnel, ...m.yours.skills }
	];

	const howItWorks = [m.how.signIn, m.how.claim, m.how.resume];

	const linkClass =
		'font-medium text-primary-700-300 underline underline-offset-2 hover:decoration-2';
</script>

<svelte:head>
	<title>{m.meta.title}</title>
	<meta name="description" content={m.meta.description} />
	<link rel="canonical" href={canonical} />
	{#each LOCALES as language (language)}
		<link rel="alternate" hreflang={language} href={localeAlternate(page.url, language)} />
	{/each}
	<link rel="alternate" hreflang="x-default" href={localeAlternate(page.url, 'en')} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={layout.home.subtitle} />
	<meta property="og:description" content={m.meta.description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:locale" content={locale === 'fr' ? 'fr_FR' : 'en_GB'} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={m.meta.imageAlt} />
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
					{m.hero.badge}
				</p>
				<h2
					id="hero-title"
					class="text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl lg:text-[3.4rem]"
				>
					{m.hero.headline}
					<span
						class="bg-gradient-to-br from-primary-600 to-tertiary-500 bg-clip-text text-transparent box-decoration-clone dark:from-primary-300 dark:to-tertiary-300"
						><Rich text={m.hero.headlineAccent}
							>{#snippet nowrap(text: string)}<span class="whitespace-nowrap">{text}</span
								>{/snippet}</Rich
						></span
					>
				</h2>
				<p class="max-w-xl text-lg text-surface-700-300">{m.hero.lead}</p>
				<div class="flex flex-wrap gap-3">
					{#if ownedDomain}
						<a
							href={resolve('/[domain]/experiences', { domain: ownedDomain })}
							class="btn preset-filled-primary-700-300 min-h-12 px-6 text-base max-sm:w-full"
						>
							{m.hero.open}
							<ArrowRight size="18" aria-hidden="true" />
						</a>
					{:else}
						<a
							href="#create"
							class="btn preset-filled-primary-700-300 min-h-12 px-6 text-base max-sm:w-full"
							onclick={startCreating}
						>
							{m.hero.create}
							<ArrowRight size="18" aria-hidden="true" />
						</a>
					{/if}
					<a
						href={resolve('/[domain]/experiences', { domain: EXAMPLE_DOMAIN })}
						class="btn preset-tonal min-h-12 px-6 text-base max-sm:w-full"
					>
						{m.hero.example}
					</a>
				</div>
				<ul class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-surface-700-300">
					{#each m.hero.points as point (point)}
						<li class="flex items-center gap-1.5">
							<Check size="16" class="shrink-0 text-success-700-300" aria-hidden="true" />
							{point}
						</li>
					{/each}
				</ul>
			</section>

			<CandidateOnboarding bind:this={onboarding} />
		</div>

		<!-- The calls they no longer take: what the headline promises, in three cases -->
		<section class="mt-16 space-y-6 md:mt-24" aria-labelledby="spared-title">
			<h2 id="spared-title" class="text-center text-xl font-bold md:text-2xl">
				{m.match.spared.title}
			</h2>
			<ul class="grid gap-4 md:grid-cols-3">
				{#each spared as call (call.title)}
					<li class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-5">
						<span
							class="flex size-11 items-center justify-center rounded-full preset-tonal-primary"
						>
							<call.icon size="22" aria-hidden="true" />
						</span>
						<h3 class="font-semibold text-balance">{call.title}</h3>
						<p class="text-sm text-surface-700-300">{call.text}</p>
					</li>
				{/each}
			</ul>
		</section>

		<!-- First the match, then the call: the hiring journey and the perfect job -->
		<section
			class="mt-20 grid items-center gap-10 md:mt-28 lg:grid-cols-2 lg:gap-16"
			aria-labelledby="match-title"
		>
			<div class="space-y-6">
				<div class="space-y-3">
					<h2 id="match-title" class="text-2xl font-bold text-balance md:text-3xl">
						{m.match.title}
					</h2>
					<p class="text-surface-700-300">{m.match.intro}</p>
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
				<p class="text-sm text-surface-700-300">{m.match.keep}</p>
			</div>
			<DemoVideo name="demo-journey" label={m.match.demo.label} caption={m.match.demo.caption} />
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

		<!-- Make it yours: the look and the views of the experiences page -->
		<section
			class="mt-20 grid items-center gap-10 md:mt-28 lg:grid-cols-2 lg:gap-16"
			aria-labelledby="yours-title"
		>
			<div class="space-y-6 lg:order-2">
				<div class="space-y-3">
					<h2 id="yours-title" class="text-2xl font-bold md:text-3xl">{m.yours.title}</h2>
					<p class="text-surface-700-300">{m.yours.intro}</p>
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
					<Rich text={m.yours.example}>
						{#snippet example(text: string)}<a
								href={resolve('/[domain]/experiences', { domain: EXAMPLE_DOMAIN })}
								class={linkClass}>{text}</a
							>{/snippet}
					</Rich>
				</p>
			</div>
			<div class="lg:order-1">
				<DemoVideo name="demo-style" label={m.yours.demo.label} caption={m.yours.demo.caption} />
			</div>
		</section>

		<!-- How it works: the card's three steps -->
		<section class="mt-20 space-y-8 md:mt-28" aria-labelledby="how-title">
			<div class="mx-auto max-w-2xl space-y-3 text-center">
				<h2 id="how-title" class="text-2xl font-bold md:text-3xl">{m.how.title}</h2>
				<p class="text-surface-700-300">{m.how.intro}</p>
			</div>
			<ol class="grid gap-4 md:grid-cols-3">
				{#each howItWorks as step, index (step.title)}
					<li class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-5">
						<span
							class="flex size-9 items-center justify-center rounded-full preset-tonal-primary font-bold"
							aria-hidden="true">{index + 1}</span
						>
						<h3 class="font-semibold">
							<span class="sr-only">{m.how.step(index + 1)}</span>
							{step.title}
						</h3>
						<p class="text-sm text-surface-700-300">{step.text}</p>
					</li>
				{/each}
			</ol>
		</section>

		<!-- Questions -->
		<section class="mx-auto mt-20 max-w-3xl space-y-8 md:mt-28" aria-labelledby="faq-title">
			<h2 id="faq-title" class="text-center text-2xl font-bold md:text-3xl">{m.faq.title}</h2>
			<div class="space-y-3">
				{@render question(m.faq.free.question, isFree)}
				{@render question(m.faq.resume.question, resumePdf)}
				{@render question(m.faq.visibility.question, whoCanSee)}
				{@render question(m.faq.recruiters.question, whatRecruitersSee)}
				{@render question(m.faq.deletion.question, deleteEverything)}
				{@render question(m.faq.age.question, whyAge)}
				{@render question(m.faq.data.question, whichData)}
			</div>
		</section>

		<!-- Last call -->
		{#if !ownedDomain}
			<section
				class="card mt-20 space-y-4 bg-gradient-to-br from-primary-500/15 via-surface-50-950 to-tertiary-500/15 p-8 text-center md:mt-28 md:p-12 preset-outlined-surface-200-800"
				aria-labelledby="cta-title"
			>
				<h2 id="cta-title" class="text-2xl font-bold md:text-3xl">{m.cta.title}</h2>
				<p class="mx-auto max-w-lg text-surface-700-300">{m.cta.text}</p>
				<a
					href="#create"
					class="btn preset-filled-primary-700-300 min-h-12 px-6 text-base"
					onclick={startCreating}
				>
					{m.hero.create}
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

<!-- The links inside the answers: the privacy policy, the account page -->
{#snippet privacy(text: string)}<a href={resolve('/(site)/legal/privacy')} class={linkClass}
		>{text}</a
	>{/snippet}

{#snippet account(text: string)}<a href={resolve('/(site)/account')} class={linkClass}>{text}</a
	>{/snippet}

{#snippet isFree()}
	<p>{m.faq.free.answer}</p>
{/snippet}

{#snippet resumePdf()}
	<p>{m.faq.resume.answer}</p>
{/snippet}

{#snippet whoCanSee()}
	<p>{m.faq.visibility.answer}</p>
{/snippet}

{#snippet whatRecruitersSee()}
	<p>{m.faq.recruiters.score}</p>
	<p><Rich text={m.faq.recruiters.address} {privacy} /></p>
{/snippet}

{#snippet deleteEverything()}
	<p><Rich text={m.faq.deletion.everything} {account} /></p>
	<p><Rich text={m.faq.deletion.remains} {privacy} /></p>
{/snippet}

{#snippet whyAge()}
	<p>{m.faq.age.answer}</p>
{/snippet}

{#snippet whichData()}
	<p><Rich text={m.faq.data.answer} {privacy} /></p>
{/snippet}
