<script lang="ts">
	import { ExclamationCircle } from 'svelte-heros-v2';
	import { getEditorContext } from './context';

	let { field }: { field: string } = $props();

	const editor = getEditorContext();
	let message = $derived(editor.error(field));
</script>

{#if message}
	<p id={editor.errorId(field)} class="flex items-start gap-1 text-sm text-error-700-300">
		<ExclamationCircle size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
		<span>{message}</span>
	</p>
{/if}
