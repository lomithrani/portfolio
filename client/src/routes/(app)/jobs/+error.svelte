<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowLeft, DocumentMagnifyingGlass, ExclamationTriangle } from 'svelte-heros-v2';

	// Errors of the job pages (/jobs, /jobs/[id]), inside the jobs layout (header, navigation): a
	// posting that is not published (or no longer), or the API out of reach.
	let notFound = $derived(page.status === 404);
	let title = $derived(
		notFound ? 'Job posting not found' : 'The job board is temporarily unavailable'
	);
	let onListPage = $derived(page.url.pathname.replace(/\/+$/, '') === resolve('/(app)/jobs'));
</script>

<svelte:head>
	<title>{notFound ? 'Not found' : 'Unavailable'} | Jobs</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-4">
		{#if !onListPage}
			<a
				href={resolve('/(app)/jobs')}
				class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal"
			>
				<ArrowLeft size="16" aria-hidden="true" />
				All jobs
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
					This job description may have been removed by its recruiter, or the link is wrong.
				{:else}
					The server could not be reached, or it failed. Try again in a moment.
				{/if}
			</p>
			<div class="flex flex-wrap justify-center gap-3">
				{#if !notFound}
					<button
						type="button"
						class="btn preset-filled-primary-500 min-h-11"
						onclick={() => location.reload()}
					>
						Try again
					</button>
				{/if}
				{#if notFound || !onListPage}
					<a
						href={resolve('/(app)/jobs')}
						class="btn min-h-11 {notFound ? 'preset-filled-primary-500' : 'preset-tonal'}"
					>
						See the open positions
					</a>
				{/if}
			</div>
		</section>
	</div>
</div>
