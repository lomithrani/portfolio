<!--
@component
Discovery (Path 2, CLAUDE.md "Matching"), at the end of the Perfect job tab (#discovery): being
proposed to recruiters as an anonymous card, optional, off until the owner turns it on. Saved apart
from the criteria form, so that turning it off never waits for a save. The admin page owns the
status (GET /discovery, read by the Get started tab too) and gives it here; while matching is off
(a 404) nothing shows, and nothing errors; nor before a read answered (a read that failed shows
nothing either: whether matching is available is not known).

It shows where the owner stands (off, on since a day, paused for what is missing, a consent that
ends soon or has ended) and the one bar a job is held to (their journey's job match minimum), what
is missing with what fixes it (ReadinessChecklist), the card's settings (a headline, the
experiences it leaves out: PUT /discovery, a headline the API refuses for saying who they are shown
on the field; leaving the page with changes not saved asks first) with a preview of the card as
recruiters read it (CardPreviewDialog), the consent (an unticked box of its own, worded
legalMessages.discoveryConsent, apart from the terms: POST /discovery/consent, held back while the
card or the criteria hold changes not saved yet), a link to the jobs proposed (/opportunities) while
it is on, and turning it off (DELETE /discovery/consent, also once the consent ended: it drops the
answers about them), asked first, which says that turning it on again waits DISCOVERY_REJOIN_DAYS; a
refused opt-in (429) says from when it can be turned on again (its Retry-After). The button that
turns it on stays focusable when it cannot be used (aria-disabled), and why is read out.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowPath, ArrowRight, Eye, MagnifyingGlass } from 'svelte-heros-v2';
	import {
		DISCOVERY_LIMITS,
		DISCOVERY_REJOIN_DAYS,
		cleanHeadline,
		discoveryRequirementMessage,
		legalMessages
	} from 'portfolio-common';
	import type { AdminTab } from '#services/candidateSetup.ts';
	import {
		cardChanged,
		cardForm,
		cardProblem,
		cardSettings,
		consentAction,
		discoveryOn,
		discoveryWithdrawable,
		formatMoment,
		loadDiscovery,
		rebaseCardForm,
		rejoinDate,
		saveDiscoveryCard,
		turnDiscoveryOff,
		turnDiscoveryOn,
		type CardExperience,
		type CardForm,
		type DiscoveryFailure,
		type DiscoveryKnown
	} from '#services/discovery.ts';
	import type { DiscoveryStatus } from '#services/matching.ts';
	import { formatDay, networkError } from '#services/recruiter.ts';
	import { toaster } from '#services/toaster.ts';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import CardPreviewDialog from './CardPreviewDialog.svelte';
	import ReadinessChecklist from './ReadinessChecklist.svelte';
	import { m } from './discovery.messages.ts';

	let {
		discovery,
		onDiscovery,
		reload,
		experiences,
		criteriaChanged,
		active,
		openJourney,
		openTab,
		onCriteria
	}: {
		/** GET /discovery as the page read it; null until a read answered */
		discovery: DiscoveryKnown | null;
		/** What a change answered: the page keeps it (the Get started tab reads it too) */
		onDiscovery: (status: DiscoveryStatus) => void;
		/** Reads it again */
		reload: () => void;
		/** The portfolio's experiences, the card's settings list them */
		experiences: readonly CardExperience[];
		/** The criteria above hold changes not saved yet: turning it on waits for them */
		criteriaChanged: boolean;
		/** The Perfect job tab is the one shown */
		active: boolean;
		/** Shows the Hiring journey tab, adding the gate's missing steps (`gate`) */
		openJourney: (add?: 'gate') => void;
		openTab: (tab: AdminTab) => void;
		/** Shows the criteria above: the pay, or the first of them */
		onCriteria: (which: 'pay' | 'criteria') => void;
	} = $props();

	const uid = $props.id();
	let status = $derived(discovery?.kind === 'ready' ? discovery.status : null);
	let action = $derived(status ? consentAction(status, new Date()) : null);

	/** What a failed change of `kind` says (null: said elsewhere, at its field) */
	const failureText = (failure: DiscoveryFailure, fallback: string): string => {
		switch (failure.kind) {
			case 'requirement':
				return discoveryRequirementMessage(failure.requirement);
			case 'consent':
			case 'headline':
			case 'card':
				return failure.message;
			case 'wait':
				return failure.until
					? m.consent.waitUntil(formatMoment(failure.until))
					: m.consent.waitLater;
			case 'off':
				return m.unavailable;
			case 'session-expired':
				return m.sessionExpired;
			case 'network':
				return networkError();
			default:
				return fallback;
		}
	};

	// --- The card's settings ---------------------------------------------------------------
	/** The settings the form started from (the saved ones it was last reset to) */
	let base = $state.raw<DiscoveryStatus['card'] | null>(null);
	let form = $state<CardForm>({ headline: '', hidden: [] });
	let savingCard = $state(false);
	let cardError = $state('');
	/** The settings saved changed elsewhere since the form started: said until the next save */
	let cardNotice = $state('');
	/** What the API refused in the headline, and the headline it refused: said until it changes */
	let refusedHeadline = $state.raw<{ message: string; sent: string } | null>(null);

	// The settings saved changed (read again, or saved here): the form follows them; changes not
	// saved yet stay, on top of the settings saved now (rebaseCardForm: a save from this tab never
	// shows again an experience hidden from another since; saveCard reads them first too, for a
	// window that stayed in view)
	$effect(() => {
		const card = status?.card;
		if (!card) return;
		untrack(() => {
			form = base && cardChanged(form, base) ? rebaseCardForm(form, base, card) : cardForm(card);
			base = card;
		});
	});

	let changed = $derived(!!status && cardChanged(form, status.card));

	// A card not saved: leaving the page asks first, as for the criteria above (whose own guard asks
	// when they hold changes too: one question). A reload or a closed tab gets the browser's prompt
	beforeNavigate((navigation) => {
		if (!changed || criteriaChanged) return;
		if (navigation.type === 'leave') {
			navigation.cancel();
			return;
		}
		if (!confirm(m.card.leaveUnsaved)) navigation.cancel();
	});
	let localProblem = $derived(cardProblem(form));
	let headlineError = $derived(
		localProblem?.field === 'headline'
			? localProblem.message
			: refusedHeadline && refusedHeadline.sent === form.headline
				? refusedHeadline.message
				: ''
	);
	let headlineLength = $derived(cleanHeadline(form.headline).length);

	function toggleHidden(id: string, shown: boolean) {
		form.hidden = shown
			? form.hidden.filter((hidden) => hidden !== id)
			: [...form.hidden.filter((hidden) => hidden !== id), id];
	}

	async function saveCard() {
		if (!changed || localProblem || headlineError || savingCard || turningOn) return;
		savingCard = true;
		cardError = '';
		cardNotice = '';
		// PUT /discovery replaces the whole card: the settings saved now are read first (a window
		// that stayed in view never read them again). Changed from another window or device since
		// the form started, the form takes them under its own changes, shown to check before a save:
		// never an experience hidden from elsewhere shown again unseen
		const saved = await loadDiscovery();
		if (saved.kind !== 'ready') {
			savingCard = false;
			if (saved.kind === 'off') {
				cardError = m.unavailable;
				reload();
			} else {
				cardError = failureText({ kind: saved.reason }, m.card.saveFailed);
			}
			return;
		}
		if (base && cardChanged(cardForm(saved.status.card), base)) {
			form = rebaseCardForm($state.snapshot(form), base, saved.status.card);
			base = saved.status.card;
			onDiscovery(saved.status);
			savingCard = false;
			cardNotice = m.card.changedElsewhere;
			return;
		}
		const sent = form.headline;
		const result = await saveDiscoveryCard(cardSettings($state.snapshot(form)));
		savingCard = false;
		if (!result.ok) {
			if (result.failure.kind === 'headline') {
				refusedHeadline = { message: result.failure.message, sent };
				await tick();
				document.getElementById(`${uid}-headline`)?.focus();
			} else {
				cardError = failureText(result.failure, m.card.saveFailed);
			}
			if (result.failure.kind === 'off') reload();
			return;
		}
		refusedHeadline = null;
		base = result.status.card;
		form = cardForm(result.status.card);
		onDiscovery(result.status);
		toaster.success({ title: m.card.saved });
	}

	function undoCard() {
		if (!status) return;
		base = status.card;
		form = cardForm(status.card);
		refusedHeadline = null;
		cardError = '';
		cardNotice = '';
	}

	// --- The preview -------------------------------------------------------------------------
	let previewOpen = $state(false);
	let previewButton: HTMLButtonElement | undefined = $state();

	// --- The consent -------------------------------------------------------------------------
	let ticked = $state(false);
	let consentError = $state('');
	let turningOn = $state(false);
	let turnOnError = $state('');
	/**
	 * From when it can be turned on again: a 429's Retry-After, or DISCOVERY_REJOIN_DAYS after the
	 * owner turned it off here (a later visit learns it from the 429)
	 */
	let waitUntil = $state.raw<Date | null>(null);
	// Once that moment passes, it can be turned on again: the wait goes (a timer never runs more than
	// setTimeout's longest delay at once: it is set again until the moment comes)
	$effect(() => {
		const until = waitUntil;
		if (!until) return;
		const left = until.getTime() - Date.now();
		if (left <= 0) {
			waitUntil = null;
			return;
		}
		const timer = setTimeout(
			() => (waitUntil = until.getTime() <= Date.now() ? null : new Date(until)),
			Math.min(left, MAX_TIMEOUT_MS)
		);
		return () => clearTimeout(timer);
	});
	let blockedBy = $derived(
		!status
			? ''
			: status.missing.length > 0
				? m.consent.missingFirst
				: changed || savingCard
					? m.consent.saveCardFirst
					: criteriaChanged
						? m.consent.saveCriteriaFirst
						: waitUntil
							? m.consent.waitUntil(formatMoment(waitUntil))
							: ''
	);

	async function turnOn() {
		if (!status || !action || turningOn || blockedBy) return;
		turnOnError = '';
		if (!ticked) {
			consentError = legalMessages.discoveryConsentRequired;
			await tick();
			document.getElementById(`${uid}-consent`)?.focus();
			return;
		}
		consentError = '';
		turningOn = true;
		const asked = action;
		const result = await turnDiscoveryOn();
		turningOn = false;
		if (!result.ok) {
			const { failure } = result;
			if (failure.kind === 'wait') {
				// Said by the line under the button, read out (the button keeps the focus)
				waitUntil = failure.until;
				if (!failure.until) turnOnError = m.consent.waitLater;
			} else if (failure.kind !== 'consent') turnOnError = failureText(failure, m.consent.failed);
			// What the API found missing, or matching turned off: the page reads where it stands
			if (failure.kind === 'requirement' || failure.kind === 'off') reload();
			if (failure.kind === 'consent') {
				// Said at the box, which takes the focus so that it is read
				consentError = failure.message;
				await tick();
				document.getElementById(`${uid}-consent`)?.focus();
			}
			return;
		}
		ticked = false;
		waitUntil = null;
		onDiscovery(result.status);
		toaster.success({
			title: asked === 'turn-on' || asked === 'give-again' ? m.consent.turnedOn : m.consent.renewed
		});
		// The box and its button went: the focus goes to the heading, above where they stand now
		await tick();
		heading?.focus();
	}

	// --- Turning it off ----------------------------------------------------------------------
	let confirmingOff = $state(false);
	/** It is turned off once the consent ended (already proposed to nobody): said so */
	let offLapsed = $state(false);
	let turningOff = $state(false);
	let offError = $state('');
	let heading: HTMLElement | undefined = $state();
	let offButton: HTMLButtonElement | undefined = $state();

	async function turnOff() {
		if (turningOff) return;
		turningOff = true;
		offError = '';
		const result = await turnDiscoveryOff();
		turningOff = false;
		if (!result.ok) {
			offError = failureText(result.failure, m.off.failed);
			if (result.failure.kind === 'off') {
				confirmingOff = false;
				reload();
			}
			return;
		}
		confirmingOff = false;
		waitUntil = rejoinDate(new Date());
		onDiscovery(result.status);
		toaster.success({ title: m.off.done });
	}

	// --- A link to #discovery (`?tab=perfect-job#discovery`): brought into view once shown ---
	let broughtIntoView = false;
	$effect(() => {
		if (!active || !status || !heading || broughtIntoView) return;
		broughtIntoView = true;
		if (location.hash === '#discovery') {
			untrack(() => heading?.scrollIntoView({ block: 'start' }));
		}
	});

	/** setTimeout's longest delay (about 24 days) */
	const MAX_TIMEOUT_MS = 2 ** 31 - 1;
	const smallButton = 'btn btn-sm max-w-full whitespace-normal text-center leading-5 py-0.75';
	const stateBadge = {
		off: 'preset-tonal',
		on: 'preset-filled-success-500',
		paused: 'preset-tonal-warning',
		lapsed: 'preset-tonal-warning'
	} as const;
</script>

{#if status}
	<section
		id="discovery"
		class="card space-y-5 border border-surface-200-800 p-4 sm:p-5"
		aria-labelledby="{uid}-title"
		data-discovery
		data-state={status.state}
	>
		<div class="space-y-2">
			<!-- On a phone the state goes under the title, whatever the state and the language: the
			     header never jumps from one to the next -->
			<div class="flex items-start gap-x-3">
				<MagnifyingGlass
					size="20"
					class="mt-1 shrink-0 text-primary-700-300 sm:mt-1.5"
					aria-hidden="true"
				/>
				<div
					class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3"
				>
					<h3
						id="{uid}-title"
						class="h4 outline-none"
						tabindex="-1"
						data-discovery-title
						bind:this={heading}
					>
						{m.title}
					</h3>
					<span class="badge {stateBadge[status.state]}" data-discovery-state>
						{m.state[status.state]}
					</span>
				</div>
			</div>
			<p class="text-sm text-surface-700-300">
				{#if status.state === 'off'}{m.optional}{/if}
				{m.intro}
			</p>
			<!-- Where they stand, read out when it changes (turned on or off here) -->
			<div aria-live="polite">
				{#if status.state === 'on' && action === 'renew' && status.consentExpiresAt}
					<p class="text-sm font-medium">{m.renew(formatDay(status.consentExpiresAt))}</p>
				{:else if status.state === 'on' && status.enabledAt && status.consentExpiresAt}
					<p class="text-sm font-medium">
						{m.on(formatDay(status.enabledAt), formatDay(status.consentExpiresAt))}
					</p>
				{:else if status.state === 'paused'}
					<p class="text-sm font-medium">{m.paused}</p>
					{#if action === 'renew' && status.consentExpiresAt}
						<p class="text-sm font-medium">{m.pausedRenew(formatDay(status.consentExpiresAt))}</p>
					{/if}
				{:else if status.state === 'lapsed' && status.consentExpiresAt}
					<p class="text-sm font-medium">{m.lapsed(formatDay(status.consentExpiresAt))}</p>
				{/if}
			</div>
			{#if discoveryOn(status)}
				<a class="{smallButton} preset-tonal" href={resolve('/(app)/opportunities')}>
					{m.opportunities}
					<ArrowRight size="16" aria-hidden="true" />
				</a>
			{/if}
			{#if status.minScore !== null}
				<p class="text-sm">
					<Rich text={m.minimum(status.minScore)}>
						{#snippet journey(text)}
							<button
								type="button"
								class="underline underline-offset-2"
								onclick={() => openJourney()}
							>
								{text}
							</button>
						{/snippet}
					</Rich>
				</p>
			{/if}
		</div>

		{#if status.missing.length > 0 || status.state === 'off'}
			<ReadinessChecklist
				missing={status.missing}
				heading={status.state === 'off' ? m.checklist.before : m.checklist.missing}
				{onCriteria}
				onJourney={() => openJourney('gate')}
				onAppointments={() => openTab('appointments')}
			/>
		{/if}

		<!-- The anonymous card: its settings, saved on their own -->
		<section class="space-y-3" aria-labelledby="{uid}-card" data-discovery-card>
			<h4 id="{uid}-card" class="font-semibold">{m.card.title}</h4>
			<p class="text-sm text-surface-700-300">{m.card.text}</p>
			<div class="space-y-1">
				<div class="flex items-baseline justify-between gap-3">
					<label class="label-text text-sm font-medium" for="{uid}-headline">
						{m.card.headline}
						<span class="font-normal text-surface-700-300">({common.optional})</span>
					</label>
					<span
						class={[
							'text-xs tabular-nums',
							headlineLength > DISCOVERY_LIMITS.headline
								? 'text-error-700-300'
								: 'text-surface-700-300'
						]}
						aria-hidden="true"
					>
						{m.card.count(headlineLength, DISCOVERY_LIMITS.headline)}
					</span>
				</div>
				<input
					id="{uid}-headline"
					class="input"
					type="text"
					autocomplete="off"
					placeholder={m.card.headlinePlaceholder}
					bind:value={form.headline}
					disabled={savingCard}
					aria-invalid={headlineError ? 'true' : undefined}
					aria-describedby={headlineError
						? `${uid}-headline-hint ${uid}-headline-error`
						: `${uid}-headline-hint`}
				/>
				<p id="{uid}-headline-hint" class="text-xs text-surface-700-300">
					{m.card.headlineHint(DISCOVERY_LIMITS.headline)}
				</p>
				{#if headlineError}
					<p id="{uid}-headline-error" class="text-sm text-error-700-300">{headlineError}</p>
				{/if}
			</div>

			<fieldset class="space-y-2" aria-describedby="{uid}-experiences-hint">
				<legend class="text-sm font-medium">{m.card.experiences}</legend>
				<p id="{uid}-experiences-hint" class="text-xs text-surface-700-300">
					{experiences.length > 0 ? m.card.experiencesHint : m.card.noExperience}
				</p>
				{#if experiences.length > 0}
					<ul
						class="divide-y divide-surface-200-800 rounded-container border border-surface-200-800"
					>
						{#each experiences as experience (experience.id)}
							{@const shown = !form.hidden.includes(experience.id)}
							<li>
								<label
									class="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm"
									data-experience={experience.id}
								>
									<input
										type="checkbox"
										class="checkbox mt-0.5 shrink-0"
										checked={shown}
										disabled={savingCard}
										onchange={(event) => toggleHidden(experience.id, event.currentTarget.checked)}
									/>
									<span class="min-w-0 break-words">
										<span class="font-medium">{experience.title || m.card.untitled}</span>
										{#if experience.company}
											<span class="text-surface-700-300">· {experience.company}</span>
										{/if}
									</span>
								</label>
							</li>
						{/each}
					</ul>
				{/if}
			</fieldset>
			{#if localProblem && localProblem.field === 'card'}
				<p class="text-sm text-error-700-300">{localProblem.message}</p>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="btn preset-filled-primary-700-300"
					disabled={!changed || !!localProblem || !!headlineError || savingCard || turningOn}
					onclick={saveCard}
				>
					{savingCard ? common.saving : m.card.save}
				</button>
				{#if changed}
					<button type="button" class="btn preset-tonal" disabled={savingCard} onclick={undoCard}>
						{m.card.undo}
					</button>
				{/if}
				<button
					type="button"
					class="btn hover:preset-tonal"
					bind:this={previewButton}
					onclick={() => (previewOpen = true)}
				>
					<Eye size="18" aria-hidden="true" />
					{m.card.preview}
				</button>
			</div>
			{#if cardError}
				<p class="text-sm text-error-700-300" role="alert">{cardError}</p>
			{/if}
			{#if cardNotice}
				<p class="card preset-tonal-warning p-3 text-sm" role="alert" data-card-changed-elsewhere>
					{cardNotice}
				</p>
			{/if}
		</section>

		{#if action}
			<!-- The consent: a box of its own, unticked, apart from the terms (18 or over) -->
			<section class="space-y-3 border-t border-surface-200-800 pt-4" data-discovery-consent>
				<div class="space-y-2">
					<label for="{uid}-consent" class="flex cursor-pointer items-start gap-3 text-sm">
						<input
							id="{uid}-consent"
							type="checkbox"
							class="checkbox mt-0.5 shrink-0"
							bind:checked={ticked}
							disabled={turningOn || savingCard}
							onchange={() => (consentError = '')}
							aria-invalid={consentError ? 'true' : undefined}
							aria-describedby={consentError
								? `${uid}-consent-notice ${uid}-consent-error`
								: `${uid}-consent-notice`}
						/>
						<span class="text-surface-950-50">{legalMessages.discoveryConsent}</span>
					</label>
					<p id="{uid}-consent-notice" class="ps-7 text-xs text-surface-700-300">
						<Rich text={m.consent.privacy}>
							{#snippet privacy(text)}<a
									class="link-text"
									href="{resolve('/(site)/legal/privacy')}#data-matching"
									target="_blank"
									rel="noopener">{text}</a
								>{/snippet}
						</Rich>
					</p>
					{#if consentError}
						<p id="{uid}-consent-error" class="ps-7 text-sm text-error-700-300">{consentError}</p>
					{/if}
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<!-- Never disabled: it keeps the focus when it cannot be used (aria-disabled), and the
					line beside it, read out, says why -->
					<button
						type="button"
						class={[
							'btn preset-filled-primary-700-300 max-w-full whitespace-normal text-center leading-5',
							blockedBy ? 'cursor-not-allowed opacity-50' : ''
						]}
						aria-disabled={blockedBy || turningOn ? 'true' : undefined}
						aria-describedby={blockedBy ? `${uid}-blocked` : undefined}
						onclick={turnOn}
					>
						{#if turningOn}
							<ArrowPath
								size="18"
								class="animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
							{common.saving}
						{:else}
							{action === 'renew'
								? m.consent.renew
								: action === 'give-again'
									? m.consent.giveAgain
									: m.consent.turnOn}
						{/if}
					</button>
					<div aria-live="polite">
						{#if blockedBy}
							<p id="{uid}-blocked" class="text-sm text-surface-700-300">{blockedBy}</p>
						{/if}
					</div>
				</div>
				{#if turnOnError}
					<p class="text-sm text-error-700-300" role="alert">{turnOnError}</p>
				{/if}
			</section>
		{/if}

		{#if discoveryWithdrawable(status)}
			<div class="border-t border-surface-200-800 pt-4">
				<button
					type="button"
					class="{smallButton} preset-tonal-error"
					data-discovery-off
					bind:this={offButton}
					onclick={() => {
						offError = '';
						offLapsed = status?.state === 'lapsed';
						confirmingOff = true;
					}}
				>
					{status.state === 'lapsed' ? m.off.lapsedButton : m.off.button}
				</button>
			</div>
		{/if}
	</section>

	<CardPreviewDialog
		open={previewOpen}
		{experiences}
		unsaved={changed}
		onClose={() => (previewOpen = false)}
		onOff={() => {
			// Matching was turned off meanwhile: the page reads it again, and shows nothing of it
			previewOpen = false;
			reload();
		}}
		returnFocus={() => previewButton ?? null}
	/>

	<ConfirmDialog
		open={confirmingOff}
		title={offLapsed ? m.off.lapsedTitle : m.off.title}
		description={offLapsed ? m.off.lapsedDescription : m.off.description}
		details={m.off.details(DISCOVERY_REJOIN_DAYS)}
		confirmLabel={offLapsed ? m.off.lapsedButton : m.off.button}
		busyLabel={m.off.busy}
		busy={turningOff}
		error={offError}
		onConfirm={turnOff}
		onCancel={() => {
			confirmingOff = false;
			offError = '';
		}}
		finalFocusEl={() =>
			(offButton?.isConnected && status && discoveryWithdrawable(status) ? offButton : heading) ??
			null}
	/>
{/if}
