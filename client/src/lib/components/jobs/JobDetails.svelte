<!--
@component
A job posting as candidates and its recruiter read it: status, title, company, the facts
(JobFacts) and the Markdown description. Used by the recruiter's job page and the public job
page: it has no controls of its own. Pass them as snippets: `actions` (next to the title: Apply,
Edit...), `meta` (under the company: dates, applicant count...) and `children` (after the
description: applicants...).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { BuildingOffice2 } from 'svelte-heros-v2';
	import Markdown from '#components/Markdown.svelte';
	import type { JobPostingLike } from '#services/jobPosting.ts';
	import JobFacts from './JobFacts.svelte';
	import JobStatusBadge from './JobStatusBadge.svelte';

	let {
		job,
		showStatus = true,
		headingLevel = 2,
		actions,
		meta,
		children
	}: {
		job: JobPostingLike;
		/** Show the status badge (the public page may leave it out for open postings) */
		showStatus?: boolean;
		/** Level of the title's heading; the sections below rank under it */
		headingLevel?: 1 | 2 | 3;
		/** Controls next to the title (they wrap under it on small screens) */
		actions?: Snippet;
		/** Under the company: dates, applicant count... */
		meta?: Snippet;
		/** After the description */
		children?: Snippet;
	} = $props();

	const uid = $props.id();
	let titleTag = $derived(`h${headingLevel}`);
	let sectionTag = $derived(`h${headingLevel + 1}`);
	let title = $derived(job.title?.trim() || 'Untitled job posting');
	let description = $derived(job.description?.trim() ?? '');
</script>

<article class="space-y-6" aria-labelledby="{uid}-title">
	<header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
		<div class="min-w-0 flex-1 space-y-2">
			{#if showStatus && job.status}
				<JobStatusBadge status={job.status} />
			{/if}
			<svelte:element
				this={titleTag}
				id="{uid}-title"
				class="text-2xl font-bold break-words md:text-3xl"
			>
				{title}
			</svelte:element>
			{#if job.company}
				<p class="flex items-center gap-1.5 text-surface-700-300">
					<BuildingOffice2 size="18" class="shrink-0" aria-hidden="true" />
					<span class="min-w-0 break-words">{job.company}</span>
				</p>
			{/if}
			{#if meta}
				<div class="text-sm text-surface-700-300">{@render meta()}</div>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap gap-2 max-sm:w-full">{@render actions()}</div>
		{/if}
	</header>

	<section
		class="card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6"
		aria-labelledby="{uid}-facts"
	>
		<svelte:element this={sectionTag} id="{uid}-facts" class="sr-only">Key facts</svelte:element>
		<JobFacts {job} />
	</section>

	<section class="space-y-3" aria-labelledby="{uid}-about">
		<svelte:element this={sectionTag} id="{uid}-about" class="text-lg font-semibold">
			About the job
		</svelte:element>
		{#if description}
			<Markdown content={description} headingOffset={headingLevel + 1} />
		{:else}
			<p class="text-surface-700-300">No description yet.</p>
		{/if}
	</section>

	{@render children?.()}
</article>
