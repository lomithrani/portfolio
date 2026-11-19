<!--
@component
The admin's "Get started" tab: what the owner still has to set before they share their link, as a
checklist read from GET /me/readiness (services/candidateSetup.ts decides what each item asks):
their experiences, what they want in a job (the Perfect job tab), the steps recruiters go through,
the calendar recruiters book in, then the link itself, with a button that copies it (and the Share
tab's replies and LinkedIn text). Every item
can wait, and none blocks the others or the link.

The steps can be set here in one click: the gate journey of portfolio-common (journeyTemplate:
a note, a job, its match against the perfect job, then the meeting), whose note can be changed
first, or the meeting alone. It is saved with PUT /workflow, after asking when it replaces a
journey the owner saved (as the Hiring journey tab read it: this checklist may be older) or one
they are changing there. The page owns the readiness and reloads it (and the journey editor) once
the steps are saved; the focus then goes to the item's heading (the buttons pressed go away). A
checklist that could not be read again stays, said to be out of date, with "Try again".
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Check,
		DocumentArrowUp,
		Eye,
		ExclamationTriangle,
		InformationCircle
	} from 'svelte-heros-v2';
	import {
		DEFAULT_JOB_MATCH_MIN_SCORE,
		intlLocale,
		journeyTemplate,
		parseWorkflow,
		stepManifest,
		type JourneyTemplate,
		type WorkflowStep
	} from 'portfolio-common';
	import { portfolioApi, portfolioTextApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import {
		missingEssentials,
		portfolioLink,
		setupItems,
		setupProgress,
		type AdminTab,
		type Readiness,
		type SetupItem
	} from '#services/candidateSetup.ts';
	import { failureText, networkError } from '#services/recruiter.ts';
	import { quotaText, type ImportStatus } from '#services/resumeImport.ts';
	import { toaster } from '#services/toaster.ts';
	import { journeySummary, noteContent, savedWorkflowProblem } from '#services/workflow.ts';
	import { clientStep } from '#components/hire/steps/index.ts';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import CopyLink from '#components/share/CopyLink.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { m } from './StartTab.messages.ts';

	let {
		domainName,
		readiness,
		status,
		loadError,
		reload,
		openTab,
		journeyChanged,
		journeySaved,
		onJourneySaved
	}: {
		domainName: string;
		/** What the account has set up (GET /me/readiness); null until it was read */
		readiness: Readiness | null;
		status: 'loading' | 'ready' | 'error';
		/** Why it could not be read */
		loadError: string;
		/** Reads it again */
		reload: () => void;
		/** Shows another tab of the admin page */
		openTab: (tab: AdminTab) => void;
		/** Whether the Hiring journey tab holds changes not saved yet */
		journeyChanged: () => boolean;
		/**
		 * Whether a journey was saved, as the Hiring journey tab read it (GET /workflow); undefined
		 * while it does not know
		 */
		journeySaved: () => boolean | undefined;
		/**
		 * The steps were saved from here: the page reads the readiness and the journey again (done
		 * once the promise settles)
		 */
		onJourneySaved: () => Promise<void>;
	} = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;

	let items = $derived(readiness ? setupItems(readiness) : []);
	let progress = $derived(readiness ? setupProgress(readiness) : null);
	let link = $derived(portfolioLink(page.url.origin, domainName));

	// --- The résumé import (GET /experiences/import), offered while there is no experience ----
	let importStatus = $state.raw<ImportStatus | null>(null);
	let importAvailable = $derived(!!importStatus?.enabled && importStatus.remaining > 0);
	onMount(() => {
		let cancelled = false;
		portfolioApi.experiences.import
			.get(withCredentials)
			.then(({ data }) => {
				if (!cancelled) importStatus = data ?? null;
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	// --- The gate journey ------------------------------------------------------------------
	/** The gate's note as the owner changes it: the template's, in the owner's language */
	let note = $state<object>(journeyTemplate('gate')[0].config);
	let gateSteps = $derived.by(() => {
		const { title, text } = noteContent(note);
		return journeyTemplate('gate', { noteTitle: title, noteText: text });
	});
	let gateCheck = $derived(parseWorkflow(gateSteps));
	let noteProblem = $derived(gateCheck.ok ? undefined : gateCheck.problem);
	let editingNote = $state(false);

	/** The name of its own a step has (a note's title) */
	const ownTitle = (step: WorkflowStep) => clientStep(step.type)?.title?.(step);
	const NoteSettings = clientStep('note')?.Settings;

	/** The template asked about before it replaces the journey; null: nothing is asked */
	let confirming = $state<JourneyTemplate | null>(null);
	let saving = $state<JourneyTemplate | null>(null);
	let saveError = $state('');
	/** The steps item's heading, where the focus goes once they are saved */
	let journeyHeading: HTMLElement | undefined = $state();
	/** The dialog closes on a save: the focus goes to that heading, not to the button pressed */
	let focusJourney = false;

	const templateSteps = (name: JourneyTemplate) =>
		name === 'gate' ? gateSteps : journeyTemplate('open');

	/**
	 * Whether saving a template replaces steps the owner chose: a journey saved, as the editor read
	 * it or as the checklist says (the checklist may be older, the editor may not have read it yet:
	 * either is enough, and not knowing asks too), or changes left in the editor
	 */
	const replacesChosenSteps = () =>
		journeySaved() !== false || !!readiness?.journey.saved || journeyChanged();

	function choose(name: JourneyTemplate) {
		if (saving || (name === 'gate' && noteProblem)) return;
		saveError = '';
		focusJourney = false;
		if (replacesChosenSteps()) {
			confirming = name;
			return;
		}
		void save(name);
	}

	async function save(name: JourneyTemplate) {
		if (saving) return;
		const steps = templateSteps(name);
		saving = name;
		saveError = '';
		try {
			const { data, error } = await portfolioTextApi.workflow.put(
				{ steps: steps.map(({ id, type, config }) => ({ id, type, config })) },
				withCredentials
			);
			if (error || !data) {
				const status = errorStatus(error);
				const problem = status === 422 ? savedWorkflowProblem(error?.value, steps) : null;
				// An expired session does not sign the page out: the note typed would be lost
				saveError =
					problem?.message ??
					(status === 401
						? m.journey.sessionExpired
						: failureText(error?.value, m.journey.saveFailed));
				return;
			}
			const asked = confirming !== null;
			focusJourney = true;
			confirming = null;
			editingNote = false;
			toaster.success({
				title: m.journey.saved,
				description: journeySummary(data.steps, ownTitle)
			});
			// The buttons pressed go once the checklist is read again: the focus waits on the heading
			if (!asked) {
				await tick();
				journeyHeading?.focus();
			}
			await onJourneySaved();
		} catch {
			saveError = networkError();
		} finally {
			saving = null;
		}
	}

	// --- What each item says ---------------------------------------------------------------
	const STATE_TEXT = { done: m.state.done, toDo: m.state.toDo, unavailable: m.state.unavailable };
	const itemState = (item: SetupItem) =>
		!item.counted ? 'unavailable' : item.done ? 'done' : 'toDo';

	const TITLES: Record<SetupItem['id'], string> = {
		resume: m.resume.title,
		perfectJob: m.perfectJob.title,
		journey: m.journey.title,
		calendar: m.calendar.title
	};

	const calendarText = (readiness: Readiness, done: boolean) => {
		const { calendar } = readiness;
		if (!calendar.configured) return m.calendar.unavailable;
		// Open, but the steps never lead recruiters to the meeting
		if (done && !readiness.journey.meeting) return m.calendar.noMeeting(calendar.enabledSchedules);
		if (done) return m.calendar.done(calendar.enabledSchedules);
		if (calendar.reconnect) return m.calendar.reconnect;
		return calendar.connected ? m.calendar.schedule : m.calendar.connect;
	};

	/** The essentials not rated yet, as one list ("the work mode, where you work and the contract") */
	const essentialsList = (readiness: Readiness) =>
		new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(
			missingEssentials(readiness).map((essential) => m.perfectJob.essentials[essential])
		);

	const linkButton = 'btn btn-sm preset-tonal';
</script>

<div class="space-y-6">
	<section class="space-y-2">
		<h2 class="h3">{m.title}</h2>
		<p class="opacity-75">{m.intro}</p>
	</section>

	{#if !readiness && status === 'error'}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{loadError}</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={reload}>{common.retry}</button>
		</div>
	{:else if !readiness}
		<p class="text-sm opacity-50" role="status">{m.loading}</p>
	{:else}
		{#if loadError}
			<!-- Read again, it could not be: what shows is what was set before -->
			<div
				class="card preset-tonal-warning flex flex-wrap items-center gap-3 p-3 sm:p-4"
				role="status"
				data-readiness-stale
			>
				<p class="min-w-0 flex-1 basis-60 text-sm">{loadError}</p>
				<button type="button" class="btn btn-sm preset-tonal" onclick={reload}>
					{common.retry}
				</button>
			</div>
		{/if}
		{#if progress}
			<div class="space-y-1.5" data-progress>
				<p class="text-sm font-semibold">{m.progress(progress.done, progress.total)}</p>
				<div class="h-2 overflow-hidden rounded-full bg-surface-200-800" aria-hidden="true">
					<div
						class="h-full rounded-full bg-success-500 transition-[width] motion-reduce:transition-none"
						style:width="{progress.total ? (progress.done / progress.total) * 100 : 100}%"
					></div>
				</div>
			</div>
		{/if}

		<ol class="space-y-3" aria-label={m.list}>
			{#each items as item, index (item.id)}
				{@const state = itemState(item)}
				<li
					class="card flex items-start gap-3 border border-surface-200-800 p-4 sm:gap-4 sm:p-5"
					data-item={item.id}
					data-state={state}
				>
					<span
						class={[
							'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
							state === 'done' && 'preset-filled-success-500',
							state === 'toDo' && 'preset-filled-primary-500',
							state === 'unavailable' && 'border border-surface-300-700 text-surface-700-300'
						]}
						aria-hidden="true"
					>
						{#if state === 'done'}
							<Check size="16" />
						{:else}
							{index + 1}
						{/if}
					</span>
					<div class="min-w-0 flex-1 space-y-3">
						{#if item.id === 'journey'}
							<h3 class="font-semibold outline-none" tabindex="-1" bind:this={journeyHeading}>
								{TITLES[item.id]}
								<span class="sr-only">({STATE_TEXT[state]})</span>
							</h3>
						{:else}
							<h3 class="font-semibold">
								{TITLES[item.id]}
								<span class="sr-only">({STATE_TEXT[state]})</span>
							</h3>
						{/if}
						{#if item.id === 'resume'}
							{@render resume(readiness, item.done)}
						{:else if item.id === 'perfectJob'}
							{@render perfectJob(readiness, item.done)}
						{:else if item.id === 'journey'}
							{@render journey(
								readiness,
								items.find((other) => other.id === 'calendar')
							)}
						{:else}
							<p class="text-sm text-surface-700-300">{calendarText(readiness, item.done)}</p>
							{#if item.counted}
								<button type="button" class={linkButton} onclick={() => openTab('appointments')}>
									{m.calendar.open}
									<ArrowRight size="16" aria-hidden="true" />
								</button>
							{/if}
						{/if}
					</div>
				</li>
			{/each}
			<li
				class="card flex items-start gap-3 border border-primary-500/40 p-4 sm:gap-4 sm:p-5"
				data-item="share"
			>
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary-500 text-sm font-bold text-primary-700-300"
					aria-hidden="true"
				>
					{items.length + 1}
				</span>
				<div class="min-w-0 flex-1 space-y-3">
					<h3 class="font-semibold">{m.share.title}</h3>
					<p class="text-sm text-surface-700-300">{m.share.text}</p>
					<CopyLink {link} />
					<div class="flex flex-wrap gap-2">
						<a class={linkButton} href={resolve('/[domain]/hire', { domain: domainName })}>
							<Eye size="16" aria-hidden="true" />
							{m.share.see}
						</a>
						<button type="button" class={linkButton} onclick={() => openTab('share')}>
							{m.share.more}
							<ArrowRight size="16" aria-hidden="true" />
						</button>
					</div>
				</div>
			</li>
		</ol>
	{/if}
</div>

<ConfirmDialog
	open={confirming !== null}
	title={m.journey.replace.title}
	description={m.journey.replace.description(
		journeySummary(templateSteps(confirming ?? 'gate'), ownTitle)
	)}
	details={journeyChanged() ? m.journey.replace.unsaved : ''}
	confirmLabel={m.journey.replace.confirm}
	busyLabel={common.saving}
	busy={saving !== null}
	error={confirming ? saveError : ''}
	tone="primary"
	onConfirm={() => {
		if (confirming) void save(confirming);
	}}
	onCancel={() => {
		confirming = null;
		saveError = '';
	}}
	finalFocusEl={() => (focusJourney ? (journeyHeading ?? null) : null)}
/>

{#snippet resume(readiness: Readiness, done: boolean)}
	<p class="text-sm text-surface-700-300">
		{done ? m.resume.done(readiness.experiences) : m.resume.toDo}
	</p>
	<!-- Nothing on the portfolio yet: the résumé import (the experiences page opens it) -->
	{#if readiness.experiences === 0 && importAvailable && importStatus}
		<p class="flex items-start gap-2 text-xs text-surface-700-300">
			<InformationCircle size="16" class="shrink-0" aria-hidden="true" />
			<span>
				<Rich text={m.resume.importNotice}>
					{#snippet privacy(text)}<a class="link-text" href={resolve('/(site)/legal/privacy')}
							>{text}</a
						>{/snippet}
				</Rich>
			</span>
		</p>
		<div class="flex flex-wrap items-center gap-2">
			<a
				class="btn btn-sm preset-filled-primary-700-300"
				href={resolve('/[domain]/experiences?import=1', { domain: domainName })}
			>
				<DocumentArrowUp size="16" aria-hidden="true" />
				{m.resume.upload}
			</a>
			<a class={linkButton} href={resolve('/[domain]/experiences', { domain: domainName })}>
				{m.resume.open}
				<ArrowRight size="16" aria-hidden="true" />
			</a>
			<span class="text-xs text-surface-700-300">{quotaText(importStatus)}</span>
		</div>
	{:else}
		<a class={linkButton} href={resolve('/[domain]/experiences', { domain: domainName })}>
			{m.resume.open}
			<ArrowRight size="16" aria-hidden="true" />
		</a>
	{/if}
{/snippet}

{#snippet perfectJob(readiness: Readiness, done: boolean)}
	{@const missing = missingEssentials(readiness)}
	<p class="text-sm text-surface-700-300">
		{done ? m.perfectJob.done(readiness.perfectJob.criteria) : m.perfectJob.toDo}
	</p>
	{#if done && missing.length > 0}
		<p class="text-sm text-surface-700-300">
			{m.perfectJob.suggest(essentialsList(readiness))}
		</p>
	{/if}
	<button type="button" class={linkButton} onclick={() => openTab('perfect-job')}>
		{m.perfectJob.open}
		<ArrowRight size="16" aria-hidden="true" />
	</button>
{/snippet}

<!--
The steps: what they ask before the meeting when they lead to one (the default journey too), that
nobody books before the calendar is open, and the gate journey while it is not theirs
-->
{#snippet journey(readiness: Readiness, calendar: SetupItem | undefined)}
	{@const { saved, blocked, meeting, gate, types } = readiness.journey}
	{@const leadsToMeeting = !saved || (!blocked && meeting)}
	{@const meetingAlone = types.length === 1 && types[0] === 'meeting'}
	{@const jobFirst = types.includes('job') && types.indexOf('job') < types.indexOf('meeting')}
	<p class="text-sm text-surface-700-300">
		{#if !saved}
			{m.journey.toDo}
		{:else if blocked}
			{m.journey.blocked}
		{:else if !meeting}
			{m.journey.noMeeting}
		{:else if meetingAlone}
			{m.journey.meetingAlone}
		{:else}
			{journeySummary(types.map((type) => ({ type })))}
		{/if}
		<!-- Nobody books before the calendar is open (on a site that takes calendars at all) -->
		{#if leadsToMeeting && calendar?.counted && !calendar.done}
			{m.journey.calendarFirst}
		{/if}
		{#if leadsToMeeting && !gate}
			{!saved
				? m.journey.choose
				: meetingAlone
					? m.journey.askFirst
					: jobFirst
						? m.journey.notScored
						: m.journey.noGate}
		{/if}
	</p>

	{#if !gate}
		<div class="card preset-tonal space-y-3 p-3 sm:p-4" data-template="gate">
			<p class="font-semibold">{m.journey.gate.title}</p>
			<p class="text-sm">{m.journey.gate.text(DEFAULT_JOB_MATCH_MIN_SCORE)}</p>
			<ol class="list-decimal space-y-0.5 ps-5 text-sm" aria-label={m.journey.gate.steps}>
				{#each gateSteps as step (step.id)}
					{@const title = ownTitle(step)}
					{@const label = stepManifest(step.type)?.label ?? ''}
					<li>{title ? m.journey.gate.named(label, title) : label}</li>
				{/each}
			</ol>
			{#if readiness.perfectJob.criteria === 0}
				<p class="flex items-start gap-2 text-sm text-warning-800-200">
					<ExclamationTriangle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
					{m.journey.gate.emptyPerfectJob}
				</p>
			{/if}
			{#if NoteSettings}
				<details class="space-y-3" bind:open={editingNote}>
					<summary class="cursor-pointer text-sm font-medium underline underline-offset-2">
						{m.journey.gate.editNote}
					</summary>
					<div class="pt-3">
						<NoteSettings
							config={note}
							onChange={(config) => (note = config)}
							problem={noteProblem}
							disabled={saving !== null}
							idPrefix="{uid}-note"
						/>
					</div>
				</details>
			{/if}
			{#if noteProblem && !editingNote}
				<p class="text-sm text-error-700-300">{noteProblem.message}</p>
			{/if}
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn preset-filled-primary-700-300"
					aria-disabled={saving !== null || noteProblem ? 'true' : undefined}
					onclick={() => choose('gate')}
				>
					{saving === 'gate' ? m.journey.gate.using : m.journey.gate.use}
				</button>
				{#if !saved}
					<button
						type="button"
						class="btn preset-tonal"
						aria-disabled={saving !== null ? 'true' : undefined}
						onclick={() => choose('open')}
					>
						{saving === 'open' ? common.saving : m.journey.keepMeeting}
					</button>
				{/if}
			</div>
		</div>
	{/if}

	{#if saveError && !confirming}
		<p class="text-sm text-error-700-300" role="alert">{saveError}</p>
	{/if}
	{#if saved}
		<button type="button" class={linkButton} onclick={() => openTab('workflows')}>
			{m.journey.open}
			<ArrowRight size="16" aria-hidden="true" />
		</button>
	{/if}
{/snippet}
