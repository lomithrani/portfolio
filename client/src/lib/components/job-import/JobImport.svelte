<!--
@component
The job description import: one dialog in two steps. Upload a PDF (checked here first: PDF, not
empty, 4 MB), then wait while the API has Claude read it (POST /jobs/import, up to ~3 minutes:
the elapsed time shows, Stop asks first since a started import still counts). The draft it
answers with is kept in this browser (saveImportedDraft) and `onImported` runs: the page opens
the job editor on it (/recruiter/jobs/new?import=1). Nothing is saved on the server.

The page owns `open`, the allowance (`status`, GET /jobs/import: the dialog is only offered when
it says `enabled`), the toasts and the navigation. After a failure the dialog asks the page to
refresh the allowance (`refreshStatus`): a failed import may have counted. An import kept in this
browser but not saved as a posting yet (`pendingImport`) is replaced by a new one: the upload step
says so, with a link back to it.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Dialog, Portal, Progress } from '@skeletonlabs/skeleton-svelte';
	import {
		DocumentArrowUp,
		DocumentText,
		ExclamationTriangle,
		InformationCircle,
		LockClosed,
		PencilSquare,
		XMark
	} from 'svelte-heros-v2';
	import { resolve } from '$app/paths';
	import { portfolioApi } from '#services';
	import { clearAuthentication } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { loadImportedDraft, saveImportedDraft } from '#services/jobDrafts.ts';
	import type { JobPostingLike } from '#services/jobPosting.ts';
	import {
		JOB_IMPORT_CLIENT_TIMEOUT_MS,
		JOB_IMPORT_NETWORK_ERROR,
		JOB_IMPORT_STOPPED,
		JOB_IMPORT_TIMED_OUT,
		base64OfDataUrl,
		formatElapsed,
		formatFileSize,
		hasPdfHeader,
		importCostText,
		isAllowanceRefusal,
		jobFileProblem,
		jobImportAllowanceText,
		jobImportAvailability,
		jobImportErrorMessage,
		jobImportQuotaText,
		type JobImportQuota,
		type JobImportStatus
	} from '#services/jobImport.ts';

	let {
		open,
		status,
		userId,
		onClose,
		onImported,
		onQuota,
		refreshStatus,
		pendingImport = null,
		finalFocusEl
	}: {
		/** Controlled by the page */
		open: boolean;
		/** GET /jobs/import: on/off and the allowance; null while unknown */
		status: JobImportStatus | null;
		/** The signed-in recruiter: the draft is kept in this browser under their id */
		userId: string;
		/** Called once the dialog may close */
		onClose: () => void;
		/** The draft is kept: the page opens the editor on it */
		onImported: (result: { fileName: string; warnings: string[] }) => void;
		/** The allowance left after an import */
		onQuota: (quota: JobImportQuota) => void;
		/** Asks the API for the allowance again (after a failure: it may have counted) */
		refreshStatus: () => void;
		/** The import kept in this browser, not saved as a posting yet: a new import replaces it */
		pendingImport?: { fileName: string } | null;
		/** Where the focus goes once the dialog closes (by default, what had it when it opened) */
		finalFocusEl?: () => HTMLElement | null;
	} = $props();

	const uid = $props.id();

	let reading = $state(false);
	// The file is being checked and read, before it is sent: set before the first await, so a
	// second activation of Import meanwhile (a double click) sends nothing more. Each import counts
	let preparing = $state(false);
	// The attempt being prepared: closing the dialog (or leaving) meanwhile drops it
	let attempt = 0;
	let file = $state.raw<File | null>(null);
	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);
	// The file or the import failed
	let uploadError = $state('');
	// After a stop
	let notice = $state('');
	// The last failure was a refusal for the allowance (402, 429): its message says it all
	let allowanceRefused = $state(false);
	let elapsed = $state(0);
	let confirmingStop = $state(false);
	let announcement = $state('');

	let alertElement: HTMLElement | undefined = $state();
	let chooseButton: HTMLButtonElement | undefined = $state();
	let keepWaitingButton: HTMLButtonElement | undefined = $state();

	// The last import answered 401: nothing can start until the recruiter signs in again
	let sessionEnded = $state(false);

	let availability = $derived(status?.enabled ? jobImportAvailability(status) : null);
	let canImport = $derived(availability === 'available' && !sessionEnded);
	// The unsaved import a new one would replace (only worth saying when one can start)
	let replacing = $derived(canImport ? pendingImport : null);

	// --- Upload --------------------------------------------------------------------------

	let controller: AbortController | null = null;
	// The elapsed time shown while reading, and the browser's own deadline
	let ticker: ReturnType<typeof setInterval> | undefined;
	let deadline: ReturnType<typeof setTimeout> | undefined;
	const clearTimers = () => {
		clearInterval(ticker);
		clearTimeout(deadline);
	};
	// Leaving the page stops a running import, and drops one being prepared
	$effect(() => () => {
		attempt += 1;
		controller?.abort();
		clearTimers();
	});

	async function focusAlert() {
		await tick();
		alertElement?.focus();
	}

	async function focusFooter(key: string) {
		await tick();
		document.querySelector<HTMLElement>(`[data-job-import] [data-footer="${key}"]`)?.focus();
	}

	const focusIsLost = () =>
		!document.activeElement ||
		document.activeElement === document.body ||
		!document.activeElement.isConnected;

	function chooseFile(picked: File | undefined) {
		if (!picked || reading || preparing) return;
		notice = '';
		allowanceRefused = false;
		uploadError = jobFileProblem(picked) ?? '';
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
		if (canImport) chooseFile(event.dataTransfer?.files[0]);
	};

	const onDragOver = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragging = canImport;
	};

	const readAsBase64 = (picked: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(base64OfDataUrl(String(reader.result)));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(picked);
		});

	/** The file as the API takes it (base64), or what is wrong with it */
	async function readPdf(picked: File): Promise<{ pdf: string } | { problem: string }> {
		try {
			// The API checks it too: this answers at once, and costs no import
			if (!hasPdfHeader(new Uint8Array(await picked.slice(0, 5).arrayBuffer()))) {
				return {
					problem: 'This file is not a PDF, whatever its name. Choose a PDF job description.'
				};
			}
			return { pdf: await readAsBase64(picked) };
		} catch {
			return { problem: 'This file could not be read. Choose it again.' };
		}
	}

	async function startImport() {
		const picked = file;
		if (!picked || reading || preparing || !canImport) return;
		preparing = true;
		const mine = ++attempt;
		uploadError = '';
		allowanceRefused = false;
		notice = '';

		const read = await readPdf(picked);
		// Closed (or left) while the file was read: nothing is sent
		if (mine !== attempt) return;
		preparing = false;
		if ('problem' in read) {
			uploadError = read.problem;
			file = null;
			return focusAlert();
		}
		const pdf = read.pdf;

		const current = new AbortController();
		controller = current;
		let timedOut = false;
		reading = true;
		elapsed = 0;
		announcement = 'Reading the job description. This can take up to 3 minutes.';
		// "Import" is gone: the focus moves to what replaces it
		focusFooter('cancel-import');
		const startedAt = Date.now();
		ticker = setInterval(() => (elapsed = (Date.now() - startedAt) / 1000), 1000);
		deadline = setTimeout(() => {
			timedOut = true;
			current.abort();
		}, JOB_IMPORT_CLIENT_TIMEOUT_MS);

		let failure = '';
		let imported: { fileName: string; warnings: string[] } | null = null;
		try {
			const { data, error } = await portfolioApi.jobs.import.post(
				{ file: pdf, fileName: picked.name },
				{ fetch: { credentials: 'include', signal: current.signal } }
			);
			// Stopped meanwhile: stopImport() has taken over
			if (controller !== current) return;
			if (error || !data) {
				const code = errorStatus(error);
				if (code === 401) {
					sessionEnded = true;
					clearAuthentication();
				}
				allowanceRefused = !timedOut && isAllowanceRefusal(code);
				failure = timedOut ? JOB_IMPORT_TIMED_OUT : jobImportErrorMessage(code, error?.value);
			} else {
				onQuota(data.quota);
				const warnings = [...data.warnings];
				saveImportedDraft(userId, {
					draft: data.draft as JobPostingLike,
					warnings,
					fileName: picked.name
				});
				if (loadImportedDraft(userId)) {
					file = null;
					imported = { fileName: picked.name, warnings };
				} else {
					failure =
						'The job description was read, but this browser could not keep the draft (site data may be blocked or full). Allow site data, then import it again: this import counted.';
				}
			}
		} catch {
			if (controller !== current) return;
			failure = timedOut ? JOB_IMPORT_TIMED_OUT : JOB_IMPORT_NETWORK_ERROR;
		}

		controller = null;
		clearTimers();
		reading = false;
		confirmingStop = false;
		if (imported) {
			announcement = 'Job description read. Opening the editor.';
			onImported(imported);
			return;
		}
		if (failure) {
			uploadError = failure;
			// It may have counted: show the allowance the API now sees
			refreshStatus();
			await focusAlert();
		}
	}

	async function stopImport() {
		const current = controller;
		controller = null;
		current?.abort();
		clearTimers();
		reading = false;
		confirmingStop = false;
		notice = JOB_IMPORT_STOPPED;
		refreshStatus();
		await focusAlert();
	}

	/** Whether a PDF is being read, or about to be sent: leaving now would lose an import */
	export function isBusy(): boolean {
		return reading || preparing;
	}

	async function askToStop() {
		confirmingStop = true;
		await tick();
		keepWaitingButton?.focus();
	}

	async function keepWaiting() {
		confirmingStop = false;
		await focusFooter('cancel-import');
	}

	/** Escape, the backdrop and the close buttons: a running import asks first */
	function requestClose() {
		if (confirmingStop) {
			keepWaiting();
			return;
		}
		if (reading) {
			askToStop();
			return;
		}
		// Closed before the file was sent: it is not
		attempt += 1;
		preparing = false;
		// A file picked but not sent, an error or a notice: gone next time
		file = null;
		uploadError = '';
		notice = '';
		allowanceRefused = false;
		sessionEnded = false;
		onClose();
	}
</script>

<Dialog
	{open}
	onOpenChange={(details) => {
		if (!details.open) requestClose();
	}}
	{finalFocusEl}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-center sm:items-center sm:p-4">
			<Dialog.Content
				class="flex h-full w-full flex-col overflow-hidden bg-surface-50-950 text-surface-950-50 shadow-xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-xl sm:rounded-container sm:border sm:border-surface-200-800"
				data-job-import
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
										Import a job description
									</h2>
								{/snippet}
							</Dialog.Title>
							<Dialog.Description>
								{#snippet element(attributes)}
									<p {...attributes} class="text-sm text-surface-700-300 wrap-anywhere">
										{reading
											? (file?.name ?? 'Your PDF')
											: 'Turn a PDF job description into a draft you complete in the editor.'}
									</p>
								{/snippet}
							</Dialog.Description>
						</div>
						<button
							type="button"
							class="btn-icon size-10 shrink-0 hover:preset-tonal"
							aria-label="Close"
							onclick={requestClose}
						>
							<XMark size="20" aria-hidden="true" />
						</button>
					</div>

					<!-- Body -->
					<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
						{#if !reading}
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
										class="rounded-base preset-tonal-warning p-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-warning-500"
										role="status"
									>
										{notice}
									</div>
								{/if}

								{#if replacing}
									<div
										id="{uid}-replaces"
										class="flex items-start gap-3 rounded-base preset-tonal-warning p-3 text-sm"
									>
										<ExclamationTriangle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
										<div class="min-w-0 flex-1 space-y-2">
											<p class="text-surface-950-50">
												A new import replaces your unsaved import of
												<span class="font-semibold wrap-anywhere"
													>{replacing.fileName || 'a job description'}</span
												>, and any changes you made to it.
											</p>
											<a
												href={resolve('/(app)/recruiter/jobs/new?import=1')}
												class="btn btn-sm preset-tonal min-h-9"
											>
												<PencilSquare size="16" aria-hidden="true" />
												Continue editing it instead
											</a>
										</div>
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
												<span class="pointer-coarse:hidden">Drop the job description here</span>
												<span class="pointer-fine:hidden">Choose the job description</span>
											</span>
											<span class="block text-sm text-surface-700-300">PDF, up to 4 MB</span>
										</p>
										<button
											bind:this={chooseButton}
											type="button"
											class="btn preset-filled-primary-700-300 min-h-10"
											disabled={!canImport || preparing}
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

								{#if sessionEnded}
									<!-- The alert above says to sign in again -->
								{:else if status?.enabled}
									{#if availability === 'available'}
										<p class="text-sm text-surface-700-300">
											<span class="font-semibold">{jobImportQuotaText(status)}.</span>
											{#if file}
												{importCostText(status)}
											{/if}
										</p>
									{:else if !allowanceRefused}
										<!-- After a 402 or 429, the message above says it (once is enough) -->
										<p class="rounded-base preset-tonal-warning p-3 text-sm font-medium">
											{jobImportAllowanceText(status)}
										</p>
									{/if}
								{:else if status}
									<p class="rounded-base preset-tonal-warning p-3 text-sm">
										Job description import is not available right now.
									</p>
								{/if}

								<div class="flex items-start gap-3 rounded-base preset-tonal p-3 text-sm sm:p-4">
									<LockClosed size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
									<p class="text-surface-800-200">
										Your PDF is sent to Anthropic’s Claude, which reads it to draft the job
										description. The file is not stored, and nothing is published: you complete the
										draft in the editor, then save it.
									</p>
								</div>
							</div>
						{:else}
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
									<p class="text-lg font-semibold">Reading the job description…</p>
									<p class="text-sm text-surface-700-300">
										Claude is finding the title, contract, working time, pay and requirements.
									</p>
								</div>
								<Progress value={null} class="w-full max-w-sm">
									<Progress.Label class="sr-only">Reading the job description</Progress.Label>
									<Progress.Track>
										<Progress.Range class="bg-primary-500 motion-reduce:animate-none" />
									</Progress.Track>
								</Progress>
								<p class="text-sm text-surface-700-300">
									<span class="font-semibold tabular-nums">{formatElapsed(elapsed)}</span>
									elapsed · this can take up to 3 minutes
								</p>
								<p
									class="flex max-w-sm items-start gap-1.5 text-start text-xs text-surface-700-300"
								>
									<InformationCircle size="16" class="shrink-0" aria-hidden="true" />
									<span>
										Keep this window open. Stopping now may still count toward your free imports.
									</span>
								</p>
							</div>
						{/if}
						<p class="sr-only" aria-live="polite">{announcement}</p>
					</div>

					<!-- Footer -->
					<div
						class="border-t border-surface-200-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
					>
						{#if confirmingStop}
							<div
								class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
								role="group"
								aria-labelledby="{uid}-confirm"
							>
								<p id="{uid}-confirm" class="me-auto min-w-0 font-medium">
									Stop the import? It may still count toward your free imports.
								</p>
								<div class="flex gap-2">
									<button
										bind:this={keepWaitingButton}
										type="button"
										class="btn preset-tonal"
										onclick={keepWaiting}
									>
										Keep waiting
									</button>
									<button
										type="button"
										class="btn preset-filled-error-700-300"
										onclick={stopImport}
									>
										Stop import
									</button>
								</div>
							</div>
						{:else if reading}
							<div class="flex flex-wrap items-center justify-end gap-2">
								<button
									type="button"
									class="btn preset-tonal"
									data-footer="cancel-import"
									onclick={askToStop}
								>
									Cancel import
								</button>
							</div>
						{:else}
							<div class="flex flex-wrap items-center justify-end gap-2">
								<button type="button" class="btn preset-tonal" onclick={requestClose}>
									Cancel
								</button>
								<button
									type="button"
									class="btn preset-filled-primary-700-300"
									data-footer="import"
									disabled={!file || !canImport || preparing}
									aria-describedby={replacing ? `${uid}-replaces` : undefined}
									onclick={startImport}
								>
									Import
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
