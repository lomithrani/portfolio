<!--
@component
A mutual interest as its candidate reads it in their list of /opportunities (readMutualInterest of
#services/matching.ts): the job they said yes to (the version they read then: never who posted it),
the day both became interested, where it stands (going on, ended by them, by the recruiter, or the
job no longer open), whether the job description was edited since, their score of it then, and
what they can do: open the job's private page, end it (the page asks first). How a meeting is
booked is said once, above the list (the view's intro), and on the job's private page. `fresh`: not seen before this showing (the page marks it seen as it shows it).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { BuildingOffice2, DocumentText, HandThumbUp, XMark } from 'svelte-heros-v2';
	import {
		matchedOnText,
		mutualInterestChangeText,
		mutualInterestStateText,
		type CandidateMutualInterest
	} from '#services/matching.ts';
	import { m } from './CandidateInterest.messages.ts';

	let {
		interest,
		fresh = false,
		onEnd
	}: {
		interest: CandidateMutualInterest;
		fresh?: boolean;
		/** "End it": the page asks first */
		onEnd: (interest: CandidateMutualInterest) => void;
	} = $props();

	const uid = $props.id();
	let job = $derived(interest.job);
	let going = $derived(!interest.endedAt);
	let change = $derived(mutualInterestChangeText(interest));
	let title = $derived(job ? job.title : m.untitled);
	/** A button's label wraps rather than run past it on a narrow phone (in French) */
	const button = 'btn min-h-11 max-w-full whitespace-normal text-center leading-5';
</script>

<article
	class="card preset-outlined-surface-200-800 space-y-3 bg-surface-50-950 p-4 sm:p-5"
	aria-labelledby="{uid}-title"
	data-interest={interest._id}
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
			<span class="badge preset-filled-error-500" data-interest-new>{m.new}</span>
		{/if}
	</div>
	<!-- Takes the focus back once "End it" closed its dialog (the button is gone) -->
	<h3
		id="{uid}-title"
		tabindex="-1"
		class="rounded-base text-lg font-bold break-words outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
	>
		{title}
	</h3>
	{#if job?.company}
		<p class="flex items-center gap-1.5 text-surface-700-300">
			<BuildingOffice2 size="18" class="shrink-0" aria-hidden="true" />
			<span class="min-w-0 break-words">{job.company}</span>
		</p>
	{/if}
	<p class="text-sm text-surface-700-300">{matchedOnText(interest.matchedAt)}</p>
	<p class="text-sm">{m.scoreThen(interest.score, interest.minScore)}</p>
	{#if change}
		<p class="text-sm text-surface-700-300" data-interest-changed>{change}</p>
	{/if}
	{#if job || going}
		<div class="flex flex-wrap gap-2 pt-1">
			{#if job}
				<a
					class="{button} preset-tonal"
					href={resolve('/(app)/opportunities/[id]', { id: job._id })}
					aria-label={m.openNamed(title)}
				>
					<DocumentText size="18" class="shrink-0" aria-hidden="true" />
					{m.open}
				</a>
			{/if}
			{#if going}
				<button
					type="button"
					class="{button} preset-tonal-error"
					aria-label={m.endNamed(title)}
					onclick={() => onEnd(interest)}
				>
					<XMark size="18" class="shrink-0" aria-hidden="true" />
					{m.end}
				</button>
			{/if}
		</div>
	{/if}
</article>
