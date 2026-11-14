<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowRight, Briefcase, ShieldCheck, Trash, UserCircle } from 'svelte-heros-v2';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import DeleteAccountDialog from '#components/account/DeleteAccountDialog.svelte';
	import TermsAcceptance from '#components/account/TermsAcceptance.svelte';
	import { isSessionValid } from '#services/authentication.ts';
	import { refreshAccount, spaceLabel, userDisplayName } from '#services/account.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';

	// /account: what the site keeps for the signed-in account, the terms it accepted, links to the
	// legal pages, and deleting the account (DELETE /me). Its data is the account's, so it shows in
	// the browser only, once the session is checked; the server renders a placeholder.

	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	let host = $derived(page.url.host);
	let name = $derived(user?.name || user?.surname ? userDisplayName(user) : '');
	let activeSpace = $derived(spaceLabel(user?.activeMode));

	// The account as the API has it now (the persisted session may be behind: a portfolio claimed
	// or terms accepted in another tab). Once per account; a failure keeps what the session knows
	let refreshed: string | undefined;
	$effect(() => {
		const id = user?._id;
		if (!id || refreshed === String(id)) return;
		refreshed = String(id);
		void refreshAccount();
	});

	let deleting = $state(false);
	let deleteButton: HTMLButtonElement | undefined = $state();

	const linkClass =
		'font-medium text-primary-700-300 underline underline-offset-2 hover:decoration-2';
</script>

<svelte:head>
	<title>Account & privacy | Portfolio</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-6">
		<div class="space-y-1">
			<h2 class="text-2xl font-bold md:text-3xl">Account & privacy</h2>
			<p class="text-surface-700-300">
				What this site keeps for your account, the terms you accepted, and how to delete everything.
			</p>
		</div>

		{#if !$sessionCheckedStore}
			<div class="space-y-4" aria-busy="true" aria-label="Loading your account">
				{#each [0, 1, 2] as index (index)}
					<div class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-4 md:p-6">
						<div class="placeholder h-5 w-40 animate-pulse motion-reduce:animate-none"></div>
						<div class="placeholder h-4 w-full animate-pulse motion-reduce:animate-none"></div>
						<div class="placeholder h-4 w-2/3 animate-pulse motion-reduce:animate-none"></div>
					</div>
				{/each}
			</div>
		{:else if !user}
			<PageNotice title="Sign in to see your account" icon={UserCircle}>
				<p>
					Your account page shows the data kept for your account and the terms you accepted, and
					lets you delete it. Candidates sign in from the home page, recruiters from the recruiter
					space.
				</p>
				{#snippet actions()}
					<a href="{resolve('/(site)')}#create" class="btn preset-filled-primary-700-300 min-h-11">
						<UserCircle size="18" aria-hidden="true" />
						<span>Sign in as a candidate</span>
					</a>
					<a href={resolve('/(app)/recruiter')} class="btn preset-tonal min-h-11">
						<Briefcase size="18" aria-hidden="true" />
						<span>Sign in as a recruiter</span>
					</a>
				{/snippet}
			</PageNotice>
		{:else}
			<section
				class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4 md:p-6"
				aria-labelledby="account-details-title"
				data-account-details
			>
				<div class="flex items-start gap-3">
					<span
						class="grid size-10 shrink-0 place-items-center rounded-full preset-tonal-primary"
						aria-hidden="true"
					>
						<UserCircle size="20" />
					</span>
					<div class="min-w-0 flex-1 space-y-1">
						<h3 id="account-details-title" class="text-lg font-semibold">Your account</h3>
						<p class="text-sm text-surface-700-300">You sign in with your Google account.</p>
					</div>
				</div>
				<dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
					{#if name}
						<dt class="font-medium text-surface-700-300">Name</dt>
						<dd class="wrap-anywhere">{name}</dd>
					{/if}
					<dt class="font-medium text-surface-700-300">Email address</dt>
					<dd class="wrap-anywhere" data-account-email>{user.email ?? 'Not known'}</dd>
					<dt class="font-medium text-surface-700-300">Portfolio</dt>
					<dd class="wrap-anywhere" data-account-portfolio>
						{#if user.domain}
							<a href={resolve('/[domain]/experiences', { domain: user.domain })} class={linkClass}
								>{host}/{user.domain}</a
							>
						{:else}
							<span>None yet.</span>
							<a href="{resolve('/(site)')}#create" class={linkClass}>Create your portfolio</a>
						{/if}
					</dd>
					<dt class="font-medium text-surface-700-300">Recruiter space</dt>
					<dd>
						{#if user.recruiter}
							<a href={resolve('/(app)/recruiter')} class={linkClass}>Your job descriptions</a>
						{:else}
							Not created
						{/if}
					</dd>
					{#if activeSpace}
						<dt class="font-medium text-surface-700-300">Space in use</dt>
						<dd>{activeSpace}</dd>
					{/if}
				</dl>
			</section>

			<TermsAcceptance {user} />

			<section
				class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4 md:p-6"
				aria-labelledby="account-data-title"
			>
				<div class="flex items-start gap-3">
					<span
						class="grid size-10 shrink-0 place-items-center rounded-full preset-tonal-primary"
						aria-hidden="true"
					>
						<ShieldCheck size="20" />
					</span>
					<div class="min-w-0 flex-1 space-y-1">
						<h3 id="account-data-title" class="text-lg font-semibold">Your data</h3>
						<p class="text-sm text-surface-700-300">
							Only what the site needs to work. Nothing is sold or used for advertising.
						</p>
					</div>
				</div>
				<ul class="list-disc space-y-1.5 ps-5 text-sm text-surface-700-300">
					<li>
						From Google: your Google account id and your email address. Your picture is not kept.
					</li>
					<li>
						Your portfolio and everything you publish on it, which anyone can read, and your hiring
						journey.
					</li>
					<li>Your job descriptions, your applications and your meeting types.</li>
					<li>
						The terms you accepted: their version, the date and the wording of the age confirmation.
						No birth date.
					</li>
				</ul>
				<p class="text-sm text-surface-700-300">
					You change most of it yourself on your portfolio and in the recruiter space. For a copy of
					your data or any other request, write to the contact address in the
					<a href={resolve('/(site)/legal')} class={linkClass}>legal notice</a>.
				</p>
				<ul class="flex flex-wrap gap-2">
					<li>
						<a href={resolve('/(site)/legal/privacy')} class="btn btn-sm preset-tonal">
							<span>Privacy policy</span>
							<ArrowRight size="14" aria-hidden="true" />
						</a>
					</li>
					<li>
						<a href={resolve('/(site)/legal/cookies')} class="btn btn-sm preset-tonal">
							<span>Cookies and local storage</span>
							<ArrowRight size="14" aria-hidden="true" />
						</a>
					</li>
					<li>
						<a href={resolve('/(site)/legal/terms')} class="btn btn-sm preset-tonal">
							<span>Terms of use</span>
							<ArrowRight size="14" aria-hidden="true" />
						</a>
					</li>
				</ul>
			</section>

			<section
				class="card border border-error-500/60 bg-surface-50-950 space-y-4 p-4 md:p-6"
				aria-labelledby="account-delete-title"
				data-danger-zone
			>
				<div class="flex items-start gap-3">
					<span
						class="grid size-10 shrink-0 place-items-center rounded-full preset-tonal-error"
						aria-hidden="true"
					>
						<Trash size="20" class="text-error-700-300" />
					</span>
					<div class="min-w-0 flex-1 space-y-1">
						<h3 id="account-delete-title" class="text-lg font-semibold">Delete your account</h3>
						<p class="text-sm text-surface-700-300">
							Deletes your account and everything tied to it, at once:
							{user.domain ? 'your portfolio (its address becomes available to others), ' : ''}your
							hiring journey, job descriptions, applications and meeting types. Google is asked to
							revoke its Calendar access. This cannot be undone.
						</p>
					</div>
				</div>
				<button
					bind:this={deleteButton}
					type="button"
					class="btn preset-outlined-error-500 min-h-11 w-full text-error-700-300 hover:preset-filled-error-500 sm:w-auto"
					onclick={() => (deleting = true)}
				>
					<Trash size="18" aria-hidden="true" />
					<span>Delete my account</span>
				</button>
			</section>
		{/if}
	</div>
</div>

<DeleteAccountDialog
	open={deleting}
	{user}
	onClose={() => (deleting = false)}
	finalFocusEl={() => deleteButton ?? null}
/>
