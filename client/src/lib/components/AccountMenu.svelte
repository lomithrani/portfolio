<!--
@component
The signed-in account's menu in the header: its initials and current space on the trigger, then
the two spaces (radio items: the active one is checked), Opportunities for a portfolio owner
while matching is available (/opportunities: the jobs proposed to them and their mutual interests,
with a badge of the mutual interests not seen yet, also said in the trigger's name and marked on
its initials: notificationsStore), Share your link for a portfolio owner
(the admin's Share tab: /<domain>/admin?tab=share), Account & privacy (/account:
the account's data, the terms it accepted, deleting it), Send feedback (the page's feedback dialog,
when the server takes feedback) and Log out. Choosing a space
opens its home, and the space is recorded once its page shows (recordSpaceShown, PUT /me/mode): a
page that keeps the visitor (unsaved changes) leaves the space as it was. The recruiter space is
not created from here: /recruiter offers to create it, after the age and terms box when the
account has not accepted the terms in force. A candidate without a portfolio is sent to the claim
form instead (`onClaimPortfolio`).
-->
<script module lang="ts">
	/** The trigger's id: where the focus goes back once the space chooser closes */
	export const ACCOUNT_MENU_TRIGGER_ID = 'account-menu-trigger';
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		ArrowRightStartOnRectangle,
		Briefcase,
		ChatBubbleLeftEllipsis,
		Check,
		ChevronDown,
		Inbox,
		Share,
		ShieldCheck,
		UserCircle
	} from 'svelte-heros-v2';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { UserMode } from 'portfolio-common';
	import { logout } from '#services/authentication.ts';
	import {
		recordSpaceShown,
		spaceLabel,
		userDisplayName,
		userInitials
	} from '#services/account.ts';
	import type { AuthUser } from '#services/stores/index.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import { feedbackAvailability, openFeedback } from '#services/feedback.ts';
	import { notificationsStore, unseenBadgeText, unseenLabel } from '#services/notifications.ts';
	import { m } from './AccountMenu.messages.ts';

	let {
		user,
		onClaimPortfolio
	}: {
		/** The signed-in account */
		user: AuthUser;
		/** A candidate without a portfolio chose the candidate space: open the claim form */
		onClaimPortfolio: () => void;
	} = $props();

	let open = $state(false);
	/** The space being opened (its request in flight) */
	let pending = $state<UserMode | null>(null);

	let name = $derived(userDisplayName(user));
	let initials = $derived(userInitials(user));
	let currentLabel = $derived(spaceLabel(user.activeMode));
	// Opportunities, for a portfolio owner while matching is available, and its mutual interests
	// not seen yet (none counted for anyone else)
	let opportunities = $derived(!!user.domain && $notificationsStore.matching === 'on');
	let unseen = $derived(opportunities ? $notificationsStore.unseen.candidate : 0);
	let triggerLabel = $derived(m.trigger[user.activeMode ?? 'none'](name, unseen));
	let statusText = $derived(pending ? accountMessages.opening[pending] : '');

	/** Whether the server takes feedback: "Send feedback" shows once it says so */
	let feedbackEnabled = $state(false);
	$effect(() => {
		let current = true;
		void feedbackAvailability().then((answer) => {
			if (current) feedbackEnabled = answer.enabled;
		});
		return () => {
			current = false;
		};
	});

	async function openCandidateSpace() {
		const domain = user.domain;
		if (!domain) {
			onClaimPortfolio();
			return;
		}
		pending = 'candidate';
		try {
			await goto(resolve('/[domain]/experiences', { domain }));
		} finally {
			pending = null;
		}
		// Recorded once the portfolio shows (the layout does it too: one request)
		void recordSpaceShown(page.url.pathname);
	}

	async function openRecruiterSpace() {
		pending = 'recruiter';
		try {
			// Without a space yet, the page offers to create it (with the terms, when not accepted)
			await goto(resolve('/(app)/recruiter'));
		} finally {
			pending = null;
		}
		// The space of the page shown: the recruiter space, or the page that kept the visitor
		void recordSpaceShown(page.url.pathname);
	}

	function select({ value }: { value: string }) {
		if (pending) return;
		if (value === 'candidate') void openCandidateSpace();
		else if (value === 'recruiter') void openRecruiterSpace();
		else if (value === 'logout') void logout();
		// The menu gives the focus back to its trigger as it closes: the dialog's too, once closed
		else if (value === 'feedback')
			openFeedback(() => document.getElementById(ACCOUNT_MENU_TRIGGER_ID));
		// 'opportunities', 'share' and 'account' are links: the browser follows them
	}

	const itemClass = 'gap-3 py-2 cursor-pointer data-[state=checked]:bg-primary-500/10';
	const iconClass = 'grid size-8 shrink-0 place-items-center rounded-full';
</script>

<Menu
	{open}
	onOpenChange={(details) => (open = details.open)}
	onSelect={select}
	ids={{ trigger: ACCOUNT_MENU_TRIGGER_ID }}
	positioning={{ placement: 'bottom-end', gutter: 8 }}
>
	<Menu.Trigger
		class="btn h-auto gap-2 rounded-full p-1 pe-2 hover:preset-tonal focus-visible:ring-2 focus-visible:ring-primary-500 sm:pe-3"
		aria-label={triggerLabel}
		aria-busy={pending ? 'true' : undefined}
		title={name}
		data-account-menu
	>
		<span
			class="relative grid size-8 shrink-0 place-items-center rounded-full preset-filled-primary-700-300 text-xs font-bold"
			aria-hidden="true"
		>
			{initials}
			{#if unseen > 0}
				<!-- Something not seen yet: the trigger's name says what -->
				<span
					class="absolute -end-0.5 -top-0.5 size-3 rounded-full border-2 border-surface-50-950 bg-error-500"
					data-unseen-dot
				></span>
			{/if}
		</span>
		{#if currentLabel}
			<span class="text-xs font-medium sm:text-sm">{currentLabel}</span>
		{/if}
		{#if pending}
			<ArrowPath size="14" class="animate-spin" aria-hidden="true" />
		{:else}
			<ChevronDown size="14" aria-hidden="true" />
		{/if}
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner class="z-50">
			<Menu.Content class="w-72 max-w-[calc(100vw-1rem)] text-surface-950-50 outline-none z-50">
				<!-- Who is signed in: also in the trigger's name, so hidden from the menu's items -->
				<div class="border-b border-surface-200-800 px-2 pb-2" aria-hidden="true">
					<p class="truncate font-semibold">{name}</p>
					{#if user.email && user.email !== name}
						<p class="truncate text-xs text-surface-700-300">{user.email}</p>
					{/if}
				</div>
				<Menu.ItemGroup>
					<Menu.ItemGroupLabel>{m.spaces}</Menu.ItemGroupLabel>
					<Menu.OptionItem
						type="radio"
						value="candidate"
						valueText={m.candidateSpace}
						checked={user.activeMode === 'candidate'}
						class={itemClass}
					>
						<span class="{iconClass} preset-tonal-primary" aria-hidden="true">
							<UserCircle size="18" />
						</span>
						<Menu.ItemText class="min-w-0 flex-1">
							<span class="block font-medium">{m.candidateSpace}</span>
							<span class="block truncate text-xs text-surface-700-300">
								{user.domain ? m.yourPortfolio(user.domain) : m.claimPortfolio}
							</span>
						</Menu.ItemText>
						<Menu.ItemIndicator class="text-primary-700-300">
							<Check size="16" aria-hidden="true" />
						</Menu.ItemIndicator>
					</Menu.OptionItem>
					<Menu.OptionItem
						type="radio"
						value="recruiter"
						valueText={m.recruiterSpace}
						checked={user.activeMode === 'recruiter'}
						class={itemClass}
					>
						<span class="{iconClass} preset-tonal-secondary" aria-hidden="true">
							<Briefcase size="18" />
						</span>
						<Menu.ItemText class="min-w-0 flex-1">
							<span class="block font-medium">{m.recruiterSpace}</span>
							<span class="block truncate text-xs text-surface-700-300">
								{user.recruiter ? m.yourJobs : m.postJobs}
							</span>
						</Menu.ItemText>
						<Menu.ItemIndicator class="text-primary-700-300">
							<Check size="16" aria-hidden="true" />
						</Menu.ItemIndicator>
					</Menu.OptionItem>
				</Menu.ItemGroup>
				<Menu.Separator />
				{#if opportunities}
					<Menu.Item value="opportunities" valueText={m.opportunities}>
						{#snippet element(attributes)}
							<a
								{...attributes as HTMLAttributes<HTMLAnchorElement>}
								href={resolve('/(app)/opportunities')}
								class="{itemClass} justify-start"
							>
								<span class="{iconClass} preset-tonal-primary" aria-hidden="true">
									<Inbox size="18" />
								</span>
								<span class="min-w-0 flex-1 font-medium">{m.opportunities}</span>
								{#if unseen > 0}
									<span class="badge preset-filled-error-500 shrink-0 text-xs" data-unseen>
										<span aria-hidden="true">{unseenBadgeText(unseen)}</span>
										<span class="sr-only">{unseenLabel(unseen)}</span>
									</span>
								{/if}
							</a>
						{/snippet}
					</Menu.Item>
				{/if}
				{#if user.domain}
					<Menu.Item value="share" valueText={m.shareLink}>
						{#snippet element(attributes)}
							<a
								{...attributes as HTMLAttributes<HTMLAnchorElement>}
								href={resolve('/[domain]/admin?tab=share', { domain: user.domain ?? '' })}
								class="{itemClass} justify-start"
							>
								<span class="{iconClass} preset-tonal-primary" aria-hidden="true">
									<Share size="18" />
								</span>
								<span class="font-medium">{m.shareLink}</span>
							</a>
						{/snippet}
					</Menu.Item>
				{/if}
				<Menu.Item value="account" valueText={accountMessages.accountPrivacy}>
					{#snippet element(attributes)}
						<a
							{...attributes as HTMLAttributes<HTMLAnchorElement>}
							href={resolve('/(site)/account')}
							class="{itemClass} justify-start"
						>
							<span class="{iconClass} preset-tonal" aria-hidden="true">
								<ShieldCheck size="18" />
							</span>
							<span class="font-medium">{accountMessages.accountPrivacy}</span>
						</a>
					{/snippet}
				</Menu.Item>
				{#if feedbackEnabled}
					<Menu.Item value="feedback" valueText={m.sendFeedback} class="{itemClass} justify-start">
						<span class="{iconClass} preset-tonal" aria-hidden="true">
							<ChatBubbleLeftEllipsis size="18" />
						</span>
						<span class="font-medium">{m.sendFeedback}</span>
					</Menu.Item>
				{/if}
				<Menu.Item value="logout" valueText={m.logOut} class="{itemClass} justify-start">
					<span class="{iconClass} preset-tonal" aria-hidden="true">
						<ArrowRightStartOnRectangle size="18" />
					</span>
					<span class="font-medium">{m.logOut}</span>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
<p class="sr-only" role="status" aria-live="polite">{statusText}</p>
