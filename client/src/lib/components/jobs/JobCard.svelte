<!--
@component
A job posting in a list: title (a link to `href`, the whole card is clickable), company, an
optional status badge and a one-line summary: place · work mode · contract · pay. `meta` adds a
line under it (applicant count, dates...); links or buttons in it stay clickable on their own.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { jobSummaryParts, type JobPostingLike } from '#services/jobPosting.ts';
	import JobStatusBadge from './JobStatusBadge.svelte';

	let {
		job,
		href,
		showStatus = false,
		headingLevel = 3,
		meta
	}: {
		job: JobPostingLike;
		/** The posting's page (pass it through resolve()) */
		href: string;
		showStatus?: boolean;
		/** Level of the title's heading in the page */
		headingLevel?: 2 | 3 | 4;
		meta?: Snippet;
	} = $props();

	let titleTag = $derived(`h${headingLevel}`);
	let title = $derived(job.title?.trim() || 'Untitled job posting');
	let parts = $derived(jobSummaryParts(job));
</script>

<article
	class="relative card preset-outlined-surface-200-800 bg-surface-50-950 p-4 transition-colors hover:bg-surface-100-900 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary-500 sm:p-5"
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<svelte:element this={titleTag} class="text-lg font-semibold break-words">
				<!-- The link covers the card (after:), so the whole card opens the posting -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved by the caller -->
				<a
					{href}
					class="after:absolute after:inset-0 after:rounded-container after:content-[''] hover:underline focus-visible:outline-none"
				>
					{title}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</svelte:element>
			{#if job.company}
				<p class="text-sm break-words text-surface-700-300">{job.company}</p>
			{/if}
		</div>
		{#if showStatus && job.status}
			<JobStatusBadge status={job.status} class="shrink-0" />
		{/if}
	</div>
	{#if parts.length > 0}
		<!-- Each separator stays with the part after it: a wrapped line never ends with one -->
		<p class="mt-2 flex flex-wrap gap-x-1 text-sm text-surface-800-200">
			{#each parts as part, index (index)}
				<span>
					{#if index > 0}<span class="text-surface-500" aria-hidden="true">·&nbsp;</span>{/if}{part}
				</span>
			{/each}
		</p>
	{/if}
	{#if meta}
		<!-- Above the card's link: what is in it stays clickable -->
		<div class="relative z-[1] mt-2 text-sm text-surface-700-300">{@render meta()}</div>
	{/if}
</article>
