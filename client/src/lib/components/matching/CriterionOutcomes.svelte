<!--
@component
How a job does on each criterion of a candidate's perfect job: one line per criterion, its name
and its outcome (matches, partly, does not match, not stated, could not be computed), a
deal-breaker missed flagged, then, with the commute among them, what the commute counts and who
the travel times come from. Never what the candidate asks for, nor a criterion's importance: only
what the API gives (the job match step's view, the outcomes beside an anonymous card, a job
proposed to the candidate). `audience` is who reads it: the recruiter whose job it is ("Not stated
in your job description", the candidate named by `ownerName`), or the candidate ("Not stated in
the job description", their own travel time). The heading around it is the caller's.
-->
<script lang="ts">
	import { Check, Minus, QuestionMarkCircle, XMark } from 'svelte-heros-v2';
	import { PERFECT_JOB_CRITERION_LABELS } from 'portfolio-common';
	import {
		jobMatchOutcomeText,
		type JobMatchCriterion,
		type OutcomeAudience,
		type TransitProvider
	} from '#services/workflow.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './CriterionOutcomes.messages.ts';

	let {
		criteria,
		audience,
		ownerName = '',
		transit
	}: {
		criteria: readonly JobMatchCriterion[];
		audience: OutcomeAudience;
		/** The candidate's name, as the recruiter reads the commute's line (`audience` recruiter) */
		ownerName?: string;
		/** The public transport service the travel times come from, to credit it */
		transit?: TransitProvider;
	} = $props();

	let commute = $derived(criteria.some((entry) => entry.criterion === 'commute'));
</script>

<ul class="divide-y divide-surface-200-800 rounded-container border border-surface-200-800">
	{#each criteria as entry (entry.criterion)}
		<li class="flex items-start gap-3 px-3 py-2 text-sm">
			<span
				class={[
					'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
					entry.outcome === 'match'
						? 'preset-filled-success-500'
						: entry.outcome === 'partial'
							? 'preset-filled-warning-500'
							: entry.outcome === 'unknown'
								? 'preset-tonal'
								: 'preset-filled-error-500'
				]}
				aria-hidden="true"
			>
				{#if entry.outcome === 'match'}
					<Check size="12" />
				{:else if entry.outcome === 'partial'}
					<Minus size="12" />
				{:else if entry.outcome === 'unknown'}
					<QuestionMarkCircle size="14" />
				{:else}
					<XMark size="12" />
				{/if}
			</span>
			<span class="min-w-0 flex-1">
				<span class="font-medium">{PERFECT_JOB_CRITERION_LABELS[entry.criterion]}</span>
				<span class="text-surface-700-300">· {jobMatchOutcomeText(entry, audience)}</span>
			</span>
			{#if entry.dealBreaker}
				<span class="badge preset-filled-error-500 shrink-0">{m.dealBreaker}</span>
			{/if}
		</li>
	{/each}
</ul>
{#if commute}
	<p class="text-xs text-surface-700-300">
		{audience === 'recruiter' ? m.commute.recruiter(ownerName) : m.commute.candidate}
		<Rich text={m.commuteSources[transit ?? 'none']}>
			{#snippet ign(text)}<a
					class="underline underline-offset-2"
					href="https://geoservices.ign.fr/"
					target="_blank"
					rel="noreferrer">{text}</a
				>{/snippet}
			{#snippet here(text)}<a
					class="underline underline-offset-2"
					href="https://www.here.com/"
					target="_blank"
					rel="noreferrer">{text}</a
				>{/snippet}
			{#snippet transitous(text)}<a
					class="underline underline-offset-2"
					href="https://transitous.org/sources/"
					target="_blank"
					rel="noreferrer">{text}</a
				>{/snippet}
			{#snippet osm(text)}<a
					class="underline underline-offset-2"
					href="https://www.openstreetmap.org/copyright"
					target="_blank"
					rel="noreferrer">{text}</a
				>{/snippet}
		</Rich>
	</p>
{/if}
