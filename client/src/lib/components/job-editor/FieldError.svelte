<script lang="ts">
	import { ExclamationCircle } from 'svelte-heros-v2';
	import type { JobFormField } from '#services/jobPosting.ts';
	import { getJobEditorContext } from './context';

	let { field }: { field: JobFormField } = $props();

	const editor = getJobEditorContext();
	let message = $derived(editor.error(field));
</script>

{#if message}
	<p id={editor.errorId(field)} class="flex items-start gap-1 text-sm text-error-700-300">
		<ExclamationCircle size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
		<span>{message}</span>
	</p>
{/if}
