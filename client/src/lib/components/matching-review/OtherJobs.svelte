<!--
@component
The other jobs of the recruiter of a job waiting for a review (matching, Path 2), as the reviewer
compares them with it (GET /matching/reviews's `otherJobs`): each with its status, its one-line
summary (place, work mode, contract, pay), when it was created, whether it is proposed to
candidates now and where its review stands. A copy of the job under review (the same company and
title, or the same description) is marked, with the terms it differs in: copies that differ in one
term would tell their recruiter what candidates ask or where they live. A job that waits on the
same page links to it (`listed`), named with its title and when it was created (copies share a
title). A plain group under its heading, not a region: the page lists many jobs.
-->
<script lang="ts">
	import { ExclamationTriangle } from 'svelte-heros-v2';
	import JobStatusBadge from '#components/jobs/JobStatusBadge.svelte';
	import { jobSummaryParts } from '#services/jobPosting.ts';
	import {
		REVIEW_HISTORY_DAYS,
		REVIEW_HISTORY_JOBS,
		differsInText,
		reviewStatusText,
		scrollBehavior,
		type ReviewOtherJob
	} from '#services/matchingReviews.ts';
	import { formatDay, isoDate } from '#services/recruiter.ts';
	import { m } from './OtherJobs.messages.ts';

	let {
		jobs,
		listed,
		anchorOf,
		headingLevel = 4
	}: {
		jobs: readonly ReviewOtherJob[];
		/** The ids of the jobs waiting on the same page */
		listed: ReadonlySet<string>;
		/** The id of the heading of a job waiting on the same page (where its link leads) */
		anchorOf: (jobId: string) => string;
		headingLevel?: 3 | 4;
	} = $props();

	const uid = $props.id();
	let headingTag = $derived(`h${headingLevel}`);
	let copies = $derived(jobs.filter((job) => job.nearDuplicate).length);
</script>

<div class="space-y-3" data-other-jobs>
	<svelte:element this={headingTag} id="{uid}-heading" class="text-lg font-semibold break-words">
		{m.heading(jobs.length)}
	</svelte:element>
	<p class="text-sm text-surface-700-300">{m.scope(REVIEW_HISTORY_DAYS, REVIEW_HISTORY_JOBS)}</p>

	{#if copies > 0}
		<p
			class="flex items-start gap-2 rounded-base preset-tonal-warning p-3 text-sm"
			data-copies-warning
		>
			<ExclamationTriangle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
			<span class="min-w-0">{m.copies(copies)}</span>
		</p>
	{/if}

	{#if jobs.length === 0}
		<p class="text-sm text-surface-700-300">{m.none}</p>
	{:else}
		<ul class="space-y-2">
			{#each jobs as job (job._id)}
				{@const parts = jobSummaryParts(job.summary)}
				<li
					class="card space-y-1.5 border bg-surface-50-950 p-3 sm:p-4 {job.nearDuplicate
						? 'border-s-4 border-warning-500'
						: 'border-surface-200-800'}"
					data-other-job={job._id}
					data-near-duplicate={job.nearDuplicate ? '' : undefined}
				>
					<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
						<p class="min-w-0 flex-1 font-medium break-words">{job.title}</p>
						<JobStatusBadge status={job.status} class="shrink-0" />
					</div>
					{#if job.company}
						<p class="text-sm break-words text-surface-700-300">{job.company}</p>
					{/if}
					{#if parts.length > 0}
						<!-- Each separator stays with the part after it, as JobCard writes it -->
						<p class="flex flex-wrap gap-x-1 text-sm text-surface-800-200">
							{#each parts as part, index (index)}
								<span>
									{#if index > 0}<span class="text-surface-500" aria-hidden="true">·&nbsp;</span
										>{/if}{part}
								</span>
							{/each}
						</p>
					{/if}
					<p class="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-surface-700-300">
						{#if job.createdAt}
							<span
								><time datetime={isoDate(job.createdAt)}>{m.created(formatDay(job.createdAt))}</time
								></span
							>
						{/if}
						<span>{job.inMatching ? m.inMatching : m.notInMatching}</span>
						<span><span class="sr-only">{m.review}</span> {reviewStatusText(job.review)}</span>
					</p>
					{#if job.nearDuplicate}
						<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
							<span class="badge preset-filled-warning-500 [--badge-size:var(--text-xs)]"
								>{m.copy}</span
							>
							<span class="min-w-0 font-medium break-words" data-differs-in>
								{job.differsIn.length > 0 ? m.differsIn(differsInText(job.differsIn)) : m.sameTerms}
							</span>
						</p>
					{/if}
					{#if listed.has(job._id)}
						<a
							href="#{anchorOf(job._id)}"
							class="anchor inline-block text-sm"
							aria-label={job.createdAt
								? m.listedHereNamed(job.title, formatDay(job.createdAt))
								: m.listedHereTitled(job.title)}
							onclick={(event) => {
								// The job's heading takes the focus, and is scrolled into view in main#page
								// (smoothly, but at once under "reduce motion")
								const target = document.getElementById(anchorOf(job._id));
								if (!target) return;
								event.preventDefault();
								target.focus({ preventScroll: true });
								target.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
							}}>{m.listedHere}</a
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
