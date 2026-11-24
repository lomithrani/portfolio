<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowRight, Briefcase, ShieldCheck, Trash, UserCircle } from 'svelte-heros-v2';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import DeleteAccountDialog from '#components/account/DeleteAccountDialog.svelte';
	import TermsAcceptance from '#components/account/TermsAcceptance.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { isSessionValid } from '#services/authentication.ts';
	import { refreshAccount, spaceLabel, userDisplayName } from '#services/account.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { NOINDEX } from '#lib/robots.ts';
	import { m } from './page.messages.ts';

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
	<title>{accountMessages.accountPrivacy} | Portfolio</title>
	<meta name="robots" content={NOINDEX} />
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-6">
		<div class="space-y-1">
			<h2 class="text-2xl font-bold md:text-3xl">{accountMessages.accountPrivacy}</h2>
			<p class="text-surface-700-300">
				{m.intro}
			</p>
		</div>

		{#if !$sessionCheckedStore}
			<div class="space-y-4" aria-busy="true" aria-label={m.loading}>
				{#each [0, 1, 2] as index (index)}
					<div class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-4 md:p-6">
						<div class="placeholder h-5 w-40 animate-pulse motion-reduce:animate-none"></div>
						<div class="placeholder h-4 w-full animate-pulse motion-reduce:animate-none"></div>
						<div class="placeholder h-4 w-2/3 animate-pulse motion-reduce:animate-none"></div>
					</div>
				{/each}
			</div>
		{:else if !user}
			<PageNotice title={m.signedOut.title} icon={UserCircle}>
				<p>
					{m.signedOut.text}
				</p>
				{#snippet actions()}
					<a href="{resolve('/(site)')}#create" class="btn preset-filled-primary-700-300 min-h-11">
						<UserCircle size="18" aria-hidden="true" />
						<span>{m.signedOut.candidate}</span>
					</a>
					<a href={resolve('/(app)/recruiter')} class="btn preset-tonal min-h-11">
						<Briefcase size="18" aria-hidden="true" />
						<span>{m.signedOut.recruiter}</span>
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
						<h3 id="account-details-title" class="text-lg font-semibold">{m.details.title}</h3>
						<p class="text-sm text-surface-700-300">{m.details.google}</p>
					</div>
				</div>
				<dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
					{#if name}
						<dt class="font-medium text-surface-700-300">{m.details.name}</dt>
						<dd class="wrap-anywhere">{name}</dd>
					{/if}
					<dt class="font-medium text-surface-700-300">{m.details.email}</dt>
					<dd class="wrap-anywhere" data-account-email>{user.email ?? m.details.emailUnknown}</dd>
					<dt class="font-medium text-surface-700-300">{m.details.portfolio}</dt>
					<dd class="wrap-anywhere" data-account-portfolio>
						{#if user.domain}
							<a href={resolve('/[domain]/experiences', { domain: user.domain })} class={linkClass}
								>{host}/{user.domain}</a
							>
						{:else}
							<span>{m.details.noPortfolio}</span>
							<a href="{resolve('/(site)')}#create" class={linkClass}>{m.details.createPortfolio}</a
							>
						{/if}
					</dd>
					<dt class="font-medium text-surface-700-300">{m.details.recruiterSpace}</dt>
					<dd>
						{#if user.recruiter}
							<a href={resolve('/(app)/recruiter')} class={linkClass}>{m.details.jobs}</a>
						{:else}
							{m.details.noRecruiterSpace}
						{/if}
					</dd>
					{#if activeSpace}
						<dt class="font-medium text-surface-700-300">{m.details.spaceInUse}</dt>
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
						<h3 id="account-data-title" class="text-lg font-semibold">{m.data.title}</h3>
						<p class="text-sm text-surface-700-300">
							{m.data.intro}
						</p>
					</div>
				</div>
				<ul class="list-disc space-y-1.5 ps-5 text-sm text-surface-700-300">
					<li>{m.data.google}</li>
					<li>{m.data.portfolio}</li>
					<li>{m.data.skills}</li>
					<li>{m.data.jobs}</li>
					<li>{m.data.terms}</li>
				</ul>
				<p class="text-sm text-surface-700-300">
					<Rich text={m.data.requests}>
						{#snippet notice(text)}<a href={resolve('/(site)/legal')} class={linkClass}>{text}</a
							>{/snippet}
					</Rich>
				</p>
				<ul class="flex flex-wrap gap-2">
					<li>
						<a href={resolve('/(site)/legal/privacy')} class="btn btn-sm preset-tonal">
							<span>{m.data.privacy}</span>
							<ArrowRight size="14" aria-hidden="true" />
						</a>
					</li>
					<li>
						<a href={resolve('/(site)/legal/cookies')} class="btn btn-sm preset-tonal">
							<span>{m.data.cookies}</span>
							<ArrowRight size="14" aria-hidden="true" />
						</a>
					</li>
					<li>
						<a href={resolve('/(site)/legal/terms')} class="btn btn-sm preset-tonal">
							<span>{m.data.termsOfUse}</span>
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
						<h3 id="account-delete-title" class="text-lg font-semibold">{m.delete.title}</h3>
						<p class="text-sm text-surface-700-300">
							{m.delete.text(!!user.domain)}
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
					<span>{accountMessages.deleteMyAccount}</span>
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
