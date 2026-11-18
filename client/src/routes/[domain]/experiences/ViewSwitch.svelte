<script lang="ts">
	import { Bars3BottomLeft, ListBullet } from 'svelte-heros-v2';
	import type { ExperienceView } from '#services/timeline.ts';
	import { m } from './ViewSwitch.messages.ts';

	let {
		view = $bindable(),
		besideLink = false,
		class: classes = ''
	}: {
		view: ExperienceView;
		/**
		 * It shares its row with "Propose a role", longer than the owner's "Add": its labels step
		 * aside on every phone, not only on the narrowest
		 */
		besideLink?: boolean;
		class?: string;
	} = $props();

	const views = [
		{ value: 'list', label: m.list, icon: ListBullet },
		{ value: 'timeline', label: m.timeline, icon: Bars3BottomLeft }
	] as const;
</script>

<!-- Two toggle buttons rather than a segmented control: they read right in the server render,
	before the page's JavaScript runs (a shared link opens on the timeline) -->
<div
	role="group"
	aria-label={m.view}
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
			<!-- Icons alone where the row is short: under 448 px next to "Propose a role", under
				360 px next to the owner's "Add" (the label stays the button's name) -->
			<span class={besideLink ? 'max-[28rem]:sr-only' : 'max-[22.4rem]:sr-only'}>{label}</span>
		</button>
	{/each}
</div>
