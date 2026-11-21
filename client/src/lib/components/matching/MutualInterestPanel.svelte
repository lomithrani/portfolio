<!--
@component
The moment both are interested (a decision that made a mutual interest), in place of the next card
until the person goes on: what happens next, from the mutual interest the API gave
(readMutualInterest of #services/matching.ts). The candidate reads that the recruiter now sees
their portfolio and goes through the steps of their page for recruiters to book a meeting, with a
link to the job; the recruiter, the candidate's portfolio (revealed: its address, never a name)
and their page for recruiters, which holds the job. Never a bare "match" (decision 11 of the
founder), and no email is promised: none is sent. A panel in the page, not a dialog: its heading
takes the focus (`headingId`, tabindex -1), "Keep going" gives it back to the deck. Nothing moves.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, DocumentText, HandThumbUp, UserCircle } from 'svelte-heros-v2';
	import type { MutualInterest } from '#services/matching.ts';
	import { m } from './cards.messages.ts';

	let {
		interest,
		headingId,
		headingLevel = 2,
		onContinue
	}: {
		interest: MutualInterest;
		/** The heading's id: the deck moves the focus to it */
		headingId?: string;
		headingLevel?: 2 | 3;
		/** Back to the deck: the next card */
		onContinue: () => void;
	} = $props();

	const uid = $props.id();
	let titleId = $derived(headingId ?? `${uid}-title`);
	let titleTag = $derived(`h${headingLevel}`);
	let jobTitle = $derived(interest.job?.title ?? '');
</script>

<section
	class="card space-y-4 border border-primary-300-700 preset-tonal-primary p-4 sm:p-6"
	aria-labelledby={titleId}
>
	<svelte:element
		this={titleTag}
		id={titleId}
		tabindex="-1"
		class="flex items-center gap-2 text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
	>
		<HandThumbUp size="22" class="shrink-0" aria-hidden="true" />
		{m.mutual.heading}
	</svelte:element>

	{#if interest.side === 'candidate'}
		<p class="break-words">{m.mutual.candidate(jobTitle)}</p>
		<div class="flex flex-wrap gap-2">
			{#if interest.job}
				<a
					class="btn preset-filled-primary-500 min-h-11"
					href={resolve('/(app)/opportunities/[id]', { id: interest.job._id })}
				>
					<DocumentText size="18" aria-hidden="true" />
					{m.mutual.openJob}
				</a>
			{/if}
			<button type="button" class="btn preset-tonal min-h-11" onclick={onContinue}>
				<ArrowRight size="18" aria-hidden="true" />
				{m.mutual.keepGoing}
			</button>
		</div>
	{:else}
		{@const candidate = interest.candidate}
		{#if candidate}
			<p class="break-words">{m.mutual.recruiter(jobTitle)}</p>
			<p class="flex min-w-0 items-center gap-2 font-semibold">
				<UserCircle size="20" class="shrink-0" aria-hidden="true" />
				<span class="min-w-0 break-words">{candidate.title ?? candidate.domain}</span>
			</p>
			<div class="flex flex-wrap gap-2">
				<a
					class="btn preset-filled-primary-500 min-h-11"
					href={resolve('/[domain]/hire', { domain: candidate.domain })}
				>
					<ArrowRight size="18" aria-hidden="true" />
					{m.mutual.pageForRecruiters}
				</a>
				<a
					class="btn preset-tonal min-h-11"
					href={resolve('/[domain]/experiences', { domain: candidate.domain })}
					target="_blank"
					rel="noopener"
				>
					<UserCircle size="18" aria-hidden="true" />
					{m.mutual.portfolio}
					<span class="sr-only">{m.mutual.newTab}</span>
				</a>
				<button type="button" class="btn preset-tonal min-h-11" onclick={onContinue}>
					{m.mutual.keepGoing}
				</button>
			</div>
		{:else}
			<p class="break-words">{m.mutual.notRevealed(jobTitle)}</p>
			<button type="button" class="btn preset-tonal min-h-11" onclick={onContinue}>
				<ArrowRight size="18" aria-hidden="true" />
				{m.mutual.keepGoing}
			</button>
		{/if}
	{/if}
</section>
