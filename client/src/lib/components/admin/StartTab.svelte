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
journey the owner saved or one they are changing in the Hiring journey tab. The page owns the
readiness and reloads it (and the journey editor) once the steps are saved.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowRight, Check, Eye, ExclamationTriangle } from 'svelte-heros-v2';
	import {
		DEFAULT_JOB_MATCH_MIN_SCORE,
		journeyTemplate,
		parseWorkflow,
		stepManifest,
		type JourneyTemplate,
		type WorkflowStep
	} from 'portfolio-common';
	import { portfolioTextApi } from '#services';
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
	import { toaster } from '#services/toaster.ts';
	import { journeySummary, noteContent, savedWorkflowProblem } from '#services/workflow.ts';
	import { clientStep } from '#components/hire/steps/index.ts';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import CopyLink from '#components/share/CopyLink.svelte';
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
		/** The steps were saved from here: the page reads the readiness and the journey again */
		onJourneySaved: () => void;
	} = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;

	let items = $derived(readiness ? setupItems(readiness) : []);
	let progress = $derived(readiness ? setupProgress(readiness) : null);
	let link = $derived(portfolioLink(page.url.origin, domainName));

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

	const templateSteps = (name: JourneyTemplate) =>
		name === 'gate' ? gateSteps : journeyTemplate('open');

	function choose(name: JourneyTemplate) {
		if (saving || (name === 'gate' && noteProblem)) return;
		saveError = '';
		if (readiness?.journey.saved || journeyChanged()) {
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
			confirming = null;
			editingNote = false;
			toaster.success({
				title: m.journey.saved,
				description: journeySummary(data.steps, ownTitle)
			});
			onJourneySaved();
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
		if (done) return m.calendar.done(calendar.enabledSchedules);
		if (calendar.reconnect) return m.calendar.reconnect;
		return calendar.connected ? m.calendar.schedule : m.calendar.connect;
	};

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
						<h3 class="font-semibold">
							{TITLES[item.id]}
							<span class="sr-only">({STATE_TEXT[state]})</span>
						</h3>
						{#if item.id === 'resume'}
							{@render resume(item.done)}
						{:else if item.id === 'perfectJob'}
							{@render perfectJob(readiness, item.done)}
						{:else if item.id === 'journey'}
							{@render journey(readiness)}
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
/>

{#snippet resume(done: boolean)}
	<p class="text-sm text-surface-700-300">
		{done ? m.resume.done(readiness?.experiences ?? 0) : m.resume.toDo}
	</p>
	<a class={linkButton} href={resolve('/[domain]/experiences', { domain: domainName })}>
		{m.resume.open}
		<ArrowRight size="16" aria-hidden="true" />
	</a>
{/snippet}

{#snippet perfectJob(readiness: Readiness, done: boolean)}
	{@const missing = missingEssentials(readiness)}
	<p class="text-sm text-surface-700-300">
		{done ? m.perfectJob.done(readiness.perfectJob.criteria) : m.perfectJob.toDo}
	</p>
	{#if done && missing.length > 0}
		<p class="text-sm text-surface-700-300">
			{m.perfectJob.suggest(missing.map((essential) => m.perfectJob.essentials[essential]))}
		</p>
	{/if}
	<button type="button" class={linkButton} onclick={() => openTab('perfect-job')}>
		{m.perfectJob.open}
		<ArrowRight size="16" aria-hidden="true" />
	</button>
{/snippet}

{#snippet journey(readiness: Readiness)}
	{@const { saved, blocked, meeting, gate, types } = readiness.journey}
	{#if !saved}
		<p class="text-sm text-surface-700-300">{m.journey.toDo}</p>
	{:else if blocked}
		<p class="text-sm text-surface-700-300">{m.journey.blocked}</p>
	{:else if !meeting}
		<p class="text-sm text-surface-700-300">{m.journey.noMeeting}</p>
	{:else}
		<p class="text-sm text-surface-700-300">
			{journeySummary(types.map((type) => ({ type })))}
			{#if !gate}{m.journey.noGate}{/if}
		</p>
	{/if}

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
