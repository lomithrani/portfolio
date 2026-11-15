<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { DocumentMagnifyingGlass, ExclamationTriangle } from 'svelte-heros-v2';
	import { common } from '#lib/i18n/common.messages.ts';
	import { m } from './error.messages.ts';

	// Errors of the site's own pages (landing, legal pages, account), inside their layout (header,
	// navigation, legal footer)
	let notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? m.pageTitle.notFound : m.pageTitle.error} | Portfolio</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl">
		<section
			class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-6 text-center md:p-10"
			aria-labelledby="site-error-title"
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
			<h2 id="site-error-title" class="text-xl font-bold">
				{notFound ? m.heading.notFound : m.heading.error}
			</h2>
			<p class="mx-auto max-w-md text-surface-700-300">
				{notFound ? m.text.notFound : m.text.error}
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
				<a
					href={resolve('/(site)')}
					class="btn min-h-11 {notFound ? 'preset-filled-primary-700-300' : 'preset-tonal'}"
				>
					{m.home}
				</a>
			</div>
		</section>
	</div>
</div>
