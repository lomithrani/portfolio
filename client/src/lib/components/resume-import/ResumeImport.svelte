<!--
@component
The résumé import: one dialog in three steps. Upload a PDF (checked here first: PDF, 4 MB), wait
while the API has Claude read it (POST /experiences/import, up to ~3 minutes), then review the
drafts it found and add the ticked ones through POST /experiences, one by one.

The review is kept in this browser under `storageKey` (a paid extraction survives a reload) until
every draft is added or the owner discards it; reopening the dialog resumes it. The page owns
`open`, the quota (`status`), the editor (Edit closes this dialog and opens the editor with the
draft as its `initialForm` and `editorDraftKey(draft id)` as its draft key; the page calls
`markAdded` once the editor saved it, and reopens this dialog on the review), the toasts and
`invalidateAll()`. Changes the editor kept without saving them (an expired session, a reload) are
taken into the review when it is loaded or the dialog opens.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Dialog, Portal, Progress } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		CheckCircle,
		DocumentArrowUp,
		DocumentText,
		ExclamationTriangle,
		LockClosed,
		XMark
	} from 'svelte-heros-v2';
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import { portfolioApi } from '#services';
	import { clearAuthentication } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { formToExperienceRequest, type FormData } from '#services/experienceForm.ts';
	import { clearDraft, draftStorageKey, loadDraft } from '#components/experience-editor/drafts.ts';
	import {
		IMPORT_CLIENT_TIMEOUT_MS,
		allDraftsAdded,
		applyEditedDrafts,
		base64OfDataUrl,
		clearImportReview,
		draftProblems,
		draftsToAdd,
		existingExperienceKeys,
		failedDraftsText,
		formatElapsed,
		formatFileSize,
		formatResetDate,
		hasPdfHeader,
		importErrorMessage,
		isDuplicateDraft,
		loadImportReview,
		problemsText,
		quotaText,
		resumeFileProblem,
		reviewFromResult,
		saveErrorMessage,
		saveErrorNeedsEdit,
		saveImportReview,
		untickDuplicates,
		type ImportQuota,
		type ImportReview,
		type ImportStatus
	} from '#services/resumeImport.ts';
	import DraftCard from './DraftCard.svelte';

	let {
		open,
		status,
		storageKey,
		existing,
		knownSkills,
		onReviewChange,
		onClose,
		onEditDraft,
		onAdded,
		onQuota,
		refreshStatus,
		editorDraftKey,
		finalFocusEl
	}: {
		/** Controlled by the page */
		open: boolean;
		/** GET /experiences/import: on/off and the allowance left; null while unknown */
		status: ImportStatus | null;
		/** Where the review is kept in this browser, per user and domain (importStorageKey) */
		storageKey: string;
		/** The portfolio's experiences: drafts with the same title and company are flagged */
		existing: ExperienceModel[];
		/** Display names already used in this portfolio: the spelling drafts reuse */
		knownSkills: { hard: string[]; soft: string[] };
		/** Whether a review is kept (the page then offers to continue it) */
		onReviewChange?: (hasReview: boolean) => void;
		/** Called once the dialog may close */
		onClose: () => void;
		/** Edit: the page swaps this dialog for the editor, with this form (a plain copy) as its initialForm */
		onEditDraft: (draftId: string, form: FormData) => void;
		/** Drafts were added (their new ids); `done`: the import is over and the dialog closes */
		onAdded: (ids: string[], done: boolean) => void;
		/** The allowance left after an import */
		onQuota: (quota: ImportQuota) => void;
		/** Asks the API for the allowance again (after a failure: it may have counted) */
		refreshStatus: () => void;
		/** The editor's draft key while it adds a draft of this review (one per draft) */
		editorDraftKey: (draftId: string) => string;
		/** Where the focus goes once the dialog closes (by default, what had it when it opened) */
		finalFocusEl?: () => HTMLElement | null;
	} = $props();

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const NETWORK_ERROR =
		'Could not reach the server. Check your connection and try again. If the import had started, it may still count toward your imports.';
	const TIMED_OUT =
		'The import took too long and was stopped. It may still count toward your imports: try again later, or with a shorter résumé.';
	const STOPPED =
		'Import stopped. If Claude had already started reading your résumé, it still counts toward your imports.';
	const SAVE_SESSION_EXPIRED =
		'Your session expired. Sign in again: your drafts are kept, and you can add the rest then.';
	const NETWORK_SAVE_ERROR = 'Could not reach the server. Check your connection.';

	const uid = $props.id();

	// --- Review (kept in this browser) ---------------------------------------------------

	let review = $state<ImportReview | null>(null);
	let existingKeys = $derived(existingExperienceKeys(existing));

	/** Stores the review now (the effect below stores it too, but only while this is mounted) */
	const persist = (key: string) => {
		if (review) saveImportReview(key, $state.snapshot(review) as ImportReview);
	};

	const editorStorageKey = (draftId: string) => draftStorageKey(editorDraftKey(draftId));

	/** Takes in the changes the editor kept without saving them, then forgets its copy */
	function takeEditedDrafts() {
		if (!review) return;
		const changed = applyEditedDrafts(review, (draftId) => loadDraft(editorStorageKey(draftId)));
		if (changed.length === 0) return;
		persist(storageKey);
		for (const draftId of changed) clearDraft(editorStorageKey(draftId));
		announcement =
			changed.length === 1
				? 'Your unsaved changes to a draft are kept in it.'
				: `Your unsaved changes to ${changed.length} drafts are kept in them.`;
	}

	$effect(() => {
		const key = storageKey;
		untrack(() => {
			review = key ? (loadImportReview(key) ?? null) : null;
			if (!review) return;
			// One added just before the page went away may not be recorded as added
			untickDuplicates(review, existingKeys);
			takeEditedDrafts();
		});
	});
	// Back from the editor (or reopened after a reload): what it kept is in the review
	$effect(() => {
		if (open) untrack(takeEditedDrafts);
	});
	$effect(() => {
		onReviewChange?.(review !== null);
	});
	// Every change of the review (a tick, an added draft) is stored at once
	$effect(() => {
		if (review) saveImportReview(storageKey, $state.snapshot(review) as ImportReview);
	});

	let skillSpellings = $derived([...knownSkills.hard, ...knownSkills.soft]);
	let toAdd = $derived(review ? draftsToAdd(review) : []);
	let notAdded = $derived(review ? review.drafts.filter((draft) => draft.status !== 'added') : []);

	// --- Steps ---------------------------------------------------------------------------

	let reading = $state(false);
	let step: 'upload' | 'reading' | 'review' = $derived(
		reading ? 'reading' : review ? 'review' : 'upload'
	);

	let file = $state.raw<File | null>(null);
	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	// The file or the import failed: shown in the upload step
	let uploadError = $state('');
	// After a stop, or a résumé without experiences
	let notice = $state<{ text: string; details?: string[] } | null>(null);
	let elapsed = $state(0);
	// The import was refused for the allowance (429): its message says when the next one is possible
	let quotaRefused = $state(false);
	let confirming: 'stop' | 'discard' | null = $state(null);
	let saving: { done: number; total: number } | null = $state(null);
	// What the last "Add" left to do: failures (`toEdit` of them refused for their content), or a
	// stop (expired session...)
	let saveOutcome: { added: number; failed: number; toEdit: number; stopped?: string } | null =
		$state(null);
	let announcement = $state('');

	let alertElement: HTMLElement | undefined = $state();
	let reviewHeading: HTMLElement | undefined = $state();
	let confirmButton: HTMLButtonElement | undefined = $state();
	let chooseButton: HTMLButtonElement | undefined = $state();

	let remaining = $derived(status?.enabled ? status.remaining : 0);
	let canImport = $derived(!!status?.enabled && remaining > 0);
	let resetText = $derived(formatResetDate(status?.resetsAt));

	// --- Upload --------------------------------------------------------------------------

	let controller: AbortController | null = null;
	// The elapsed time shown while reading, and the browser's own deadline
	let ticker: ReturnType<typeof setInterval> | undefined;
	let deadline: ReturnType<typeof setTimeout> | undefined;
	const clearTimers = () => {
		clearInterval(ticker);
		clearTimeout(deadline);
	};
	// Leaving the page stops a running import
	$effect(() => () => {
		controller?.abort();
		clearTimers();
	});

	async function focusAlert() {
		await tick();
		alertElement?.focus();
	}

	/** Focuses a footer button by its data-footer key, once the footer has been updated */
	async function focusFooter(key: string) {
		await tick();
		document.querySelector<HTMLElement>(`[data-resume-import] [data-footer="${key}"]`)?.focus();
	}

	const focusIsLost = () =>
		!document.activeElement ||
		document.activeElement === document.body ||
		!document.activeElement.isConnected;

	function chooseFile(picked: File | undefined) {
		if (!picked || reading) return;
		notice = null;
		quotaRefused = false;
		uploadError = resumeFileProblem(picked) ?? '';
		// "Choose a PDF" is replaced by "Choose another file": the focus moves to it
		const refocus = focusIsLost() || document.activeElement === chooseButton;
		file = uploadError ? null : picked;
		if (uploadError) focusAlert();
		else {
			announcement = `${picked.name} selected.`;
			if (refocus) tick().then(() => chooseButton?.focus());
		}
	}

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		dragging = false;
		chooseFile(event.dataTransfer?.files[0]);
	};

	const onDragOver = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragging = true;
	};

	const readAsBase64 = (picked: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(base64OfDataUrl(String(reader.result)));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(picked);
		});

	async function startImport() {
		const picked = file;
		if (!picked || reading || !canImport) return;
		uploadError = '';
		quotaRefused = false;
		notice = null;
		saveOutcome = null;

		let pdf: string;
		try {
			// The API checks it too: this answers at once, and costs no import
			if (!hasPdfHeader(new Uint8Array(await picked.slice(0, 5).arrayBuffer()))) {
				uploadError = 'This file is not a PDF, whatever its name. Choose a PDF résumé.';
				file = null;
				return focusAlert();
			}
			pdf = await readAsBase64(picked);
		} catch {
			uploadError = 'This file could not be read. Choose it again.';
			file = null;
			return focusAlert();
		}

		const current = new AbortController();
		controller = current;
		let timedOut = false;
		reading = true;
		elapsed = 0;
		announcement = 'Reading your résumé. This can take up to 3 minutes.';
		// "Import résumé" is gone: the focus moves to what replaces it
		focusFooter('cancel-import');
		const startedAt = Date.now();
		ticker = setInterval(() => (elapsed = (Date.now() - startedAt) / 1000), 1000);
		deadline = setTimeout(() => {
			timedOut = true;
			current.abort();
		}, IMPORT_CLIENT_TIMEOUT_MS);

		let failure = '';
		try {
			const { data, error } = await portfolioApi.experiences.import.post(
				{ file: pdf, fileName: picked.name },
				{ fetch: { credentials: 'include', signal: current.signal } }
			);
			// Stopped meanwhile: stopImport() has taken over
			if (controller !== current) return;
			if (error || !data) {
				const code = errorStatus(error);
				if (code === 401) clearAuthentication();
				quotaRefused = !timedOut && code === 429;
				failure = timedOut ? TIMED_OUT : importErrorMessage(code, error?.value);
			} else {
				onQuota(data.quota);
				const next = reviewFromResult(data, {
					fileName: picked.name,
					existing: existingKeys,
					knownSkills: skillSpellings
				});
				file = null;
				if (next.drafts.length === 0) {
					notice = {
						text: `No experiences were found in ${picked.name}. Check that it is your résumé, or try another PDF.`,
						details: data.warnings.filter((warning) => !/^No experiences were found/.test(warning))
					};
				} else {
					saveImportReview(storageKey, next);
					review = next;
					announcement = `${next.drafts.length} ${next.drafts.length === 1 ? 'experience' : 'experiences'} found. Review them, then add the ones you want.`;
				}
			}
		} catch {
			if (controller !== current) return;
			failure = timedOut ? TIMED_OUT : NETWORK_ERROR;
		}

		controller = null;
		clearTimers();
		reading = false;
		confirming = null;
		if (failure) {
			uploadError = failure;
			// It may have counted: show the allowance the API now sees
			refreshStatus();
			await focusAlert();
		} else if (notice) {
			await focusAlert();
		} else {
			await tick();
			reviewHeading?.focus();
		}
	}

	async function stopImport() {
		const current = controller;
		controller = null;
		current?.abort();
		clearTimers();
		reading = false;
		confirming = null;
		notice = { text: STOPPED };
		refreshStatus();
		await focusAlert();
	}

	// --- Review --------------------------------------------------------------------------

	function select(draftId: string, selected: boolean) {
		const draft = review?.drafts.find((candidate) => candidate.id === draftId);
		if (draft) draft.selected = selected;
	}

	function selectAll(selected: boolean) {
		for (const draft of notAdded) draft.selected = selected;
	}

	// The draft whose Edit opened the editor: its Edit button gets the focus back on return
	let returnToDraft: string | null = null;

	function editDraft(draftId: string) {
		const draft = review?.drafts.find((candidate) => candidate.id === draftId);
		if (!draft) return;
		returnToDraft = draft.id;
		onEditDraft(draft.id, $state.snapshot(draft.form) as FormData);
	}

	/** Back from the editor: its draft's Edit button (gone once added: the dialog decides) */
	const initialFocus = () => {
		const draftId = returnToDraft;
		returnToDraft = null;
		if (!draftId) return null;
		return document.querySelector<HTMLElement>(
			`[data-import-draft="${draftId}"] [data-edit-draft]`
		);
	};

	/** The import is over (every draft added, or discarded): the review and the editor's copies go */
	function finish(key = storageKey) {
		for (const draft of review?.drafts ?? []) clearDraft(editorStorageKey(draft.id));
		clearImportReview(key);
		review = null;
		saveOutcome = null;
		confirming = null;
	}

	/**
	 * The editor added this draft (after an Edit). Returns true when it was the last one: the
	 * import is over, and the page closes the dialog.
	 */
	export function markAdded(draftId: string): boolean {
		const draft = review?.drafts.find((candidate) => candidate.id === draftId);
		if (!review || !draft) return false;
		draft.status = 'added';
		draft.selected = false;
		delete draft.error;
		announcement = `${draft.form.title} added.`;
		if (allDraftsAdded(review)) {
			finish();
			return true;
		}
		return false;
	}

	async function addSelected() {
		if (!review || saving || toAdd.length === 0) return;
		// Kept: the loop goes on if the page goes away (a reload, or Back, is held while it runs)
		const key = storageKey;
		const queue = toAdd.map((draft) => draft.id);
		saving = { done: 0, total: queue.length };
		saveOutcome = null;
		const addedIds: string[] = [];
		let failed = 0;
		let toEdit = 0;
		let stopped = '';

		for (const id of queue) {
			const draft = review?.drafts.find((candidate) => candidate.id === id);
			if (!draft) continue;
			const form = $state.snapshot(draft.form) as FormData;
			const problems = draftProblems({ ...draft, form });
			if (problems.length > 0) {
				// The editor shows these in place: Edit, then save
				draft.status = 'failed';
				draft.error = problemsText(problems);
				failed++;
				toEdit++;
			} else {
				try {
					const { data, error } = await portfolioApi.experiences.post(
						formToExperienceRequest(form),
						withCredentials
					);
					if (error || !data) {
						const code = errorStatus(error);
						if (code === 401) {
							clearAuthentication();
							stopped = SAVE_SESSION_EXPIRED;
						} else if (code === 403) {
							stopped = 'Only the owner of this portfolio can add experiences to it.';
						} else if (code === 404) {
							stopped = 'Claim a portfolio before adding experiences.';
						} else {
							draft.status = 'failed';
							draft.error = saveErrorMessage(code, error?.value, form);
							failed++;
							if (saveErrorNeedsEdit(code)) toEdit++;
						}
					} else {
						draft.status = 'added';
						draft.selected = false;
						delete draft.error;
						addedIds.push(String((data as { _id: unknown })._id));
					}
				} catch {
					draft.status = 'failed';
					draft.error = NETWORK_SAVE_ERROR;
					failed++;
				}
			}
			// Recorded at once: adding the same draft twice would publish it twice
			persist(key);
			if (stopped) break;
			saving.done++;
		}

		saving = null;
		const done = !stopped && failed === 0;
		if (done) finish(key);
		else {
			saveOutcome = { added: addedIds.length, failed, toEdit, ...(stopped ? { stopped } : {}) };
			announcement = '';
		}
		if (addedIds.length > 0) onAdded(addedIds, done);
		else if (done) onClose();
		if (!done) await focusAlert();
	}

	/** Whether drafts are being added or a résumé read: leaving the page now would lose track */
	export function isBusy(): boolean {
		return reading || !!saving;
	}

	// What had focus when a confirmation opened, to return there (by its data-footer key when the
	// footer button it was has been re-rendered)
	let returnFocus: Element | null = null;
	let returnFooterKey: string | undefined;

	async function openConfirm(kind: 'stop' | 'discard') {
		returnFocus = document.activeElement;
		returnFooterKey = (returnFocus as HTMLElement | null)?.dataset?.footer;
		confirming = kind;
		await tick();
		confirmButton?.focus();
	}

	/** "Keep waiting", "Keep drafts" or Escape: back to what had focus, or the button now in place */
	async function cancelConfirm() {
		const fallback = confirming === 'stop' ? 'cancel-import' : 'discard';
		confirming = null;
		await tick();
		if (
			returnFocus instanceof HTMLElement &&
			returnFocus.isConnected &&
			returnFocus !== document.body
		) {
			returnFocus.focus();
		} else {
			await focusFooter(returnFooterKey ?? fallback);
		}
	}

	/** Escape, the backdrop and the close buttons: a running import asks first */
	function requestClose() {
		if (saving) return;
		if (confirming) {
			cancelConfirm();
			return;
		}
		if (reading) {
			openConfirm('stop');
			return;
		}
		// A file picked but not sent, an error or a notice: gone next time
		file = null;
		uploadError = '';
		quotaRefused = false;
		notice = null;
		saveOutcome = null;
		onClose();
	}

	let description = $derived(
		step === 'upload'
			? 'Turn a PDF résumé into experience drafts you review before adding them.'
			: step === 'reading'
				? (file?.name ?? 'Your résumé')
				: `${review?.drafts.length ?? 0} ${review?.drafts.length === 1 ? 'experience' : 'experiences'} found in ${review?.fileName || 'your résumé'}. Tick the ones to add.`
	);
	let selectedCount = $derived(toAdd.length);
	let addLabel = $derived(
		selectedCount === 0
			? 'Add experiences'
			: `Add ${selectedCount} ${selectedCount === 1 ? 'experience' : 'experiences'}`
	);
</script>

<Dialog
	{open}
	onOpenChange={(details) => {
		if (!details.open) requestClose();
	}}
	initialFocusEl={initialFocus}
	{finalFocusEl}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-4">
			<Dialog.Content
				class="flex h-full w-full flex-col overflow-hidden bg-surface-50-950 text-surface-950-50 shadow-xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-container sm:border sm:border-surface-200-800"
				data-resume-import
			>
				{#if open}
					<!-- Header -->
					<div
						class="flex items-start gap-3 border-b border-surface-200-800 px-4 py-3 sm:px-6 sm:py-4"
					>
						<div class="min-w-0 flex-1">
							<Dialog.Title>
								{#snippet element(attributes)}
									<h2 {...attributes} class="text-lg font-semibold sm:text-xl">
										Import from résumé
									</h2>
								{/snippet}
							</Dialog.Title>
							<Dialog.Description>
								{#snippet element(attributes)}
									<p {...attributes} class="text-sm text-surface-700-300 wrap-anywhere">
										{description}
									</p>
								{/snippet}
							</Dialog.Description>
						</div>
						<button
							type="button"
							class="btn-icon size-10 shrink-0 hover:preset-tonal"
							aria-label="Close"
							disabled={!!saving}
							onclick={requestClose}
						>
							<XMark size="20" aria-hidden="true" />
						</button>
					</div>

					<!-- Body -->
					<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
						{#if step === 'upload'}
							<div class="space-y-5 px-4 py-5 sm:px-6">
								{#if uploadError}
									<div
										bind:this={alertElement}
										tabindex="-1"
										class="flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500"
										role="alert"
									>
										<ExclamationTriangle
											size="18"
											class="mt-0.5 shrink-0 text-error-700-300"
											aria-hidden="true"
										/>
										<p class="font-medium">{uploadError}</p>
									</div>
								{:else if notice}
									<div
										bind:this={alertElement}
										tabindex="-1"
										class="space-y-1 rounded-base preset-tonal-warning p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-warning-500"
										role="status"
									>
										<p class="font-medium">{notice.text}</p>
										{#if notice.details?.length}
											<ul class="list-disc ps-5">
												{#each notice.details as detail, index (index)}
													<li>{detail}</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/if}

								<div
									role="group"
									aria-labelledby="{uid}-drop-label"
									class="flex flex-col items-center gap-3 rounded-container border-2 border-dashed px-4 py-8 text-center transition-colors sm:py-10 {dragging
										? 'border-primary-500 preset-tonal-primary'
										: 'border-surface-300-700'}"
									ondragover={onDragOver}
									ondragleave={() => (dragging = false)}
									ondrop={onDrop}
								>
									{#if file}
										<div
											class="flex size-12 items-center justify-center rounded-full preset-tonal-primary"
										>
											<DocumentText size="24" aria-hidden="true" />
										</div>
										<p id="{uid}-drop-label" class="max-w-full space-y-0.5">
											<span class="block font-semibold wrap-anywhere">{file.name}</span>
											<span class="block text-sm text-surface-700-300">
												PDF · {formatFileSize(file.size)}
											</span>
										</p>
										<div class="flex flex-wrap justify-center gap-2">
											<button
												bind:this={chooseButton}
												type="button"
												class="btn btn-sm preset-tonal min-h-10"
												onclick={() => fileInput?.click()}
											>
												Choose another file
											</button>
											<button
												type="button"
												class="btn btn-sm min-h-10 hover:preset-tonal-error"
												onclick={() => {
													file = null;
													announcement = 'File removed.';
													tick().then(() => chooseButton?.focus());
												}}
											>
												Remove
											</button>
										</div>
									{:else}
										<div
											class="flex size-12 items-center justify-center rounded-full preset-tonal-primary"
										>
											<DocumentArrowUp size="24" aria-hidden="true" />
										</div>
										<p id="{uid}-drop-label" class="space-y-0.5">
											<span class="block font-semibold">
												<span class="pointer-coarse:hidden">Drop your résumé here</span>
												<span class="pointer-fine:hidden">Choose your résumé</span>
											</span>
											<span class="block text-sm text-surface-700-300">PDF, up to 4 MB</span>
										</p>
										<button
											bind:this={chooseButton}
											type="button"
											class="btn preset-filled-primary-700-300 min-h-10"
											disabled={!canImport}
											onclick={() => fileInput?.click()}
										>
											Choose a PDF
										</button>
									{/if}
								</div>
								<input
									bind:this={fileInput}
									type="file"
									accept="application/pdf,.pdf"
									class="sr-only"
									tabindex="-1"
									aria-hidden="true"
									onchange={(event) => {
										chooseFile(event.currentTarget.files?.[0]);
										// The same file can be picked again after an error
										event.currentTarget.value = '';
									}}
								/>

								{#if status?.enabled}
									{#if remaining > 0}
										<p class="text-sm text-surface-700-300">
											<span class="font-semibold">{quotaText(status)}</span>.
										</p>
									{:else}
										<p class="rounded-base preset-tonal-warning p-3 text-sm">
											<span class="font-semibold">You have no imports left for now.</span>
											<!-- After a 429, its message above says when (once is enough) -->
											{#if resetText && !quotaRefused}
												You can import again from {resetText}.
											{/if}
										</p>
									{/if}
								{:else if status}
									<p class="rounded-base preset-tonal-warning p-3 text-sm">
										Résumé import is not available right now.
									</p>
								{/if}

								<div class="flex items-start gap-3 rounded-base preset-tonal p-3 text-sm sm:p-4">
									<LockClosed size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
									<p class="text-surface-800-200">
										Your PDF is sent to Anthropic’s Claude, which reads it to draft your
										experiences. This portfolio does not store the file, and nothing is published
										until you review the drafts and add them.
									</p>
								</div>
							</div>
						{:else if step === 'reading'}
							<div
								class="flex flex-col items-center gap-4 px-4 py-12 text-center sm:px-10 sm:py-16"
								aria-busy="true"
							>
								<div
									class="flex size-14 items-center justify-center rounded-full preset-tonal-primary"
								>
									<DocumentText size="28" class="motion-safe:animate-pulse" aria-hidden="true" />
								</div>
								<div class="space-y-1">
									<p class="text-lg font-semibold">Reading your résumé…</p>
									<p class="text-sm text-surface-700-300">
										Claude is finding your experiences, projects and skills.
									</p>
								</div>
								<Progress value={null} class="w-full max-w-sm">
									<Progress.Label class="sr-only">Reading your résumé</Progress.Label>
									<Progress.Track>
										<Progress.Range class="bg-primary-500 motion-reduce:animate-none" />
									</Progress.Track>
								</Progress>
								<p class="text-sm text-surface-700-300">
									<span class="font-semibold tabular-nums">{formatElapsed(elapsed)}</span>
									elapsed · this can take up to 3 minutes
								</p>
								<p class="max-w-sm text-xs text-surface-700-300">
									Keep this window open. Stopping now may still count toward your imports.
								</p>
							</div>
						{:else if review}
							<div class="space-y-4 px-4 py-5 sm:px-6">
								<h3 bind:this={reviewHeading} tabindex="-1" class="sr-only">
									Review the experiences found
								</h3>

								{#if saveOutcome}
									{#if saveOutcome.added > 0}
										<p
											class="flex items-start gap-2 rounded-base preset-tonal-success p-3 text-sm text-surface-950-50"
										>
											<CheckCircle
												size="18"
												class="mt-0.5 shrink-0 text-success-700-300"
												aria-hidden="true"
											/>
											<span>
												{saveOutcome.added}
												{saveOutcome.added === 1 ? 'experience was' : 'experiences were'} added.
											</span>
										</p>
									{/if}
									<div
										bind:this={alertElement}
										tabindex="-1"
										class="space-y-1 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500"
										role="alert"
									>
										{#if saveOutcome.stopped}
											<p class="font-semibold">{saveOutcome.stopped}</p>
										{/if}
										{#if saveOutcome.failed > 0}
											<p class="font-semibold">
												{failedDraftsText(saveOutcome.failed, saveOutcome.toEdit)}
											</p>
										{/if}
									</div>
								{/if}

								{#if review.warnings.length > 0}
									<div
										class="space-y-1 rounded-base preset-tonal-warning p-3 text-sm"
										aria-labelledby="{uid}-warnings"
										role="group"
									>
										<p id="{uid}-warnings" class="flex items-center gap-1.5 font-semibold">
											<ExclamationTriangle size="16" class="shrink-0" aria-hidden="true" />
											Check before adding
										</p>
										<ul class="list-disc space-y-0.5 ps-5">
											{#each review.warnings as warning, index (index)}
												<li>{warning}</li>
											{/each}
										</ul>
									</div>
								{/if}

								{#if notAdded.length > 0}
									<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
										<p class="text-sm text-surface-700-300" role="status">
											{selectedCount} of {notAdded.length} selected
										</p>
										<div class="flex gap-1">
											<button
												type="button"
												class="btn btn-sm min-h-9 hover:preset-tonal"
												disabled={!!saving || selectedCount === notAdded.length}
												onclick={() => selectAll(true)}
											>
												Select all
											</button>
											<button
												type="button"
												class="btn btn-sm min-h-9 hover:preset-tonal"
												disabled={!!saving || selectedCount === 0}
												onclick={() => selectAll(false)}
											>
												Select none
											</button>
										</div>
									</div>
								{/if}

								<ul class="space-y-3" aria-label="Experiences found">
									{#each review.drafts as draft (draft.id)}
										<li>
											<DraftCard
												{draft}
												duplicate={draft.status !== 'added' &&
													isDuplicateDraft(draft.form, existingKeys)}
												problems={draft.status === 'added' ? [] : draftProblems(draft)}
												disabled={!!saving}
												onselect={(selected) => select(draft.id, selected)}
												onedit={() => editDraft(draft.id)}
											/>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
						<p class="sr-only" aria-live="polite">{announcement}</p>
					</div>

					<!-- Footer -->
					<div
						class="border-t border-surface-200-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
					>
						{#if confirming}
							<div
								class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
								role="group"
								aria-labelledby="{uid}-confirm"
							>
								<p id="{uid}-confirm" class="me-auto min-w-0 font-medium">
									{#if confirming === 'stop'}
										Stop the import? It may still count toward your imports.
									{:else}
										Discard these drafts? Importing the résumé again counts as a new import.
									{/if}
								</p>
								<div class="flex gap-2">
									<button
										bind:this={confirmButton}
										type="button"
										class="btn preset-tonal"
										onclick={cancelConfirm}
									>
										{confirming === 'stop' ? 'Keep waiting' : 'Keep drafts'}
									</button>
									<button
										type="button"
										class="btn preset-filled-error-500"
										onclick={() => {
											if (confirming === 'stop') stopImport();
											else {
												finish();
												announcement = 'Import discarded.';
												onClose();
											}
										}}
									>
										{confirming === 'stop' ? 'Stop import' : 'Discard'}
									</button>
								</div>
							</div>
						{:else if step === 'upload'}
							<div class="flex flex-wrap items-center justify-end gap-2">
								<button type="button" class="btn preset-tonal" onclick={requestClose}>
									Cancel
								</button>
								<button
									type="button"
									class="btn preset-filled-primary-700-300"
									data-footer="import"
									disabled={!file || !canImport}
									onclick={startImport}
								>
									Import résumé
								</button>
							</div>
						{:else if step === 'reading'}
							<div class="flex flex-wrap items-center justify-end gap-2">
								<button
									type="button"
									class="btn preset-tonal"
									data-footer="cancel-import"
									onclick={() => openConfirm('stop')}
								>
									Cancel import
								</button>
							</div>
						{:else}
							<div class="flex flex-wrap items-center justify-end gap-2">
								{#if saving}
									<div class="me-auto flex min-w-40 flex-1 flex-col gap-1.5" role="status">
										<span class="flex items-center gap-1.5 text-sm font-medium">
											<ArrowPath
												size="16"
												class="animate-spin motion-reduce:animate-none"
												aria-hidden="true"
											/>
											Adding {Math.min(saving.done + 1, saving.total)} of {saving.total}…
										</span>
										<Progress value={saving.done} max={saving.total} class="max-w-60">
											<Progress.Track>
												<Progress.Range class="bg-primary-500" />
											</Progress.Track>
										</Progress>
									</div>
								{:else}
									<!-- As the editor's "Discard draft": red is for what cannot be undone (Delete) -->
									<button
										type="button"
										class="btn me-auto px-2 underline hover:preset-tonal"
										data-footer="discard"
										onclick={() => openConfirm('discard')}
									>
										<span class="sm:hidden">Discard</span>
										<span class="max-sm:hidden">Discard import</span>
									</button>
								{/if}
								{#if !saving}
									<button type="button" class="btn preset-tonal" onclick={requestClose}>
										Close
									</button>
								{/if}
								<!-- Kept focusable while adding (aria-disabled): disabling it would drop the focus -->
								<button
									type="button"
									class="btn preset-filled-primary-700-300"
									data-footer="add"
									disabled={!saving && selectedCount === 0}
									aria-disabled={saving ? 'true' : undefined}
									onclick={addSelected}
								>
									{#if saving}
										<ArrowPath
											size="18"
											class="animate-spin motion-reduce:animate-none"
											aria-hidden="true"
										/>
										Adding…
									{:else}
										{addLabel}
									{/if}
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
