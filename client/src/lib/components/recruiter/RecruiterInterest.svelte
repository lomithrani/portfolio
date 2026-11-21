<!--
@component
A mutual interest as its recruiter reads it (readMutualInterest of #services/matching.ts), on the
dashboard or in a job's matching panel: the candidate's portfolio once revealed (its title, or its
address name: never a name or an email address), the job it is on (left out in that job's own
panel: `showJob`), the day both became interested, where it stands (going on, ended by them, by the
candidate, or the job no longer open), whether the job description was edited since, and what they
can do while it lasts: go through the candidate's page for recruiters (which holds their job) to
book a meeting, see the portfolio, end it (the list asks first). `fresh`: not seen before this
showing (the list marks it seen as it shows it). Never a bare "match" (decision 11).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, Briefcase, HandThumbUp, UserCircle, XMark } from 'svelte-heros-v2';
	import {
		matchedOnText,
		mutualInterestChangeText,
		mutualInterestStateText,
		type RecruiterMutualInterest
	} from '#services/matching.ts';
	import { m } from './RecruiterMatches.messages.ts';

	let {
		interest,
		fresh = false,
		showJob = true,
		headingLevel = 3,
		onEnd
	}: {
		interest: RecruiterMutualInterest;
		fresh?: boolean;
		/** Names the job it is on, with a link to its page (not in that job's own panel) */
		showJob?: boolean;
		headingLevel?: 3 | 5;
		/** "End it": the list asks first */
		onEnd: (interest: RecruiterMutualInterest) => void;
	} = $props();

	const uid = $props.id();
	let candidate = $derived(interest.candidate);
	let going = $derived(!interest.endedAt);
	let change = $derived(mutualInterestChangeText(interest));
	let titleTag = $derived(`h${headingLevel}`);
	/** A button's label wraps rather than run past it on a narrow phone (in French) */
	const button = 'btn min-h-11 max-w-full whitespace-normal text-center leading-5';
</script>

<article
	class="card preset-outlined-surface-200-800 space-y-3 bg-surface-50-950 p-4 sm:p-5"
	aria-labelledby="{uid}-title"
	data-recruiter-interest={interest._id}
>
	<div class="flex flex-wrap items-center gap-2">
		<span
			class={['badge', going ? 'preset-tonal-primary' : 'preset-tonal-surface']}
			data-interest-state
		>
			{#if going}<HandThumbUp size="14" aria-hidden="true" />{/if}
			{mutualInterestStateText(interest)}
		</span>
		{#if fresh}
			<span class="badge preset-filled-error-500" data-interest-new>{m.item.new}</span>
		{/if}
	</div>
	<!-- Takes the focus back once "End it" closed its dialog (the button is gone) -->
	<svelte:element
		this={titleTag}
		id="{uid}-title"
		tabindex="-1"
		class="flex min-w-0 items-center gap-2 rounded-base text-lg font-bold break-words outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
	>
		<UserCircle size="20" class="shrink-0" aria-hidden="true" />
		<span class="min-w-0 break-words">
			{candidate ? (candidate.title ?? candidate.domain) : m.item.notRevealed}
		</span>
	</svelte:element>
	{#if showJob}
		<p class="flex min-w-0 items-center gap-1.5 text-sm">
			<Briefcase size="16" class="shrink-0" aria-hidden="true" />
			<a
				href={resolve('/(app)/recruiter/jobs/[id]', { id: interest.job._id })}
				class="min-w-0 font-medium break-words underline underline-offset-2"
			>
				{interest.job.title}
			</a>
		</p>
	{/if}
	<p class="text-sm text-surface-700-300">{matchedOnText(interest.matchedAt)}</p>
	{#if change}
		<p class="text-sm text-surface-700-300" data-interest-changed>{change}</p>
	{/if}
	{#if going && candidate}
		<p class="text-sm">{m.item.next}</p>
	{/if}
	{#if candidate || going}
		<div class="flex flex-wrap gap-2 pt-1">
			{#if candidate && going}
				<a
					class="{button} preset-filled-primary-500"
					href={resolve('/[domain]/hire', { domain: candidate.domain })}
				>
					<ArrowRight size="18" class="shrink-0" aria-hidden="true" />
					{m.item.pageForRecruiters}
				</a>
			{/if}
			{#if candidate}
				<a
					class="{button} preset-tonal"
					href={resolve('/[domain]/experiences', { domain: candidate.domain })}
					target="_blank"
					rel="noopener"
				>
					<UserCircle size="18" class="shrink-0" aria-hidden="true" />
					{m.item.portfolio}
					<span class="sr-only">{m.item.newTab}</span>
				</a>
			{/if}
			{#if going}
				<button type="button" class="{button} preset-tonal-error" onclick={() => onEnd(interest)}>
					<XMark size="18" class="shrink-0" aria-hidden="true" />
					{m.item.end}
				</button>
			{/if}
		</div>
	{/if}
</article>
