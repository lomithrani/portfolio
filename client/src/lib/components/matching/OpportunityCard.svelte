<!--
@component
A job proposed to the candidate, as their feed gives it (readOpportunity of #services/matching.ts):
the version scored, its title and company, the day it was opened (a dated job description), its
score against the candidate's own criteria with their minimum (their data: theirs to read), how it
does on each criterion (the commute included, with who the travel times come from), its facts, its
description folded, and a link to its private page (/opportunities/:id). Whether its recruiter is
interested in the candidate shows too, never who they are: nothing of the recruiter's identity
reaches a candidate before both are interested (decision 17 of the founder). The heading takes the
focus when the deck moves to this card (`headingId`, tabindex -1).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { BuildingOffice2, DocumentText, HandThumbUp } from 'svelte-heros-v2';
	import Markdown from '#components/Markdown.svelte';
	import JobFacts from '#components/jobs/JobFacts.svelte';
	import { m as jobs } from '#components/jobs/jobs.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import type { Opportunity } from '#services/matching.ts';
	import { formatDay, isoDate } from '#services/recruiter.ts';
	import CriterionOutcomes from './CriterionOutcomes.svelte';
	import { m } from './cards.messages.ts';

	let {
		opportunity,
		headingId,
		headingLevel = 2
	}: {
		opportunity: Opportunity;
		/** The heading's id: the deck moves the focus to it */
		headingId?: string;
		headingLevel?: 2 | 3;
	} = $props();

	const uid = $props.id();
	let titleId = $derived(headingId ?? `${uid}-title`);
	let titleTag = $derived(`h${headingLevel}`);
	let sectionTag = $derived(`h${headingLevel + 1}`);
	let job = $derived(opportunity.job);
	let passed = $derived(opportunity.score >= opportunity.minScore);
	let description = $derived(job.description.trim());
</script>

<article
	class="card preset-outlined-surface-200-800 space-y-5 bg-surface-50-950 p-4 sm:p-6"
	aria-labelledby={titleId}
>
	<header class="space-y-2">
		{#if opportunity.interested}
			<p class="badge preset-filled-primary-500 gap-1.5">
				<HandThumbUp size="14" aria-hidden="true" />
				{m.opportunity.interested}
			</p>
		{/if}
		<svelte:element
			this={titleTag}
			id={titleId}
			tabindex="-1"
			class="text-xl font-bold break-words outline-none focus-visible:ring-2 focus-visible:ring-primary-500 md:text-2xl"
		>
			{job.title}
		</svelte:element>
		{#if job.company}
			<p class="flex items-center gap-1.5 text-surface-700-300">
				<BuildingOffice2 size="18" class="shrink-0" aria-hidden="true" />
				<span class="min-w-0 break-words">{job.company}</span>
			</p>
		{/if}
		<p class="text-sm text-surface-700-300">
			<Rich text={m.opportunity.opened(formatDay(job.publishedAt))}>
				{#snippet time(day)}<time datetime={isoDate(job.publishedAt)}>{day}</time>{/snippet}
			</Rich>
		</p>
	</header>

	<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
		<p
			class={[
				'flex shrink-0 items-baseline gap-1 rounded-container px-4 py-2',
				passed ? 'preset-tonal-success' : 'preset-tonal-error'
			]}
		>
			<span class="sr-only">{m.opportunity.score}</span>
			<span class="text-3xl font-bold tabular-nums">{opportunity.score}</span>
			<span class="text-sm" aria-hidden="true">/ 100</span>
			<span class="sr-only">{m.opportunity.outOf100}</span>
		</p>
		<div class="min-w-0 flex-1 basis-40 space-y-0.5">
			<p class="font-semibold">{m.opportunity.scoredAgainst}</p>
			<p class="text-sm text-surface-700-300">{m.opportunity.minimum(opportunity.minScore)}</p>
		</div>
	</div>

	<section
		class="card preset-outlined-surface-200-800 bg-surface-100-900 p-4"
		aria-labelledby="{uid}-facts"
	>
		<svelte:element this={sectionTag} id="{uid}-facts" class="sr-only"
			>{jobs.keyFacts}</svelte:element
		>
		<JobFacts {job} />
	</section>

	{#if opportunity.criteria.length > 0}
		<section class="space-y-2" aria-labelledby="{uid}-criteria">
			<svelte:element this={sectionTag} id="{uid}-criteria" class="text-sm font-semibold">
				{m.opportunity.outcomes}
			</svelte:element>
			<CriterionOutcomes
				criteria={opportunity.criteria}
				audience="candidate"
				transit={opportunity.transit}
			/>
		</section>
	{/if}

	<details class="group rounded-container border border-surface-200-800">
		<summary class="cursor-pointer px-3 py-2 text-sm font-semibold select-none">
			{m.opportunity.description}
		</summary>
		<div class="border-t border-surface-200-800 px-3 py-3">
			{#if description}
				<!-- Written by a recruiter: its raw HTML shows as text -->
				<Markdown content={description} topHeadingLevel={headingLevel + 2} html={false} />
			{:else}
				<p class="text-sm text-surface-700-300">{m.opportunity.noDescription}</p>
			{/if}
		</div>
	</details>

	<a class="btn preset-tonal min-h-11" href={resolve('/(app)/opportunities/[id]', { id: job._id })}>
		<DocumentText size="18" aria-hidden="true" />
		{m.opportunity.open}
	</a>
</article>
