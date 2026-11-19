<!--
@component
The admin's Share tab: the owner's link with a button that copies it, the reply to a recruiter who
wrote to them and a text for their LinkedIn profile (services/shareKit.ts writes both), in English
or in French whatever the page's language: the recruiter's, which the owner picks. The reply asks
the recruiter for the job and its pay range, and says what the owner's journey does with it
(GET /me/readiness, which the page reads), sending recruiters to the page for recruiters only once
they can book there (the calendar open, no step that can never be passed). While the readiness
could not be read, or read again, the texts promise nothing of that page, whatever was read
before. What the owner asks for (their pay, remote days, places, contracts) goes in the reply only
once they tick it: then it is filled in from their perfect job (GET /perfect-job, asked when a
fact is ticked, again once the tab was shown again), and stays theirs to change. Nothing here is
saved or sent anywhere: the owner copies what they want.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowRight, Eye } from 'svelte-heros-v2';
	import {
		CONTRACT_TYPE_LABELS,
		FR_CONTRACT_TYPES,
		LOCALES,
		LOCALE_NAMES,
		getLocale,
		storedPerfectJob,
		type ContractType,
		type Locale
	} from 'portfolio-common';
	import { portfolioTextApi } from '#services';
	import {
		portfolioLink,
		type AdminTab,
		type Readiness,
		type ReadinessFailure
	} from '#services/candidateSetup.ts';
	import { typedNumber } from '#services/perfectJob.ts';
	import {
		MAX_REMOTE_DAYS,
		SHARE_FACTS,
		UNKNOWN_JOURNEY,
		linkedInText,
		payAmountValid,
		perfectJobFacts,
		replyText,
		sharedJourney,
		type PayPer,
		type ShareFact,
		type ShareFacts
	} from '#services/shareKit.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import CopyLink from '#components/share/CopyLink.svelte';
	import CopyText from '#components/share/CopyText.svelte';
	import { m } from './ShareTab.messages.ts';

	let {
		domainName,
		readiness,
		failure,
		reload,
		shown,
		openTab
	}: {
		domainName: string;
		/** What the account has set up (GET /me/readiness): what its journey asks of recruiters */
		readiness: Readiness | null;
		/**
		 * Why the last read of the readiness failed, null once one succeeded: `readiness` is then
		 * the one read before (or null), maybe out of date
		 */
		failure: ReadinessFailure | null;
		/** Reads the readiness again */
		reload: () => void;
		/** The tab is the one shown */
		shown: boolean;
		/** Shows another tab of the admin page */
		openTab: (tab: AdminTab) => void;
	} = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;

	let portfolio = $derived(portfolioLink(page.url.origin, domainName));
	/** What the steps ask is known: read, and not out of date */
	let journeyKnown = $derived(!!readiness && !failure);
	// A readiness that could not be read again may name a step the journey no longer has
	let journey = $derived(journeyKnown ? sharedJourney(readiness) : UNKNOWN_JOURNEY);
	/** The language of the texts: the page's to start with */
	let locale = $state<Locale>(getLocale());
	let language = $derived(locale === 'fr' ? m.language.name.french : m.language.name.english);

	// --- What the owner asks for -------------------------------------------------------------
	let ticked = $state<Record<ShareFact, boolean>>({
		pay: false,
		remoteDays: false,
		places: false,
		contracts: false
	});
	let payAmount = $state('');
	let payPer = $state<PayPer>('year');
	/** '' until chosen, else 1 to 5 */
	let remoteDays = $state('');
	let places = $state('');
	let contracts = $state<ContractType[]>([]);

	let payValue = $derived(typedNumber(payAmount) ?? Number.NaN);
	/** The amount typed cannot go in the reply (empty is not a problem: there is nothing to say) */
	let payInvalid = $derived(ticked.pay && !!payAmount.trim() && !payAmountValid(payValue));
	let facts = $derived<ShareFacts>({
		...(ticked.pay ? { pay: { amount: payValue, per: payPer } } : {}),
		...(ticked.remoteDays && remoteDays ? { remoteDays: Number(remoteDays) } : {}),
		...(ticked.places ? { places } : {}),
		...(ticked.contracts ? { contracts } : {})
	});

	/** What the reply asks, and where: as the journey and the calendar have it */
	let replyHint = $derived(
		!journeyKnown
			? m.reply.asksUnknown
			: journey.blocked
				? m.reply.blocked
				: journey.calendarClosed
					? readiness?.calendar.configured
						? m.reply.calendarClosed
						: m.reply.bookingUnavailable
					: journey.job
						? m.reply.asksThere
						: m.reply.asksBack
	);

	let reply = $derived(replyText(locale, { portfolio, journey, facts }));
	let linkedIn = $derived(linkedInText(locale, { portfolio, journey }));

	// --- The perfect job, read once a fact is ticked -------------------------------------------
	let perfectJobStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let perfectJobRequest: Promise<ShareFacts | null> | undefined;
	/** The facts filled in from the perfect job already: never again (what was changed stays) */
	const prefilled: Partial<Record<ShareFact, true>> = {};

	// Shown again, the tab reads the perfect job again for the next fact ticked: the Perfect job
	// tab may have saved it meanwhile (the facts filled in already stay as they are)
	$effect(() => {
		if (shown) perfectJobRequest = undefined;
	});

	function perfectJob(): Promise<ShareFacts | null> {
		if (perfectJobRequest) return perfectJobRequest;
		const request = readPerfectJob();
		perfectJobRequest = request;
		void request.then((known) => {
			// Asked again by the next fact ticked
			if (!known && perfectJobRequest === request) perfectJobRequest = undefined;
		});
		return request;
	}

	async function readPerfectJob(): Promise<ShareFacts | null> {
		perfectJobStatus = 'loading';
		try {
			const { data, error } = await portfolioTextApi['perfect-job'].get(withCredentials);
			if (error || !data) throw new Error('perfect job');
			perfectJobStatus = 'ready';
			return perfectJobFacts(storedPerfectJob(data.criteria));
		} catch {
			perfectJobStatus = 'error';
			return null;
		}
	}

	/** Fills `fact` in from the perfect job, unless the owner typed it already */
	function fill(fact: ShareFact, known: ShareFacts) {
		if (fact === 'pay' && !payAmount.trim() && known.pay) {
			payAmount = String(known.pay.amount);
			payPer = known.pay.per;
		} else if (fact === 'remoteDays' && !remoteDays && known.remoteDays) {
			remoteDays = String(known.remoteDays);
		} else if (fact === 'places' && !places.trim() && known.places) {
			places = known.places;
		} else if (fact === 'contracts' && !contracts.length && known.contracts) {
			contracts = [...known.contracts];
		}
	}

	async function toggle(fact: ShareFact, on: boolean) {
		ticked[fact] = on;
		if (!on || prefilled[fact]) return;
		const known = await perfectJob();
		if (!known || !ticked[fact] || prefilled[fact]) return;
		prefilled[fact] = true;
		fill(fact, known);
	}

	const FACT_LABELS: Record<ShareFact, string> = {
		get pay() {
			return m.facts.pay;
		},
		get remoteDays() {
			return m.facts.remoteDays;
		},
		get places() {
			return m.facts.places;
		},
		get contracts() {
			return m.facts.contracts;
		}
	};

	const linkButton = 'btn btn-sm preset-tonal';
</script>

<div class="space-y-8">
	<section class="space-y-2">
		<h2 class="h3">{m.title}</h2>
		<p class="opacity-75">{m.intro}</p>
	</section>

	<section class="space-y-3" aria-labelledby="{uid}-link">
		<h3 class="h4" id="{uid}-link">{m.link.title}</h3>
		<CopyLink link={portfolio} caption={m.link.caption} />
		<a class={linkButton} href={resolve('/[domain]/hire', { domain: domainName })}>
			<Eye size="16" aria-hidden="true" />
			{m.link.see}
		</a>
	</section>

	<fieldset class="space-y-2" aria-describedby="{uid}-language-hint">
		<legend class="h4">{m.language.legend}</legend>
		<p class="text-sm text-surface-700-300" id="{uid}-language-hint">{m.language.hint}</p>
		<div class="flex flex-wrap gap-x-5 gap-y-2">
			{#each LOCALES as option (option)}
				<label class="flex min-h-8 items-center gap-2 text-sm" lang={option}>
					<input
						class="radio"
						type="radio"
						name="{uid}-locale"
						value={option}
						bind:group={locale}
					/>
					{LOCALE_NAMES[option]}
				</label>
			{/each}
		</div>
	</fieldset>

	<section class="space-y-4" aria-labelledby="{uid}-reply">
		<div class="space-y-2">
			<h3 class="h4" id="{uid}-reply">{m.reply.title}</h3>
			{#if failure}
				<!-- Not read, or not read again: what the texts say of the steps cannot be trusted -->
				<div
					class="card preset-tonal-warning flex flex-wrap items-center gap-3 p-3 sm:p-4"
					role="status"
					data-readiness-failed
				>
					<p class="min-w-0 flex-1 basis-60 text-sm">{m.readinessFailed[failure]}</p>
					<button type="button" class="btn btn-sm preset-tonal" onclick={reload}>
						{common.retry}
					</button>
				</div>
			{/if}
			<p class="text-sm text-surface-700-300" data-reply-hint>{replyHint}</p>
			<!-- Where to change what the reply says, once the steps are known -->
			{#if journeyKnown}
				{#if journey.blocked}
					<button type="button" class={linkButton} onclick={() => openTab('workflows')}>
						{m.reply.changeSteps}
						<ArrowRight size="16" aria-hidden="true" />
					</button>
				{:else if journey.calendarClosed}
					{#if readiness?.calendar.configured}
						<button type="button" class={linkButton} onclick={() => openTab('appointments')}>
							{m.reply.openCalendar}
							<ArrowRight size="16" aria-hidden="true" />
						</button>
					{/if}
				{:else if !journey.job}
					<button type="button" class={linkButton} onclick={() => openTab('start')}>
						{m.reply.setSteps}
						<ArrowRight size="16" aria-hidden="true" />
					</button>
				{:else if journey.nothingToScore}
					<p class="text-sm text-surface-700-300">{m.reply.nothingToScore}</p>
					<button type="button" class={linkButton} onclick={() => openTab('perfect-job')}>
						{m.reply.setPerfectJob}
						<ArrowRight size="16" aria-hidden="true" />
					</button>
				{/if}
			{/if}
		</div>

		<fieldset class="card space-y-3 border border-surface-200-800 p-4" data-share-facts>
			<legend class="px-1 text-sm font-semibold">{m.facts.legend}</legend>
			<p class="text-sm text-surface-700-300">{m.facts.hint}</p>
			<ul class="space-y-3">
				{#each SHARE_FACTS as fact (fact)}
					<li class="space-y-2">
						<label class="flex min-h-8 items-center gap-2 text-sm font-medium">
							<input
								class="checkbox"
								type="checkbox"
								checked={ticked[fact]}
								onchange={(event) => void toggle(fact, event.currentTarget.checked)}
								data-fact={fact}
							/>
							{FACT_LABELS[fact]}
						</label>
						{#if ticked[fact]}
							<div class="space-y-2 ps-6">
								{#if fact === 'pay'}
									<div class="flex flex-wrap items-end gap-2">
										<div class="min-w-0 flex-1 basis-40 space-y-1">
											<label class="label-text text-sm" for="{uid}-pay-amount"
												>{m.facts.amount}</label
											>
											<input
												class="input"
												id="{uid}-pay-amount"
												type="text"
												inputmode="numeric"
												autocomplete="off"
												aria-invalid={payInvalid || undefined}
												aria-describedby={payInvalid ? `${uid}-pay-invalid` : undefined}
												bind:value={payAmount}
											/>
										</div>
										<div class="space-y-1">
											<label class="label-text text-sm" for="{uid}-pay-per">{m.facts.per}</label>
											<select class="select" id="{uid}-pay-per" bind:value={payPer}>
												<option value="year">{m.facts.perYear}</option>
												<option value="day">{m.facts.perDay}</option>
											</select>
										</div>
									</div>
									{#if payInvalid}
										<p class="text-sm text-error-700-300" id="{uid}-pay-invalid">
											{m.facts.amountInvalid}
										</p>
									{/if}
								{:else if fact === 'remoteDays'}
									<label class="sr-only" for="{uid}-remote-days">{m.facts.remoteDays}</label>
									<select class="select max-w-xs" id="{uid}-remote-days" bind:value={remoteDays}>
										<option value="">{m.facts.remoteDaysNone}</option>
										{#each Array.from({ length: MAX_REMOTE_DAYS }, (_, index) => index + 1) as days (days)}
											<option value={String(days)}>
												{days === MAX_REMOTE_DAYS ? m.facts.fullyRemote : days}
											</option>
										{/each}
									</select>
								{:else if fact === 'places'}
									<label class="sr-only" for="{uid}-places">{m.facts.places}</label>
									<input
										class="input"
										id="{uid}-places"
										type="text"
										autocomplete="off"
										placeholder={m.facts.placesExample}
										bind:value={places}
									/>
								{:else}
									<div
										class="flex flex-wrap gap-x-5 gap-y-2"
										role="group"
										aria-label={m.facts.contracts}
									>
										{#each FR_CONTRACT_TYPES as type (type)}
											<label class="flex min-h-8 items-center gap-2 text-sm">
												<input
													class="checkbox"
													type="checkbox"
													value={type}
													bind:group={contracts}
												/>
												{CONTRACT_TYPE_LABELS[type]}
											</label>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="text-sm text-surface-700-300" role="status">
				{#if perfectJobStatus === 'loading'}
					{m.facts.loading}
				{:else if perfectJobStatus === 'error'}
					{m.facts.failed}
				{/if}
			</p>
		</fieldset>

		<CopyText text={reply} label={m.reply.label(language)} copyLabel={m.reply.copy} rows={6} />
	</section>

	<section class="space-y-3" aria-labelledby="{uid}-linkedin">
		<h3 class="h4" id="{uid}-linkedin">{m.linkedIn.title}</h3>
		<p class="text-sm text-surface-700-300">{m.linkedIn.hint}</p>
		<CopyText
			text={linkedIn}
			label={m.linkedIn.label(language)}
			copyLabel={m.linkedIn.copy}
			rows={3}
		/>
	</section>
</div>
