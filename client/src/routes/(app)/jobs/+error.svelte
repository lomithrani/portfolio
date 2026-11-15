<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowLeft, DocumentMagnifyingGlass, ExclamationTriangle } from 'svelte-heros-v2';
	import { common } from '#lib/i18n/common.messages.ts';
	import { m } from './error.messages.ts';

	// Errors of the job pages (/jobs, /jobs/[id]), inside the jobs layout (header, navigation): a
	// posting that is not published (or no longer), or the API out of reach.
	let notFound = $derived(page.status === 404);
	let title = $derived(notFound ? m.notFound.title : m.unavailable.title);
	let onListPage = $derived(page.url.pathname.replace(/\/+$/, '') === resolve('/(app)/jobs'));
</script>

<svelte:head>
	<title>{notFound ? m.notFound.pageTitle : m.unavailable.pageTitle}</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-4">
		{#if !onListPage}
			<a
				href={resolve('/(app)/jobs')}
				class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal"
			>
				<ArrowLeft size="16" aria-hidden="true" />
				{m.allJobs}
			</a>
		{/if}
		<section
			class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-6 text-center md:p-10"
			aria-labelledby="job-error-title"
		>
			<div
				class="mx-auto flex size-12 items-center justify-center rounded-full {notFound
					? 'preset-tonal-primary'
					: 'preset-tonal-error'}"
			>
				{#if notFound}
					<DocumentMagnifyingGlass size="24" aria-hidden="true" />
				{:else}
					<ExclamationTriangle size="24" aria-hidden="true" />
				{/if}
			</div>
			<h2 id="job-error-title" class="text-xl font-bold">{title}</h2>
			<p class="mx-auto max-w-md text-surface-700-300">
				{#if notFound}
					{m.notFound.text}
				{:else}
					{m.unavailable.text}
				{/if}
			</p>
			<div class="flex flex-wrap justify-center gap-3">
				{#if !notFound}
					<button
						type="button"
						class="btn preset-filled-primary-700-300 min-h-11"
						onclick={() => location.reload()}
					>
						{common.retry}
					</button>
				{/if}
				{#if notFound || !onListPage}
					<a
						href={resolve('/(app)/jobs')}
						class="btn min-h-11 {notFound ? 'preset-filled-primary-700-300' : 'preset-tonal'}"
					>
						{m.seeOpenPositions}
					</a>
				{/if}
			</div>
		</section>
	</div>
</div>
