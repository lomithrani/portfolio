<script lang="ts">
	import { resolve } from '$app/paths';
	import { Briefcase } from 'svelte-heros-v2';
	import JobCard from '#components/jobs/JobCard.svelte';
	import { PUBLIC_JOBS_LIMIT, openPositionsText, publishedText } from '#services/applications.ts';
	import type { PageProps } from './$types';

	// The open job postings (GET /jobs, rendered on the server), most recently updated first. Each
	// card opens the posting's page, where candidates apply with their portfolio.
	let { data }: PageProps = $props();

	let jobs = $derived(data.jobs);
	let countText = $derived(openPositionsText(jobs.length));

	const DESCRIPTION =
		'Open job descriptions in France, with pay, contract and working time up front. Apply with your portfolio.';
</script>

<svelte:head>
	<title>Open positions | Jobs</title>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Open positions" />
	<meta property="og:description" content={DESCRIPTION} />
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-6">
		<header class="space-y-1">
			<h2 class="text-2xl font-bold md:text-3xl">Open positions</h2>
			{#if jobs.length > 0}
				<p class="text-surface-700-300">
					{countText}, most recently updated first.
					{#if jobs.length >= PUBLIC_JOBS_LIMIT}
						Showing the {PUBLIC_JOBS_LIMIT} most recent.
					{/if}
				</p>
			{/if}
		</header>

		{#if jobs.length > 0}
			<ul class="space-y-3" aria-label={countText}>
				{#each jobs as job (job._id)}
					{@const published = publishedText(job)}
					<li>
						<JobCard {job} href={resolve('/(app)/jobs/[id]', { id: job._id })}>
							{#snippet meta()}
								{#if published}<span>{published}</span>{/if}
							{/snippet}
						</JobCard>
					</li>
				{/each}
			</ul>
		{:else}
			<section
				class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-6 text-center md:p-10"
				aria-labelledby="no-jobs-title"
			>
				<div
					class="mx-auto flex size-12 items-center justify-center rounded-full preset-tonal-primary"
				>
					<Briefcase size="24" aria-hidden="true" />
				</div>
				<h3 id="no-jobs-title" class="text-xl font-bold">No open positions right now</h3>
				<p class="mx-auto max-w-md text-surface-700-300">
					Check back soon: new job descriptions show here as soon as they are published.
				</p>
				<p class="text-sm text-surface-700-300">
					Hiring?
					<a href={resolve('/(app)/recruiter')} class="anchor font-medium"
						>Publish a job description</a
					>
					from the recruiter space.
				</p>
			</section>
		{/if}
	</div>
</div>
