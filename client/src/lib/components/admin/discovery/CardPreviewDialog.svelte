<!--
@component
The candidate's anonymous card exactly as recruiters read it before both are interested (GET
/discovery/card, read each time the dialog opens, drawn by the CandidateCard recruiters see), the
criteria whose outcome a recruiter reads beside it (only those: never what is asked, the commute or
the places), and what it leaves out of what the candidate set, and why, for them to change: a
headline that says who they are, the experiences they hid, a role whose title says who they are,
one not started yet, one over the roles a card lists, a skill whose name says who they are. The card
is the one saved: changes not saved yet are said not to be in it.
-->
<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { XMark } from 'svelte-heros-v2';
	import { MATCHING_LIMITS, PERFECT_JOB_CRITERION_LABELS, intlLocale } from 'portfolio-common';
	import {
		loadCardPreview,
		type CardExperience,
		type CardPreviewLoad
	} from '#services/discovery.ts';
	import CandidateCard from '#components/matching/CandidateCard.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { m } from './discovery.messages.ts';

	let {
		open,
		experiences,
		unsaved = false,
		onClose,
		returnFocus
	}: {
		open: boolean;
		/** The portfolio's experiences: a role left out is named by its title */
		experiences: readonly CardExperience[];
		/** The card's settings hold changes not saved yet */
		unsaved?: boolean;
		onClose: () => void;
		/** Where the focus goes once it closes (the button that opened it) */
		returnFocus?: () => HTMLElement | null;
	} = $props();

	const uid = $props.id();
	let load = $state.raw<CardPreviewLoad | null>(null);
	let request: AbortController | undefined;
	let closeButton: HTMLButtonElement | undefined = $state();

	async function read() {
		request?.abort();
		const current = new AbortController();
		request = current;
		load = null;
		const result = await loadCardPreview(current.signal);
		if (!current.signal.aborted) load = result;
	}

	// Read each time it opens: the card follows what was saved since
	$effect(() => {
		if (open) void read();
		else request?.abort();
	});

	const list = (items: readonly string[]) =>
		new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(items);

	const titleOf = (id: string) =>
		experiences.find((experience) => experience.id === id)?.title || m.card.untitled;

	const roleText = (title: string, reason: 'hidden' | 'title' | 'upcoming' | 'limit') =>
		reason === 'limit'
			? m.preview.role.limit(title, MATCHING_LIMITS.roles)
			: m.preview.role[reason](title);
</script>

<Dialog
	{open}
	onOpenChange={(details) => {
		if (!details.open) onClose();
	}}
	initialFocusEl={() => closeButton ?? null}
	finalFocusEl={() => returnFocus?.() ?? null}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner
			class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
		>
			<Dialog.Content
				class="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-container border-t border-surface-200-800 bg-surface-50-950 text-surface-950-50 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-xl sm:rounded-container sm:border"
				data-card-preview
			>
				<div class="flex items-start gap-3 border-b border-surface-200-800 px-4 py-4 sm:px-6">
					<div class="min-w-0 flex-1">
						<Dialog.Title>
							{#snippet element(attributes)}
								<h2 {...attributes} class="text-lg font-semibold">{m.preview.title}</h2>
							{/snippet}
						</Dialog.Title>
						<Dialog.Description>
							{#snippet element(attributes)}
								<p {...attributes} class="mt-1 text-sm text-surface-700-300">
									{m.preview.description}
								</p>
							{/snippet}
						</Dialog.Description>
					</div>
					<button
						bind:this={closeButton}
						type="button"
						class="btn-icon size-10 shrink-0 hover:preset-tonal"
						aria-label={common.close}
						onclick={onClose}
					>
						<XMark size="20" aria-hidden="true" />
					</button>
				</div>

				<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
					{#if unsaved}
						<p class="card preset-tonal-warning p-3 text-sm" role="note">{m.preview.unsaved}</p>
					{/if}
					{#if load === null}
						<p class="text-sm opacity-60" role="status">{m.preview.loading}</p>
					{:else if load.kind !== 'ready'}
						<div class="card preset-tonal-error space-y-3 p-4" role="alert">
							<p class="text-sm">{m.preview.failed}</p>
							<button type="button" class="btn btn-sm preset-tonal" onclick={read}>
								{common.retry}
							</button>
						</div>
					{:else}
						{@const { card, outcomes, withheld } = load.preview}
						<CandidateCard {card} headingLevel={3} />
						<p class="text-sm" data-preview-outcomes>
							{outcomes.length > 0
								? m.preview.outcomes(
										list(outcomes.map((criterion) => PERFECT_JOB_CRITERION_LABELS[criterion]))
									)
								: m.preview.noOutcomes}
						</p>
						{#if withheld.headline || withheld.roles.length > 0 || withheld.skills.length > 0}
							<section class="space-y-2" aria-labelledby="{uid}-withheld" data-withheld>
								<h3 id="{uid}-withheld" class="text-sm font-semibold">
									{m.preview.withheld}
								</h3>
								<ul class="list-disc space-y-1 ps-5 text-sm text-surface-700-300">
									{#if withheld.headline}
										<li>{m.preview.headline}</li>
									{/if}
									{#each withheld.roles as role (role.experience)}
										<li>{roleText(titleOf(role.experience), role.reason)}</li>
									{/each}
									{#if withheld.skills.length > 0}
										<li>{m.preview.skills(list(withheld.skills))}</li>
									{/if}
								</ul>
							</section>
						{/if}
					{/if}
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
