<!--
@component
Asks before something that cannot be undone: deleting a job description, removing an applicant.
The page runs the request (`busy` while it does) and closes the dialog once it is done; a failure
shows as `error` in the dialog, which stays open for a retry. Focus starts on Cancel (the safe
choice); Escape and the backdrop cancel, except while the request runs.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ArrowPath, ExclamationTriangle } from 'svelte-heros-v2';

	let {
		open,
		title,
		description,
		confirmLabel,
		busyLabel = 'Deleting…',
		busy = false,
		error = '',
		onConfirm,
		onCancel,
		finalFocusEl
	}: {
		open: boolean;
		title: string;
		description: string;
		/** The destructive action: "Delete", "Remove" */
		confirmLabel: string;
		busyLabel?: string;
		/** The request runs: nothing can be clicked, the dialog cannot close */
		busy?: boolean;
		/** Why the last attempt failed */
		error?: string;
		onConfirm: () => void;
		onCancel: () => void;
		/** Where the focus goes once the dialog closes (by default, what had it when it opened) */
		finalFocusEl?: () => HTMLElement | null;
	} = $props();

	let cancelButton: HTMLButtonElement | undefined = $state();
	let alertElement: HTMLElement | undefined = $state();

	// A failure takes the focus: it is announced, and Retry is next to it
	$effect(() => {
		if (open && error) tick().then(() => alertElement?.focus());
	});
</script>

<Dialog
	{open}
	role="alertdialog"
	closeOnEscape={!busy}
	closeOnInteractOutside={!busy}
	onOpenChange={(details) => {
		if (!details.open && !busy) onCancel();
	}}
	initialFocusEl={() => cancelButton ?? null}
	{finalFocusEl}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
			<Dialog.Content
				class="w-full max-w-md space-y-4 card bg-surface-50-950 p-5 text-surface-950-50 shadow-xl sm:p-6"
				aria-busy={busy ? 'true' : undefined}
			>
				<Dialog.Title class="text-lg font-semibold break-words">{title}</Dialog.Title>
				<Dialog.Description class="text-sm text-surface-700-300">{description}</Dialog.Description>
				{#if error}
					<div
						bind:this={alertElement}
						tabindex="-1"
						role="alert"
						class="flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500"
					>
						<ExclamationTriangle
							size="18"
							class="mt-0.5 shrink-0 text-error-700-300"
							aria-hidden="true"
						/>
						<p class="font-medium">{error}</p>
					</div>
				{/if}
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						bind:this={cancelButton}
						type="button"
						class="btn preset-tonal"
						disabled={busy}
						onclick={onCancel}
					>
						Cancel
					</button>
					<!-- Kept focusable while busy (aria-disabled): disabling it would drop the focus -->
					<button
						type="button"
						class="btn preset-filled-error-700-300"
						aria-disabled={busy ? 'true' : undefined}
						onclick={() => {
							if (!busy) onConfirm();
						}}
					>
						{#if busy}
							<ArrowPath
								size="18"
								class="animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
							{busyLabel}
						{:else}
							{error ? 'Try again' : confirmLabel}
						{/if}
					</button>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
