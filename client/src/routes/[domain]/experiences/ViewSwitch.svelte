<script lang="ts">
	import { Bars3BottomLeft, ListBullet } from 'svelte-heros-v2';
	import type { ExperienceView } from '#services/timeline.ts';

	let { view = $bindable(), class: classes = '' }: { view: ExperienceView; class?: string } =
		$props();

	const views = [
		{ value: 'list', label: 'List', icon: ListBullet },
		{ value: 'timeline', label: 'Timeline', icon: Bars3BottomLeft }
	] as const;
</script>

<!-- Two toggle buttons rather than a segmented control: they read right in the server render,
	before the page's JavaScript runs (a shared link opens on the timeline) -->
<div
	role="group"
	aria-label="View"
	class="inline-flex gap-1 rounded-base border border-surface-200-800 bg-surface-50-950 p-1 {classes}"
>
	{#each views as { value, label, icon: Icon } (value)}
		<button
			type="button"
			class="btn btn-sm min-h-9 gap-1.5 px-3 {view === value
				? 'preset-filled-primary-700-300'
				: 'hover:preset-tonal'}"
			aria-pressed={view === value}
			onclick={() => (view = value)}
		>
			<Icon size="16" aria-hidden="true" />
			{label}
		</button>
	{/each}
</div>
