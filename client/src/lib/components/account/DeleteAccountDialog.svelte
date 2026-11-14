<!--
@component
"Delete your account?": the account page's confirmation before DELETE /me. It lists what goes
(the portfolio, whose address becomes free for others, the hiring journey, job descriptions,
applications, meeting types and bookings, the account itself, this browser's drafts), that
Google is asked to revoke the Google Calendar access, and that it cannot be undone; the person
types DELETE to confirm. While the request runs the dialog cannot be closed. Once the account is gone
(deleteAccount: the session and this browser's drafts are cleared too), a toast says so and the
home page opens; a 401 saying the account no longer exists counts as deleted (a retry after a lost
answer). Another 401 (the session expired) closes the dialog and the page asks to sign in again.

The dialog closes itself before any navigation (an open Dialog's focus trap would otherwise read
state of the destroyed page: derived_inert); while the deletion runs, a navigation inside the
site is held back, so the person sees how it ended.
-->
<script module lang="ts">
	/** What the person types to confirm (the API asks for the same word: `{ confirm: 'DELETE' }`) */
	export const DELETE_CONFIRMATION_WORD = 'DELETE';
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ArrowPath, ExclamationTriangle, Trash, XMark } from 'svelte-heros-v2';
	import { deleteAccount } from '#services/account.ts';
	import type { AuthUser } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';

	let {
		open,
		user,
		onClose,
		finalFocusEl
	}: {
		/** Controlled by the page */
		open: boolean;
		/** The signed-in account; undefined once the session ended */
		user: AuthUser | undefined;
		/** Called once the dialog may close (dismissed, deleted, or the session ended) */
		onClose: () => void;
		/** Where the focus goes once the dialog closes without navigating */
		finalFocusEl?: () => HTMLElement | null;
	} = $props();

	const uid = $props.id();

	// Each opening starts afresh: writable deriveds, reset whenever `open` changes
	const freshOn = <T,>(_opening: unknown, value: T): T => value;

	let confirmation = $derived(freshOn(open, ''));
	let submitted = $derived(freshOn(open, false));
	let busy = $derived(freshOn(open, false));
	let errorMessage = $derived(freshOn(open, ''));

	/**
	 * The account the dialog is about: kept once the session is cleared, so the dialog does not
	 * change while it closes after the deletion
	 */
	let lastUser: AuthUser | undefined;
	let account = $derived.by(() => {
		if (user) lastUser = user;
		return lastUser;
	});

	let confirmed = $derived(confirmation.trim() === DELETE_CONFIRMATION_WORD);
	let confirmationError = $derived(
		submitted && !confirmed ? `Type ${DELETE_CONFIRMATION_WORD} in capital letters to confirm.` : ''
	);
	let portfolioAddress = $derived(account?.domain ? `${page.url.host}/${account.domain}` : '');

	let input: HTMLInputElement | undefined = $state();
	let alertElement: HTMLDivElement | undefined = $state();
	/** Our own navigation to the home page, once the account is gone */
	let leaving = false;

	const requestClose = () => {
		if (!busy) onClose();
	};

	beforeNavigate((navigation) => {
		if (!open) return;
		if (busy && !leaving && navigation.type !== 'leave') {
			// The deletion is running: stay until it ends (it cannot be called back)
			navigation.cancel();
			return;
		}
		onClose();
	});

	$effect(() => {
		// The session ended while the dialog was open (expired, signed out in another tab)
		if (open && !user && !busy) onClose();
	});

	const showError = async (message: string) => {
		errorMessage = message;
		await tick();
		alertElement?.focus();
	};

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		submitted = true;
		errorMessage = '';
		if (!confirmed) {
			input?.focus();
			return;
		}

		busy = true;
		const result = await deleteAccount();
		if (!result.ok) {
			busy = false;
			if (result.reason === 'session-expired') {
				onClose();
				// Whether the account still exists is not known here: signing in again tells
				toaster.error({
					title: result.message,
					description: 'Sign in again to check your account.'
				});
			} else {
				await showError(result.message);
			}
			return;
		}

		toaster.success({
			title: 'Your account was deleted',
			description: 'Everything tied to it is gone, and you are signed out.'
		});
		leaving = true;
		busy = false;
		onClose();
		await goto(resolve('/(site)'), { invalidateAll: true });
	}
</script>

<Dialog
	{open}
	role="alertdialog"
	onOpenChange={(details) => {
		if (!details.open) requestClose();
	}}
	closeOnEscape={!busy}
	closeOnInteractOutside={!busy}
	initialFocusEl={() => input ?? null}
	{finalFocusEl}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner
			class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
		>
			<Dialog.Content
				class="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-container border-t border-surface-200-800 bg-surface-50-950 text-surface-950-50 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-container sm:border"
				data-delete-account
			>
				{#if open}
					<div class="flex items-start gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
						<span
							class="grid size-10 shrink-0 place-items-center rounded-full preset-tonal-error"
							aria-hidden="true"
						>
							<Trash size="20" class="text-error-700-300" />
						</span>
						<div class="min-w-0 flex-1">
							<Dialog.Title>
								{#snippet element(attributes)}
									<h2 {...attributes} class="text-lg font-semibold sm:text-xl">
										Delete your account?
									</h2>
								{/snippet}
							</Dialog.Title>
							<Dialog.Description>
								{#snippet element(attributes)}
									<p {...attributes} class="mt-1 text-sm text-surface-700-300">
										Everything tied to your account is deleted at once. This cannot be undone.
									</p>
								{/snippet}
							</Dialog.Description>
						</div>
						<button
							type="button"
							class="btn-icon size-10 shrink-0 hover:preset-tonal"
							aria-label="Close"
							aria-disabled={busy ? 'true' : undefined}
							onclick={requestClose}
						>
							<XMark size="20" aria-hidden="true" />
						</button>
					</div>

					<div
						class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 text-sm sm:px-6"
					>
						{#if errorMessage}
							<div
								bind:this={alertElement}
								tabindex="-1"
								class="flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500"
								role="alert"
							>
								<ExclamationTriangle
									size="18"
									class="mt-0.5 shrink-0 text-error-700-300"
									aria-hidden="true"
								/>
								<p>{errorMessage}</p>
							</div>
						{/if}

						<div class="space-y-2">
							<h3 class="font-semibold">What is deleted</h3>
							<ul class="list-disc space-y-1.5 ps-5 text-surface-700-300" data-deleted-items>
								{#if portfolioAddress}
									<li>
										Your portfolio
										<span class="font-medium text-surface-950-50 wrap-anywhere"
											>{portfolioAddress}</span
										>, its experiences and projects, and your hiring journey. The address becomes
										available to others.
									</li>
								{/if}
								{#if account?.recruiter}
									<li>Your job descriptions and their lists of applicants.</li>
								{/if}
								<li>
									Your job applications and your progress in other portfolios' hiring journeys.
								</li>
								<li>
									Your meeting types and bookings. If you connected Google Calendar, its tokens are
									deleted and Google is asked to revoke its access.
								</li>
								<li>
									Your account: your email address, your Google account id and the terms you
									accepted.
								</li>
								<li>The drafts this browser keeps for your account.</li>
							</ul>
							<p class="text-surface-700-300">
								Meetings already added to Google calendars stay there, and step suggestions already
								published on GitHub stay (they do not name you).
							</p>
						</div>

						<form id="{uid}-form" class="space-y-1.5" novalidate onsubmit={submit}>
							<label class="label" for="{uid}-confirmation">
								<span class="label-text font-medium">
									Type <span class="font-mono font-bold">{DELETE_CONFIRMATION_WORD}</span> to confirm
								</span>
							</label>
							<input
								bind:this={input}
								bind:value={confirmation}
								id="{uid}-confirmation"
								class="input min-h-11 font-mono"
								type="text"
								name="confirmation"
								autocomplete="off"
								autocapitalize="characters"
								spellcheck="false"
								aria-invalid={confirmationError ? 'true' : undefined}
								aria-describedby={confirmationError ? `${uid}-confirmation-error` : undefined}
								readonly={busy}
							/>
							{#if confirmationError}
								<p id="{uid}-confirmation-error" class="text-error-700-300">
									{confirmationError}
								</p>
							{/if}
						</form>

						<p class="sr-only" role="status" aria-live="polite">
							{busy ? 'Deleting your account…' : ''}
						</p>
					</div>

					<div
						class="flex flex-wrap items-center justify-end gap-2 border-t border-surface-200-800 px-4 py-3 sm:px-6"
					>
						<button
							type="button"
							class="btn preset-tonal min-h-11"
							aria-disabled={busy ? 'true' : undefined}
							onclick={requestClose}
						>
							Cancel
						</button>
						<button
							type="submit"
							form="{uid}-form"
							class="btn preset-filled-error-500 min-h-11"
							aria-disabled={busy || !confirmed ? 'true' : undefined}
						>
							{#if busy}
								<ArrowPath
									size="16"
									class="animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
								<span>Deleting…</span>
							{:else}
								<Trash size="16" aria-hidden="true" />
								<span>Delete my account</span>
							{/if}
						</button>
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
