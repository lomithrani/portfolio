<script lang="ts">
	import { ArrowPath, Photo } from 'svelte-heros-v2';
	import FieldError from './FieldError.svelte';
	import { getEditorContext } from './context';
	import { ICON_ACCEPT, ICON_SIZE, readIcon } from './icon';

	let {
		value,
		onchange
	}: {
		/** Data URL of the logo */
		value: string | undefined;
		onchange: (icon: string | undefined) => void;
	} = $props();

	const field = 'icon';
	const editor = getEditorContext();
	const buttonId = editor.fieldId(field);
	const hintId = `${buttonId}-hint`;
	const localErrorId = `${buttonId}-local-error`;

	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	let busy = $state(false);
	let localError = $state('');

	let describedby = $derived(
		[hintId, localError ? localErrorId : '', editor.error(field) ? editor.errorId(field) : '']
			.filter(Boolean)
			.join(' ')
	);

	async function useFile(file: File | undefined) {
		if (!file || busy) return;
		busy = true;
		localError = '';
		const result = await readIcon(file);
		busy = false;
		if ('icon' in result) onchange(result.icon);
		else localError = result.error;
	}

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		dragging = false;
		useFile(event.dataTransfer?.files[0]);
	};

	const onDragOver = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragging = true;
	};
</script>

<div class="space-y-2">
	<div
		role="group"
		aria-labelledby="{buttonId}-label"
		class="flex flex-wrap items-center gap-4 rounded-container border border-dashed p-4 transition-colors {dragging
			? 'border-primary-500 preset-tonal-primary'
			: 'border-surface-300-700'}"
		ondragover={onDragOver}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
	>
		<span id="{buttonId}-label" class="sr-only">Logo</span>
		<div
			class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-base bg-surface-100-900"
		>
			{#if value}
				<img src={value} alt="Current logo" class="size-full object-contain" />
			{:else}
				<Photo size="28" class="text-surface-500" aria-hidden="true" />
			{/if}
		</div>
		<div class="min-w-0 flex-1 space-y-2">
			<p class="text-sm">
				{value ? 'Drop another image here to replace it, or' : 'Drop an image here, or'}
			</p>
			<div class="flex flex-wrap gap-2">
				<button
					id={buttonId}
					type="button"
					class="btn btn-sm preset-tonal"
					aria-describedby={describedby}
					disabled={busy}
					onclick={() => fileInput?.click()}
				>
					{#if busy}
						<ArrowPath
							size="16"
							class="animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
						Processing…
					{:else}
						{value ? 'Choose another file' : 'Choose a file'}
					{/if}
				</button>
				{#if value}
					<button
						type="button"
						class="btn btn-sm hover:preset-tonal-error"
						onclick={() => {
							localError = '';
							onchange(undefined);
						}}
					>
						Remove
					</button>
				{/if}
			</div>
		</div>
	</div>
	<input
		bind:this={fileInput}
		type="file"
		accept={ICON_ACCEPT}
		class="sr-only"
		tabindex="-1"
		aria-hidden="true"
		onchange={(event) => {
			const input = event.currentTarget;
			useFile(input.files?.[0]).finally(() => (input.value = ''));
		}}
	/>
	<p id={hintId} class="text-xs text-surface-600-400">
		PNG, JPEG, WebP, SVG or ICO. Large images are resized to {ICON_SIZE} px.
	</p>
	{#if localError}
		<p id={localErrorId} class="text-sm text-error-700-300" role="alert">{localError}</p>
	{/if}
	<FieldError {field} />
</div>
