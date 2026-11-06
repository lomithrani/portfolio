<!--
@component
The experience editor: one dialog for the page, to add an experience, or edit or delete one.

It owns its Skeleton Dialog, the unsaved-changes guard, the delete confirmation, the API calls
(POST, PUT, DELETE /experiences) and the drafts kept in this browser. The page owns `open`, the
toasts, `invalidateAll()` and what happens to the list after a save or a delete.

- `experience` set: edit mode (a populated experience from the domain); null: add mode.
- `initialForm` (add mode only, ignored with `experience`): a prefilled form to start from
  instead of an empty one, e.g. an experience read from a résumé (build it with the helpers of
  `#services/experienceForm.ts`, from `emptyExperienceForm()` / `emptyProject()`). It is the
  baseline of the unsaved-changes check, so it is not stored as the add draft, and closing it
  untouched asks nothing, until the user edits it; from then on it is the add draft of
  `draftKey` (a stored add draft is replaced, and never restored over a prefilled form).
  It is copied when the dialog opens: pass another object to start over with a new form.
- Drafts: `experienceDraft:<draftKey>:new` while adding, `experienceDraft:<draftKey>:<id>` while
  editing; restored on reopen, removed after a save, a delete or a discard.
-->
<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { FormData } from '#services/experienceForm.ts';
	import EditorForm from './EditorForm.svelte';

	let {
		open,
		experience = null,
		initialForm = null,
		draftKey,
		knownSkills,
		onClose,
		onSaved,
		onDeleted
	}: {
		/** Controlled by the page */
		open: boolean;
		/** The (populated) experience to edit; null or undefined to add one */
		experience?: ExperienceModel | null;
		/**
		 * Add mode: a prefilled form to start from (e.g. from a résumé) instead of an empty one.
		 * Not stored as the add draft until the user edits it. Ignored in edit mode.
		 */
		initialForm?: FormData | null;
		/** Scopes the drafts kept in this browser, e.g. `${userId}:${domainName}` */
		draftKey: string;
		/** Display names already used in this portfolio: suggestions, and the spelling to reuse */
		knownSkills: { hard: string[]; soft: string[] };
		/** Called once the editor may close (unsaved changes already confirmed) */
		onClose: () => void;
		onSaved: (saved: ExperienceModel, mode: 'created' | 'updated') => void;
		onDeleted: (id: string) => void;
	} = $props();

	let editor: ReturnType<typeof EditorForm> | undefined = $state();
	// Another experience, or another prefilled form, starts a new editor
	let editorKey: string | FormData = $derived(
		experience ? String(experience._id) : (initialForm ?? 'new')
	);

	// On a large screen, adding starts in the Title field; elsewhere (and on phones, where it
	// would open the keyboard over the form) the first control (Close) gets focus
	const initialFocus = () => {
		if (experience || !window.matchMedia('(min-width: 640px)').matches) return null;
		return document.querySelector<HTMLElement>('[data-experience-editor] [data-initial-focus]');
	};
</script>

<Dialog
	{open}
	onOpenChange={(details) => {
		if (details.open) return;
		if (editor) editor.requestClose();
		else onClose();
	}}
	initialFocusEl={initialFocus}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-4">
			<Dialog.Content
				class="flex h-full w-full flex-col overflow-hidden bg-surface-50-950 text-surface-950-50 shadow-xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-container sm:border sm:border-surface-200-800"
				data-experience-editor
			>
				{#if open}
					{#key editorKey}
						<EditorForm
							bind:this={editor}
							{experience}
							{initialForm}
							{draftKey}
							{knownSkills}
							{onClose}
							{onSaved}
							{onDeleted}
						/>
					{/key}
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
