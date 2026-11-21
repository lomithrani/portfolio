<!--
@component
A job description waiting for a reviewer of matching (Path 2), on the reviewers' page: the posting
as candidates would read it (JobDetails), when it was sent for review, who is behind it (the domain
of its recruiter's email address and a key standing for them: never their name or address), their
other jobs (OtherJobs: copies of it flagged, with the terms they differ in), and the decision. The
page runs the decision: `onApprove` (it asks first), `onReject` with the reason, checked here as
the API checks it, which answers the failure this form says next to its button (the reason
refused, the session expired, or to try again: what was typed stays) or null. Its title takes the
focus when the page moves it there (`headingId`), and `notice` says under it why a decision on it
was refused (it changed since it was read: here it is as it is now). One job of many on the page:
its controls are named with its title, and only its posting is a named region (an article).
-->
<script lang="ts">
	import { CheckCircle, ExclamationTriangle, NoSymbol } from 'svelte-heros-v2';
	import { MATCHING_LIMITS, parseReviewReason } from 'portfolio-common';
	import JobDetails from '#components/jobs/JobDetails.svelte';
	import { formatMoment } from '#services/matching.ts';
	import type { ReviewFailure, ReviewedJob } from '#services/matchingReviews.ts';
	import { formatDay, isoDate } from '#services/recruiter.ts';
	import OtherJobs from './OtherJobs.svelte';
	import { m } from './JobReview.messages.ts';

	let {
		entry,
		headingId,
		listed,
		anchorOf,
		busy = false,
		notice = '',
		onApprove,
		onReject
	}: {
		entry: ReviewedJob;
		/** The id of the job's title (the page moves the focus there) */
		headingId: string;
		/** The ids of the jobs waiting on the same page */
		listed: ReadonlySet<string>;
		/** The id of the heading of a job waiting on the same page */
		anchorOf: (jobId: string) => string;
		/** A decision on this job is on its way (the approval's, from the page's dialog) */
		busy?: boolean;
		/** Why a decision on it was refused, said under its title until its next decision */
		notice?: string;
		/** Approve: the page asks first */
		onApprove: (trigger: HTMLElement) => void;
		/** Reject with `reason`: the failure this form says, or null (done, or said by the page) */
		onReject: (reason: string) => Promise<ReviewFailure | null>;
	} = $props();

	const uid = $props.id();
	let reason = $state('');
	let reasonError = $state('');
	let formError = $state('');
	let rejecting = $state(false);
	let reasonField: HTMLTextAreaElement | undefined = $state();
	let working = $derived(busy || rejecting);
	let title = $derived(entry.job.title);

	async function reject(event: SubmitEvent) {
		event.preventDefault();
		if (working) return;
		formError = '';
		const parsed = parseReviewReason('reject', reason);
		if (!parsed.ok) {
			reasonError = parsed.message;
			reasonField?.focus();
			return;
		}
		reasonError = '';
		rejecting = true;
		const failure = await onReject(reason);
		rejecting = false;
		if (!failure) return;
		if (failure.kind === 'reason') {
			reasonError = failure.message;
			reasonField?.focus();
		} else {
			formError = failure.message;
		}
	}

	const buttonClass = 'btn min-h-11 max-w-full whitespace-normal';
</script>

<!-- A plain box: the posting inside is the job's one named region (JobDetails' article) -->
<div
	class="card preset-outlined-surface-200-800 space-y-6 bg-surface-50-950 p-4 sm:p-6"
	aria-busy={working ? 'true' : undefined}
	data-review={entry.job._id}
>
	<JobDetails job={entry.job} headingLevel={3} {headingId} regions={false}>
		{#snippet meta()}
			{#if notice}
				<!-- Under the title the page focuses: why the decision was refused (also said in the
				     page's live region) -->
				<p
					class="mb-2 flex items-start gap-2 rounded-base preset-tonal-warning p-3 text-sm text-surface-950-50"
					data-review-notice
				>
					<ExclamationTriangle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
					<span class="min-w-0">{notice}</span>
				</p>
			{/if}
			<div class="space-y-0.5">
				{#if entry.requestedAt}
					<p data-waiting-since>
						<time datetime={isoDate(entry.requestedAt)}
							>{m.waitingSince(formatMoment(new Date(entry.requestedAt)))}</time
						>
					</p>
				{/if}
				{#if entry.matchingSince}
					<p>
						<time datetime={isoDate(entry.matchingSince)}
							>{m.askedSince(formatDay(entry.matchingSince))}</time
						>
					</p>
				{/if}
				{#if entry.reviewedBefore}
					<p>{m.reviewedBefore(formatDay(entry.reviewedBefore))}</p>
				{/if}
			</div>
		{/snippet}
	</JobDetails>

	<div class="space-y-2" data-review-recruiter>
		<h4 class="text-lg font-semibold">{m.recruiter.heading}</h4>
		<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
			<dt class="font-medium text-surface-700-300">{m.recruiter.emailDomain}</dt>
			<dd class="min-w-0 break-words" data-email-domain>
				{entry.recruiter.emailDomain ?? m.recruiter.noEmail}
			</dd>
			<dt class="font-medium text-surface-700-300">{m.recruiter.key}</dt>
			<dd class="min-w-0">
				<code class="code break-all" data-recruiter-key>{entry.recruiter.key}</code>
				<span class="block text-surface-700-300">{m.recruiter.keyHint}</span>
			</dd>
		</dl>
	</div>

	<OtherJobs jobs={entry.otherJobs} {listed} {anchorOf} />

	<div class="space-y-4 border-t border-surface-200-800 pt-5" data-review-decision>
		<div class="space-y-1">
			<h4 class="text-lg font-semibold">{m.decision.heading}</h4>
			<p class="text-sm text-surface-700-300">{m.decision.text}</p>
			{#if entry.job.status !== 'open'}
				<p class="text-sm font-medium" data-review-on-hold>{m.decision.onHold}</p>
			{/if}
		</div>
		<button
			type="button"
			class="{buttonClass} preset-filled-primary-700-300"
			aria-label={m.decision.approveNamed(title)}
			aria-disabled={working ? 'true' : undefined}
			onclick={(event) => {
				if (!working) onApprove(event.currentTarget);
			}}
		>
			<CheckCircle size="18" aria-hidden="true" />
			{m.decision.approve}
		</button>

		<form class="space-y-2" novalidate onsubmit={reject}>
			<label for="{uid}-reason" class="block text-sm font-medium">{m.decision.reason}</label>
			<textarea
				id="{uid}-reason"
				bind:this={reasonField}
				bind:value={reason}
				class="textarea min-h-24 w-full"
				rows="3"
				maxlength={MATCHING_LIMITS.reviewReason}
				aria-label={m.decision.reasonNamed(title)}
				aria-required="true"
				aria-invalid={reasonError ? 'true' : undefined}
				aria-describedby="{uid}-reason-hint{reasonError ? ` ${uid}-reason-error` : ''}"
				readonly={working}
				oninput={() => (reasonError = '')}></textarea>
			<div class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-surface-700-300">
				<p id="{uid}-reason-hint">{m.decision.reasonHint(MATCHING_LIMITS.reviewReason)}</p>
				<p aria-hidden="true">{reason.length}/{MATCHING_LIMITS.reviewReason}</p>
			</div>
			{#if reasonError}
				<p id="{uid}-reason-error" class="text-sm text-error-700-300" data-reason-error>
					{reasonError}
				</p>
			{/if}
			<!-- aria-disabled rather than disabled while a decision is on its way: the button keeps
			     the focus, and the result (a refusal, Try again) is said next to it -->
			<button
				type="submit"
				class="{buttonClass} preset-tonal-error"
				aria-label={rejecting ? undefined : m.decision.rejectNamed(title)}
				aria-disabled={working ? 'true' : undefined}
			>
				<NoSymbol size="18" aria-hidden="true" />
				{rejecting ? m.decision.rejecting : m.decision.reject}
			</button>
			{#if formError}
				<p class="text-sm text-error-700-300" role="alert">{formError}</p>
			{/if}
		</form>
	</div>
</div>
