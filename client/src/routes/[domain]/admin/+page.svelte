<script lang="ts">
	import { page } from '$app/stores';
	import { portfolioApi } from '$services';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { browser } from '$app/environment';

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

	let domain = $derived($page.data.domain);

	let theme = $state($page.data.domain?.theme ?? 'wintry');
	let headerTitle = $state($page.data.domain?.headerTitle ?? '');
	let headerSubtitle = $state($page.data.domain?.headerSubtitle ?? '');
	let defaultDarkMode = $state($page.data.domain?.defaultDarkMode ?? false);
	let saving = $state(false);
	let message = $state('');

	function previewTheme(newTheme: string) {
		theme = newTheme;
		if (browser) {
			document.documentElement.dataset.theme = newTheme;
		}
	}

	async function save() {
		saving = true;
		message = '';

		const { error } = await portfolioApi.domain({ name: domain.name }).put(
			{
				theme,
				headerTitle: headerTitle || undefined,
				headerSubtitle: headerSubtitle || undefined,
				defaultDarkMode
			},
			{ fetch: { credentials: 'include' } }
		);

		saving = false;

		if (error) {
			message = 'Failed to save settings.';
		} else {
			message = 'Settings saved!';
		}
	}
</script>

<svelte:head>
	<title>Admin Settings</title>
	<meta name="description" content="Admin settings" />
</svelte:head>

<div class="p-8 max-w-2xl mx-auto space-y-8">
	<h1 class="h1">Admin Settings</h1>

	<section class="card p-6 space-y-4">
		<h2 class="h3">Theme</h2>
		<p class="opacity-75">Select a Skeleton theme for your portfolio. Changes preview instantly.</p>
		<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
			{#each SKELETON_THEMES as t (t)}
				<button
					type="button"
					class="btn {theme === t ? 'preset-filled-primary-500' : 'preset-outlined'} text-xs"
					onclick={() => previewTheme(t)}
				>
					{t}
				</button>
			{/each}
		</div>
	</section>

	<section class="card p-6 space-y-4">
		<h2 class="h3">Header</h2>
		<label class="label">
			<span>Title</span>
			<input
				class="input"
				type="text"
				placeholder="e.g. John Doe"
				bind:value={headerTitle}
			/>
		</label>
		<label class="label">
			<span>Subtitle</span>
			<input
				class="input"
				type="text"
				placeholder="e.g. Full Stack Developer & Problem Solver"
				bind:value={headerSubtitle}
			/>
		</label>
	</section>

	<section class="card p-6 space-y-4">
		<h2 class="h3">Default Dark Mode</h2>
		<p class="opacity-75">Set the default dark mode preference for first-time visitors.</p>
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
			<span>{defaultDarkMode ? 'Dark' : 'Light'}</span>
		</div>
	</section>

	<div class="flex items-center gap-4">
		<button type="button" class="btn preset-filled-primary-500" disabled={saving} onclick={save}>
			{saving ? 'Saving...' : 'Save Settings'}
		</button>
		{#if message}
			<span class="text-sm">{message}</span>
		{/if}
	</div>
</div>
