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
		Funnel,
		Gift,
		Link,
		LockClosed,
		MapPin,
		QueueList,
		Scale,
		ShieldCheck,
		Swatch
	} from 'svelte-heros-v2';
	import type { Snippet } from 'svelte';
	import { JOB_LIMITS, LOCALES, getLocale } from 'portfolio-common';
	import CandidateOnboarding from '#components/landing/CandidateOnboarding.svelte';
	import DemoVideo from '#components/landing/DemoVideo.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { plainText, richParts } from '#lib/i18n/rich.ts';
	import { localeAlternate, ogLocale } from '#lib/i18n/urls.ts';
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { m } from './page.messages.ts';

	// The landing page (/), for talent: a career tool they keep, whose link can make recruiters show
	// the job and its pay before the call (the gate journey, one click from Get started; the default
	// journey is the meeting alone). The hero and the card that creates a portfolio
	// (CandidateOnboarding), then "Send your link" (the hiring journey, with its recording), "Our
	// promises to you" (seven, each message naming the code that backs it), the calls the perfect
	// job's criteria stop, "Make it yours" (with its recording), how it works (the card's four
	// steps), the questions and a last call. Nothing about a feature that is not shipped. Rendered
	// on the server, signed out, in the visitor's language (English or French, each with its
	// address for search engines); the signed-in state only shows in the browser once the session
	// is checked.

	const EXAMPLE_DOMAIN = 'louis.gentil';

	const locale = getLocale();

	let canonical = $derived(localeAlternate(page.url, locale));
	/** The share image carries the hero's headline: one per language (scripts/og-image/) */
	let ogImage = $derived(
		new URL(locale === 'fr' ? '/og-image-fr.png' : '/og-image.png', page.url.origin).href
	);

	/** The title of the link previews: the hero's headline, in one line */
	const shareTitle = `${plainText(m.hero.headline)} ${plainText(m.hero.headlineAccent)}`;

	/**
	 * How many characters the longest phrase of the headline has: each is kept on one line, so the
	 * headline is sized for the longest to fit its column (the hero's style below), which a long
	 * French sentence needs where the English ones do not
	 */
	const longestPhrase = Math.max(
		...[m.hero.headline, m.hero.headlineAccent]
			.flatMap(richParts)
			.map((part) => (part.tag ? part.text.length : 0))
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

	/** The step types of a hiring journey, in the order of the gate journey */
	const journey = [m.link.steps.note, m.link.steps.job, m.link.steps.score, m.link.steps.meeting];

	/** What a candidate can count on: four, then three, on wide screens */
	const promises = [
		{ icon: Gift, ...m.promises.free },
		{
			icon: Banknotes,
			title: m.promises.pay.title,
			text: m.promises.pay.text(JOB_LIMITS.pay.maxRangeRatio)
		},
		{ icon: LockClosed, ...m.promises.private },
		{ icon: QueueList, ...m.promises.steps },
		{ icon: Link, ...m.promises.link },
		{ icon: ShieldCheck, ...m.promises.data },
		{ icon: Scale, ...m.promises.hire }
	];

	/** The calls the perfect job's criteria spare: too far, underpaid, not remote enough */
	const spared = [
		{ icon: MapPin, ...m.spared.commute },
		{ icon: Banknotes, ...m.spared.pay },
		{ icon: BuildingOffice2, ...m.spared.remote }
	];

	/** What the owner chooses about the look of their portfolio (admin tab "Appearance", the views) */
	const personalisation = [
		{ icon: Swatch, ...m.yours.look },
		{ icon: Bars3BottomLeft, ...m.yours.views },
		{ icon: Funnel, ...m.yours.skills }
	];

	const howItWorks = [m.how.signIn, m.how.claim, m.how.resume, m.how.terms];

	const linkClass =
		'font-medium text-primary-700-300 underline underline-offset-2 hover:decoration-2';

	/** The headline's coloured sentences */
	const accentClass =
		'bg-gradient-to-br from-primary-600 to-tertiary-500 bg-clip-text text-transparent box-decoration-clone dark:from-primary-300 dark:to-tertiary-300';
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
	<meta property="og:title" content={shareTitle} />
	<meta property="og:description" content={m.meta.description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:locale" content={ogLocale(locale)} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={m.meta.imageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image:alt" content={m.meta.imageAlt} />
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
			<!-- A container: the headline's size follows the width of this column -->
			<section class="@container space-y-6 lg:pt-6" aria-labelledby="hero-title">
				<p class="badge preset-tonal-primary text-xs font-semibold tracking-wide uppercase">
					{m.hero.badge}
				</p>
				<!-- Each sentence is a phrase, which starts a line when it does not fit after the one before:
				     the headline breaks between its sentences, and the accent's are never cut -->
				<h2
					id="hero-title"
					class="hero-title leading-tight font-bold tracking-tight text-balance [--hero-size:var(--text-4xl)] md:[--hero-size:var(--text-5xl)] lg:[--hero-size:3.4rem]"
					style:--longest-phrase={longestPhrase}
				>
					<span class="inline-block"
						><Rich text={m.hero.headline}
							>{#snippet phrase(text: string)}<span class="inline-block">{text}</span
								>{/snippet}</Rich
						></span
					>
					<span class={accentClass}
						><Rich text={m.hero.headlineAccent}
							>{#snippet phrase(text: string)}<span class={['inline-block', accentClass]}
									>{text}</span
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

		<!-- Send your link: the steps every recruiter goes through, with the journey's recording -->
		<section
			class="mt-16 grid items-center gap-10 md:mt-24 lg:grid-cols-2 lg:gap-16"
			aria-labelledby="link-title"
		>
			<div class="space-y-6">
				<div class="space-y-3">
					<p class="text-sm font-semibold tracking-wide text-primary-700-300 uppercase">
						{m.link.kicker}
					</p>
					<h2 id="link-title" class="text-2xl font-bold text-balance md:text-3xl">
						{m.link.title}
					</h2>
					<p class="text-surface-700-300">{m.link.intro}</p>
				</div>
				<ol class="space-y-5">
					{#each journey as step, index (step.title)}
						<li class="flex gap-4">
							<span
								class="flex size-9 shrink-0 items-center justify-center rounded-full preset-tonal-primary font-bold"
								aria-hidden="true">{index + 1}</span
							>
							<div class="space-y-1">
								<h3 class="font-semibold text-balance">{step.title}</h3>
								<p class="text-sm text-surface-700-300">{step.text}</p>
							</div>
						</li>
					{/each}
				</ol>
				<p class="text-sm text-surface-700-300">{m.link.keep}</p>
			</div>
			<DemoVideo name="demo-journey" label={m.link.demo.label} caption={m.link.demo.caption} />
		</section>

		<!-- Our promises to you: how the site works for the candidate -->
		<section class="mt-20 space-y-8 md:mt-28" aria-labelledby="promises-title">
			<div class="mx-auto max-w-2xl space-y-3 text-center">
				<h2 id="promises-title" class="text-2xl font-bold text-balance md:text-3xl">
					{m.promises.title}
				</h2>
				<p class="text-balance text-surface-700-300">{m.promises.intro}</p>
			</div>
			<ul class="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
				{#each promises as promise, index (promise.title)}
					<li
						class={[
							'card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-5',
							index < 4 ? 'lg:col-span-3' : 'lg:col-span-4'
						]}
					>
						<span
							class="flex size-11 items-center justify-center rounded-full preset-tonal-primary"
						>
							<promise.icon size="22" aria-hidden="true" />
						</span>
						<h3 class="font-semibold text-balance">{promise.title}</h3>
						<p class="text-sm text-surface-700-300">{promise.text}</p>
					</li>
				{/each}
			</ul>
		</section>

		<!-- The calls they no longer take: what the perfect job's criteria stop, in three cases -->
		<section class="mt-20 space-y-6 md:mt-28" aria-labelledby="spared-title">
			<h2 id="spared-title" class="text-center text-xl font-bold text-balance md:text-2xl">
				{m.spared.title}
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

		<!-- Make it yours: the look and the views of the experiences page -->
		<section
			class="mt-20 grid items-center gap-10 md:mt-28 lg:grid-cols-2 lg:gap-16"
			aria-labelledby="yours-title"
		>
			<div class="space-y-6 lg:order-2">
				<div class="space-y-3">
					<h2 id="yours-title" class="text-2xl font-bold text-balance md:text-3xl">
						{m.yours.title}
					</h2>
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
								<h3 class="font-semibold text-balance">{feature.title}</h3>
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

		<!-- How it works: the card's four steps -->
		<section class="mt-20 space-y-8 md:mt-28" aria-labelledby="how-title">
			<div class="mx-auto max-w-2xl space-y-3 text-center">
				<h2 id="how-title" class="text-2xl font-bold text-balance md:text-3xl">{m.how.title}</h2>
				<p class="text-balance text-surface-700-300">{m.how.intro}</p>
			</div>
			<ol class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{#each howItWorks as step, index (step.title)}
					<li class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-5">
						<span
							class="flex size-9 items-center justify-center rounded-full preset-tonal-primary font-bold"
							aria-hidden="true">{index + 1}</span
						>
						<h3 class="font-semibold text-balance">
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
			<h2 id="faq-title" class="text-center text-2xl font-bold text-balance md:text-3xl">
				{m.faq.title}
			</h2>
			<div class="space-y-3">
				{@render question(m.faq.pay.question, neverPay)}
				{@render question(m.faq.looking.question, notLooking)}
				{@render question(m.faq.visibility.question, whoCanSee)}
				{@render question(m.faq.recruiters.question, whatRecruitersSee)}
				{@render question(m.faq.audience.question, forWhom)}
				{@render question(m.faq.resume.question, resumePdf)}
				{@render question(m.faq.money.question, makesMoney)}
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
				<h2 id="cta-title" class="text-2xl font-bold text-balance md:text-3xl">{m.cta.title}</h2>
				<p class="mx-auto max-w-lg text-balance text-surface-700-300">{m.cta.text}</p>
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
			<!-- Balanced: a question never ends with one word alone on its last line -->
			<span class="text-balance">{summary}</span>
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

<!-- The links inside the answers: the privacy policy, the terms of use, the account page -->
{#snippet privacy(text: string)}<a href={resolve('/(site)/legal/privacy')} class={linkClass}
		>{text}</a
	>{/snippet}

{#snippet terms(text: string)}<a href="{resolve('/(site)/legal/terms')}#service" class={linkClass}
		>{text}</a
	>{/snippet}

{#snippet account(text: string)}<a href={resolve('/(site)/account')} class={linkClass}>{text}</a
	>{/snippet}

{#snippet neverPay()}
	<p><Rich text={m.faq.pay.answer} {terms} /></p>
{/snippet}

{#snippet notLooking()}
	<p>{m.faq.looking.answer}</p>
{/snippet}

{#snippet forWhom()}
	<p>{m.faq.audience.answer}</p>
{/snippet}

{#snippet makesMoney()}
	<p><Rich text={m.faq.money.answer} {terms} /></p>
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

<style>
	/* The headline: its breakpoint's size (--hero-size), smaller where its longest phrase would not
	   fit the column on one line (0.52em a character: Inter's bold takes 0.49em, the system fonts
	   of macOS, Windows and Android less). The first line is for a browser without container
	   units */
	.hero-title {
		font-size: var(--hero-size);
		font-size: min(var(--hero-size), calc(100cqi / (var(--longest-phrase) * 0.52)));
	}
</style>
