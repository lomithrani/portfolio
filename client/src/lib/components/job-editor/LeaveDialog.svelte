<!--
@component
Asks before leaving the job editor with unsaved changes (a link, Back, Cancel). The changes stay
in this browser as a draft either way, unless the recruiter discards them. Escape and the
backdrop mean "Keep editing".
-->
<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';

	let {
		open,
		onStay,
		onLeave,
		onDiscard
	}: {
		open: boolean;
		/** Keep editing (also Escape and the backdrop) */
		onStay: () => void;
		/** Leave, keeping the draft in this browser */
		onLeave: () => void;
		/** Drop the changes, then leave */
		onDiscard: () => void;
	} = $props();

	const stayButton = () => document.querySelector<HTMLElement>('[data-leave-dialog] [data-stay]');
</script>

<Dialog
	{open}
	role="alertdialog"
	onOpenChange={(details) => {
		if (!details.open) onStay();
	}}
	initialFocusEl={stayButton}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
			<Dialog.Content
				class="w-full max-w-md space-y-4 card bg-surface-50-950 p-5 text-surface-950-50 shadow-xl sm:p-6"
				data-leave-dialog
			>
				<Dialog.Title class="text-lg font-semibold">Leave without saving?</Dialog.Title>
				<Dialog.Description class="text-sm text-surface-700-300">
					Your changes are not saved yet. They stay in this browser as a draft, and come back when
					you return to this page.
				</Dialog.Description>
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						class="btn text-error-700-300 hover:preset-tonal-error sm:me-auto"
						onclick={onDiscard}
					>
						Discard changes
					</button>
					<button type="button" class="btn preset-tonal" onclick={onLeave}>Leave</button>
					<button
						type="button"
						class="btn preset-filled-primary-700-300"
						data-stay
						onclick={onStay}
					>
						Keep editing
					</button>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
