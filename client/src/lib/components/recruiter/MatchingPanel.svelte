<!--
@component
A recruiter's job description in matching (Path 2), beside it on its page: the switch that
proposes it to the candidates whose own criteria it meets (PUT /jobs/:id/matching: only an open job
that names its company and has a description; turning it off is asked first, since the interests no
mutual interest came of go), where it stands with the reviewers ("In review", "Not accepted" with
the reviewer's reason as they wrote it, "Proposed to candidates", "On hold"), whether candidates
wait for an answer once it is proposed (a read of the feed: never how many) with the way to their
anonymous cards (/recruiter/jobs/:id/candidates; none while none waits), and the job's mutual
interests (RecruiterMatches.svelte, read again once its status or the switch changed: a job filled,
closed or back to draft ends them; in review or not accepted, only when it has some). Shown only while the posting carries `matching` (MATCHING on): absent,
nothing of matching shows. What the switch was refused for is said in words, with the way to fix
it (the editor, a reload); what the page handles (signed out, the job gone, the terms, no recruiter
space) goes to it. A job not accepted says what can be done about it (an edit of what is not
locked, or a copy, Duplicate) and that turning it off frees one of the jobs a recruiter may propose
at once. A job that reads as proposed but that the API proposes to nobody (its feed's 409
JOB_NOT_PROPOSED: saved under rules made tighter since) says to save it again in the editor. The
switch stays focusable while its change is saved (read-only, never disabled: a disabled control
loses the focus).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		CheckCircle,
		Clock,
		ExclamationTriangle,
		InboxStack,
		InformationCircle,
		PauseCircle,
		UserGroup
	} from 'svelte-heros-v2';
	import { common } from '#lib/i18n/common.messages.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import RecruiterMatches from './RecruiterMatches.svelte';
	import { duplicateJobHref, type RecruiterJobDetail } from '#services/recruiter.ts';
	import {
		MATCHING_STATE_TONE,
		canProposeJob,
		candidatesWaiting,
		jobMatchingState,
		readJobMatching,
		setJobMatching,
		type CandidatesWaiting,
		type SwitchFailure
	} from '#services/recruiterMatching.ts';
	import { m as matchingTexts } from '#services/recruiterMatching.messages.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './MatchingPanel.messages.ts';

	let {
		job,
		userId,
		onChange,
		onReload,
		onSessionExpired,
		onTerms,
		onGone,
		onNoSpace
	}: {
		/** The posting as GET /recruiter/jobs/:id answered it (with `matching` while it is on) */
		job: RecruiterJobDetail;
		userId: string;
		/** The posting as the switch left it */
		onChange: (job: RecruiterJobDetail) => void;
		/** It changed meanwhile: the page reads it again */
		onReload: () => void;
		onSessionExpired: () => void;
		/** The terms in force are to accept first (422 on `consent`) */
		onTerms: () => void;
		/** Deleted meanwhile */
		onGone: () => void;
		onNoSpace: () => void;
	} = $props();

	const uid = $props.id();

	let matching = $derived(readJobMatching(job.matching));
	// Matching was turned off since the page loaded (the route's 404): nothing of it
	let off = $state(false);
	let standing = $derived(matching ? jobMatchingState(job.status, matching) : null);
	let on = $derived(!!matching?.enabledAt);
	// What the switch shows: whether the job is proposed, but for a change being asked (turning it
	// off waits for its confirmation); a refusal or a cancel puts it back
	let shownOn = $derived(on);
	let canTurnOn = $derived(canProposeJob(job.status));

	let busy = $state(false);
	let failure = $state.raw<SwitchFailure | null>(null);
	let stopping = $state(false);

	async function turn(enabled: boolean) {
		if (busy) return;
		busy = true;
		failure = null;
		const result = await setJobMatching(job._id, enabled);
		busy = false;
		if (result.ok) {
			stopping = false;
			onChange(result.job);
			// What the API answered: sent for review, or, unchanged since a reviewer decided, accepted
			// (proposed at once) or still not accepted
			const after = readJobMatching(result.job.matching);
			const state = after ? jobMatchingState(result.job.status, after) : null;
			toaster.success({
				title: !enabled
					? m.turnedOff
					: state === 'live'
						? m.turnedOnLive
						: state === 'rejected'
							? m.turnedOnRejected
							: m.turnedOn
			});
			return;
		}
		stopping = false;
		shownOn = on;
		switch (result.failure.kind) {
			case 'signed-out':
				onSessionExpired();
				return;
			case 'terms':
				onTerms();
				return;
			case 'gone':
				onGone();
				return;
			case 'no-space':
				onNoSpace();
				return;
			case 'off':
				off = true;
				return;
			default:
				failure = result.failure;
		}
	}

	function onCheckedChange(checked: boolean) {
		if (busy) return;
		shownOn = checked;
		// Turning it off drops the interests no mutual interest came of: asked first
		if (!checked) stopping = true;
		else turn(true);
	}

	// Whether candidates wait for an answer, once it is proposed: read again for another job
	let waiting = $state<CandidatesWaiting | null>(null);
	// Read as proposed, but the API proposes it to nobody: saved under rules made tighter since
	let stale = $derived(standing === 'live' && waiting === 'not-proposed');
	let title: HTMLElement | undefined = $state();
	let peeked = '';
	$effect(() => {
		const key = standing === 'live' ? job._id : '';
		if (key === peeked) return;
		peeked = key;
		waiting = null;
		if (!key) return;
		void candidatesWaiting(key).then((answer) => {
			if (peeked === key) waiting = answer;
		});
	});

	/** A button's label wraps rather than run past it on a narrow phone (in French) */
	const button = 'btn min-h-10 max-w-full whitespace-normal text-center leading-5';
</script>

{#if matching && standing && !off}
	<section
		class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4"
		aria-labelledby="{uid}-title"
		aria-busy={busy ? 'true' : undefined}
		data-matching-panel={stale ? 'stale' : standing}
	>
		<div class="space-y-1">
			<h3 bind:this={title} id="{uid}-title" tabindex="-1" class="font-semibold outline-none">
				{m.title}
			</h3>
			<p class="text-sm text-surface-700-300">{m.intro}</p>
		</div>

		<Switch
			class="flex w-full items-start gap-3"
			checked={shownOn}
			readOnly={busy}
			disabled={!on && !canTurnOn}
			onCheckedChange={(details) => onCheckedChange(details.checked)}
		>
			<Switch.Control class="mt-0.5 shrink-0">
				<Switch.Thumb />
			</Switch.Control>
			<Switch.Label class="min-w-0 flex-1 cursor-pointer space-y-0.5">
				<span class="block font-medium">{m.switchLabel}</span>
				{#if !on}
					<span class="block text-sm font-normal text-surface-700-300">
						{canTurnOn ? m.reviewFirst : m.openFirst}
					</span>
				{/if}
			</Switch.Label>
			<Switch.HiddenInput />
		</Switch>
		{#if busy}
			<p class="flex items-center gap-2 text-sm text-surface-700-300" role="status">
				<ArrowPath size="16" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				{stopping ? m.stopDialog.busy : common.saving}
			</p>
		{/if}

		{#if failure}
			<div class="card preset-tonal-error space-y-2 p-3 text-sm" role="alert">
				<p class="flex items-start gap-2">
					<ExclamationTriangle size="18" class="mt-px shrink-0" aria-hidden="true" />
					<span>{failure.message}</span>
				</p>
				{#if failure.kind === 'company' || failure.kind === 'description' || failure.kind === 'save-again'}
					<a
						href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: job._id })}
						class="btn btn-sm preset-tonal min-h-9">{m.edit}</a
					>
				{:else if failure.kind === 'changed'}
					<button type="button" class="btn btn-sm preset-tonal min-h-9" onclick={onReload}>
						{m.reload}
					</button>
				{/if}
			</div>
		{/if}

		{#if stale}
			<div class="space-y-2" data-matching-state>
				<p class="badge gap-1.5 preset-tonal-warning">
					<ExclamationTriangle size="14" aria-hidden="true" />
					{m.state.stale.badge}
				</p>
				<p class="text-sm">{m.state.stale.text}</p>
				<a
					href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: job._id })}
					class="{button} preset-tonal btn-sm">{m.edit}</a
				>
			</div>
		{:else if standing !== 'off'}
			{@const shown = m.state[standing]}
			<div class="space-y-2" data-matching-state>
				<p class="badge gap-1.5 {MATCHING_STATE_TONE[standing]}">
					{#if standing === 'live'}
						<CheckCircle size="14" aria-hidden="true" />
					{:else if standing === 'paused'}
						<PauseCircle size="14" aria-hidden="true" />
					{:else if standing === 'rejected'}
						<ExclamationTriangle size="14" aria-hidden="true" />
					{:else}
						<Clock size="14" aria-hidden="true" />
					{/if}
					{shown.badge}
				</p>
				<p class="text-sm">{shown.text}</p>
				{#if standing === 'rejected'}
					<!-- The reviewer's own words: shown as written, never as markup -->
					<blockquote
						class="border-s-4 border-error-500 ps-3 text-sm break-words whitespace-pre-line"
						data-review-reason
					>
						{matching.review?.reason ?? ''}
					</blockquote>
					<p class="text-sm">{m.state.rejected.next}</p>
					<div class="flex flex-wrap gap-2">
						<a
							href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: job._id })}
							class="{button} preset-tonal btn-sm">{m.edit}</a
						>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve()d, with a query -->
						<a
							href={duplicateJobHref(resolve('/(app)/recruiter/jobs/new'), job._id)}
							class="{button} preset-tonal btn-sm">{m.duplicate}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
					<p class="text-sm text-surface-700-300">{m.state.rejected.place}</p>
				{/if}
			</div>
		{/if}

		{#if standing === 'live' && !stale}
			<div class="space-y-2" data-candidates-waiting={waiting ?? 'unknown'}>
				{#if waiting === 'some'}
					<p class="flex items-center gap-2 text-sm font-medium">
						<!-- Neutral: candidates wait for an answer, which says nothing of their interest -->
						<InboxStack size="16" class="shrink-0" aria-hidden="true" />
						{m.candidates.some}
					</p>
				{:else if waiting === 'none'}
					<p class="text-sm text-surface-700-300">{m.candidates.none}</p>
				{/if}
				<!-- None to review now: no way to an empty deck (the page, read again, says when some
				     wait) -->
				{#if waiting !== 'none'}
					<a
						href={resolve('/(app)/recruiter/jobs/[id]/candidates', { id: job._id })}
						class={[button, waiting === 'some' ? 'preset-filled-primary-700-300' : 'preset-tonal']}
					>
						<UserGroup size="18" class="shrink-0" aria-hidden="true" />
						{m.candidates.review}
					</a>
				{/if}
			</div>
		{/if}

		{#if on}
			<p class="flex items-start gap-2 text-xs text-surface-700-300">
				<InformationCircle size="16" class="shrink-0" aria-hidden="true" />
				{matchingTexts.leaving.proposed}
			</p>
		{/if}

		<!-- A job never proposed has none; read again once its status or the switch changed (a job
		     filled, closed or back to draft ends them) -->
		{#if on || matching.review}
			{#key `${job.status}:${matching.enabledAt}`}
				<RecruiterMatches
					{userId}
					jobId={job._id}
					quietWhenEmpty={standing !== 'live' && standing !== 'paused'}
					fallbackFocus={() => title ?? null}
				/>
			{/key}
		{/if}
	</section>

	<ConfirmDialog
		open={stopping}
		title={m.stopDialog.title}
		description={m.stopDialog.description}
		confirmLabel={m.stopDialog.confirm}
		busyLabel={m.stopDialog.busy}
		{busy}
		onConfirm={() => turn(false)}
		onCancel={() => {
			if (busy) return;
			stopping = false;
			shownOn = on;
		}}
	/>
{/if}
