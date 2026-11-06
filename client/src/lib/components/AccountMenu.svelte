<!--
@component
The signed-in account's menu in the header: its initials and current space on the trigger, then
the two spaces (radio items: the active one is checked), Browse jobs and Log out. Choosing a space
records it (PUT /me/mode: the recruiter space is created the first time) and opens its home; a
candidate without a portfolio is sent to the claim form instead (`onClaimPortfolio`).
-->
<script module lang="ts">
	/** The trigger's id: where the focus goes back once the space chooser closes */
	export const ACCOUNT_MENU_TRIGGER_ID = 'account-menu-trigger';
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		ArrowRightStartOnRectangle,
		Briefcase,
		Check,
		ChevronDown,
		MagnifyingGlass,
		UserCircle
	} from 'svelte-heros-v2';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { UserMode } from 'portfolio-common';
	import { logout } from '#services/authentication.ts';
	import { spaceLabel, switchMode, userDisplayName, userInitials } from '#services/account.ts';
	import type { AuthUser } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';

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
	let triggerLabel = $derived(
		`Account menu: ${name}${currentLabel ? `, ${currentLabel} space` : ''}`
	);
	let statusText = $derived(
		pending === 'recruiter'
			? 'Opening your recruiter space…'
			: pending === 'candidate'
				? 'Opening your portfolio…'
				: ''
	);

	async function openCandidateSpace() {
		const domain = user.domain;
		if (!domain) {
			onClaimPortfolio();
			return;
		}
		pending = 'candidate';
		const result = await switchMode('candidate');
		pending = null;
		if (!result.ok && result.reason === 'session-expired') {
			toaster.error({ title: result.message });
			return;
		}
		// Any other failure only leaves the choice unrecorded: the portfolio is public
		await goto(resolve('/[domain]/experiences', { domain }));
	}

	async function openRecruiterSpace() {
		pending = 'recruiter';
		const result = await switchMode('recruiter');
		pending = null;
		if (!result.ok) {
			toaster.error({ title: result.message });
			return;
		}
		await goto(resolve('/(app)/recruiter'));
	}

	function select({ value }: { value: string }) {
		if (pending) return;
		if (value === 'candidate') void openCandidateSpace();
		else if (value === 'recruiter') void openRecruiterSpace();
		else if (value === 'logout') void logout();
		// 'jobs' is a link: the browser follows it
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
			class="grid size-8 shrink-0 place-items-center rounded-full preset-filled-primary-500 text-xs font-bold"
			aria-hidden="true"
		>
			{initials}
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
					<Menu.ItemGroupLabel>Spaces</Menu.ItemGroupLabel>
					<Menu.OptionItem
						type="radio"
						value="candidate"
						valueText="Candidate space"
						checked={user.activeMode === 'candidate'}
						class={itemClass}
					>
						<span class="{iconClass} preset-tonal-primary" aria-hidden="true">
							<UserCircle size="18" />
						</span>
						<Menu.ItemText class="min-w-0 flex-1">
							<span class="block font-medium">Candidate space</span>
							<span class="block truncate text-xs text-surface-700-300">
								{user.domain ? `Your portfolio: ${user.domain}` : 'Claim a portfolio'}
							</span>
						</Menu.ItemText>
						<Menu.ItemIndicator class="text-primary-700-300">
							<Check size="16" aria-hidden="true" />
						</Menu.ItemIndicator>
					</Menu.OptionItem>
					<Menu.OptionItem
						type="radio"
						value="recruiter"
						valueText="Recruiter space"
						checked={user.activeMode === 'recruiter'}
						class={itemClass}
					>
						<span class="{iconClass} preset-tonal-secondary" aria-hidden="true">
							<Briefcase size="18" />
						</span>
						<Menu.ItemText class="min-w-0 flex-1">
							<span class="block font-medium">Recruiter space</span>
							<span class="block truncate text-xs text-surface-700-300">
								{user.recruiter ? 'Your job descriptions' : 'Post job descriptions'}
							</span>
						</Menu.ItemText>
						<Menu.ItemIndicator class="text-primary-700-300">
							<Check size="16" aria-hidden="true" />
						</Menu.ItemIndicator>
					</Menu.OptionItem>
				</Menu.ItemGroup>
				<Menu.Separator />
				<Menu.Item value="jobs" valueText="Browse jobs">
					{#snippet element(attributes)}
						<a
							{...attributes as HTMLAttributes<HTMLAnchorElement>}
							href={resolve('/(app)/jobs')}
							class="{itemClass} justify-start"
						>
							<span class="{iconClass} preset-tonal" aria-hidden="true">
								<MagnifyingGlass size="18" />
							</span>
							<span class="font-medium">Browse jobs</span>
						</a>
					{/snippet}
				</Menu.Item>
				<Menu.Item value="logout" valueText="Log out" class="{itemClass} justify-start">
					<span class="{iconClass} preset-tonal" aria-hidden="true">
						<ArrowRightStartOnRectangle size="18" />
					</span>
					<span class="font-medium">Log out</span>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
<p class="sr-only" role="status" aria-live="polite">{statusText}</p>
