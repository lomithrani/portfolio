<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { portfolioApi } from '#services';
	import { clearAuthentication } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { browser } from '$app/env';
	import { m } from './CosmeticSettings.messages.ts';

	const SKELETON_THEMES = [
		'catppuccin',
		'cerberus',
		'concord',
		'crimson',
		'fennec',
		'hamlindigo',
		'legacy',
		'mint',
		'modern',
		'mona',
		'nosh',
		'nouveau',
		'pine',
		'reign',
		'rocket',
		'rose',
		'sahara',
		'seafoam',
		'terminus',
		'vintage',
		'vox',
		'wintry'
	];

	let domain = $derived(page.data.domain);
	const uid = $props.id();
	const titleHintId = `${uid}-title-hint`;

	let theme = $state(page.data.domain?.theme ?? 'wintry');
	let headerTitle = $state(page.data.domain?.headerTitle ?? '');
	let headerSubtitle = $state(page.data.domain?.headerSubtitle ?? '');
	let defaultDarkMode = $state(page.data.domain?.defaultDarkMode ?? false);
	let saving = $state(false);
	let message = $state('');

	function previewTheme(newTheme: string) {
		theme = newTheme;
		if (browser) {
			document.documentElement.dataset.theme = newTheme;
		}
	}

	// Leaving the page without saving must not keep the previewed theme applied site-wide
	onDestroy(() => {
		if (browser) {
			document.documentElement.dataset.theme = page.data.domain?.theme ?? 'wintry';
		}
	});

	async function save() {
		saving = true;
		message = '';

		const { error } = await portfolioApi.domain({ name: domain.name }).put(
			{
				theme,
				// Sent empty to clear them: the header then shows the address name, without a subtitle
				headerTitle: headerTitle.trim(),
				headerSubtitle: headerSubtitle.trim(),
				defaultDarkMode
			},
			{ fetch: { credentials: 'include' } }
		);

		saving = false;

		if (error) {
			const expired = errorStatus(error) === 401;
			if (expired) clearAuthentication();
			message = expired ? m.sessionExpired : m.saveFailed;
		} else {
			message = m.saved;
			// Refresh the layout data (header title/subtitle, theme, default dark mode)
			await invalidateAll();
		}
	}
</script>

<div class="space-y-8">
	<section class="card p-6 space-y-4">
		<h2 class="h3">{m.theme}</h2>
		<p class="opacity-75">{m.themeIntro}</p>
		<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
			{#each SKELETON_THEMES as t (t)}
				<button
					type="button"
					class="btn {theme === t ? 'preset-filled-primary-700-300' : 'preset-outlined'} text-xs"
					onclick={() => previewTheme(t)}
				>
					{t}
				</button>
			{/each}
		</div>
	</section>

	<section class="card p-6 space-y-4">
		<h2 class="h3">{m.header}</h2>
		<label class="label">
			<span>{m.title}</span>
			<input
				class="input"
				type="text"
				placeholder={domain.name}
				aria-describedby={titleHintId}
				bind:value={headerTitle}
			/>
		</label>
		<p id={titleHintId} class="-mt-3 text-xs opacity-75">{m.titleHint}</p>
		<label class="label">
			<span>{m.subtitle}</span>
			<input
				class="input"
				type="text"
				placeholder={m.subtitlePlaceholder}
				bind:value={headerSubtitle}
			/>
		</label>
	</section>

	<section class="card p-6 space-y-4">
		<h2 class="h3">{m.darkMode}</h2>
		<p class="opacity-75">{m.darkModeIntro}</p>
		<div class="flex items-center gap-3">
			<Switch
				checked={defaultDarkMode}
				onCheckedChange={(details) => (defaultDarkMode = details.checked)}
			>
				<Switch.Control>
					<Switch.Thumb />
				</Switch.Control>
				<Switch.HiddenInput />
			</Switch>
			<span>{defaultDarkMode ? m.dark : m.light}</span>
		</div>
	</section>

	<div class="flex items-center gap-4">
		<button
			type="button"
			class="btn preset-filled-primary-700-300"
			disabled={saving}
			onclick={save}
		>
			{saving ? m.saving : m.save}
		</button>
		{#if message}
			<span class="text-sm">{message}</span>
		{/if}
	</div>
</div>
