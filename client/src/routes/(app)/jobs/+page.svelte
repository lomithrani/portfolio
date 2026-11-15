<script lang="ts">
	import { resolve } from '$app/paths';
	import { Briefcase } from 'svelte-heros-v2';
	import Rich from '#lib/i18n/Rich.svelte';
	import JobCard from '#components/jobs/JobCard.svelte';
	import { PUBLIC_JOBS_LIMIT, openPositionsText, publishedText } from '#services/applications.ts';
	import type { PageProps } from './$types';
	import { m } from './page.messages.ts';

	// The open job postings (GET /jobs, rendered on the server), most recently published first. Each
	// card opens the posting's page, where candidates apply with their portfolio.
	let { data }: PageProps = $props();

	let jobs = $derived(data.jobs);
	let countText = $derived(openPositionsText(jobs.length));
</script>

<svelte:head>
	<title>{m.pageTitle}</title>
	<meta name="description" content={m.description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={m.title} />
	<meta property="og:description" content={m.description} />
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-6">
		<header class="space-y-1">
			<h2 class="text-2xl font-bold md:text-3xl">{m.title}</h2>
			{#if jobs.length > 0}
				<p class="text-surface-700-300">
					{m.listed(countText)}
					{#if jobs.length >= PUBLIC_JOBS_LIMIT}
						{m.limited(PUBLIC_JOBS_LIMIT)}
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
				<h3 id="no-jobs-title" class="text-xl font-bold">{m.empty.title}</h3>
				<p class="mx-auto max-w-md text-surface-700-300">{m.empty.text}</p>
				<p class="text-sm text-surface-700-300">
					<Rich text={m.empty.hiring}>
						{#snippet publish(text)}
							<a
								href={resolve('/(app)/recruiter')}
								class="font-medium text-primary-700-300 underline underline-offset-2 hover:decoration-2"
								>{text}</a
							>
						{/snippet}
					</Rich>
				</p>
			</section>
		{/if}
	</div>
</div>
