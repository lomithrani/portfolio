<!--
@component
The job match step of a portfolio's hiring journey: the job the recruiter picked on the job step
is scored out of 100 against the owner's perfect job, and the steps after it open from the
minimum the owner set. Nothing is submitted here: the API computes the score at each read, from
the job description and the owner's criteria as they are now (the step's `view`). It shows the
score against the minimum and, when the owner shares them, how the job does on each criterion
(never what the owner asks for). Under the minimum, the recruiter can edit the job description or
pick another one on the job step, then check again.
Not for the portfolio's owner: the page shows them the step's description instead.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowPath,
		Check,
		Minus,
		PencilSquare,
		QuestionMarkCircle,
		XMark
	} from 'svelte-heros-v2';
	import { PERFECT_JOB_CRITERION_LABELS } from 'portfolio-common';
	import {
		jobMatch,
		jobMatchMinScore,
		jobMatchOutcomeText,
		passesJobMatch
	} from '#services/workflow.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './steps.messages';
	import type { StepProps } from './types';

	let { step, ownerName, reload }: StepProps = $props();

	const uid = $props.id();

	let match = $derived(jobMatch(step.view));
	let passed = $derived(match !== undefined && passesJobMatch(match));
	let minScore = $derived(match?.minScore ?? jobMatchMinScore(step.config));
	let dealBreaker = $derived(match?.criteria?.some((entry) => entry.dealBreaker) ?? false);
</script>

{#if !match}
	<p class="text-sm">
		{minScore === undefined ? m.jobMatch.ask(ownerName) : m.jobMatch.askMin(ownerName, minScore)}
	</p>
{:else}
	<div class="space-y-4">
		<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
			<p
				class={[
					'flex shrink-0 items-baseline gap-1 rounded-container px-4 py-2',
					passed ? 'preset-tonal-success' : 'preset-tonal-error'
				]}
				id="{uid}-score"
			>
				<span class="sr-only">{m.jobMatch.score}</span>
				<span class="text-4xl font-bold tabular-nums">{match.score}</span>
				<span class="text-sm" aria-hidden="true">/ 100</span>
				<span class="sr-only">{m.jobMatch.outOf100}</span>
			</p>
			<div class="min-w-0 flex-1 basis-56 space-y-1">
				<p class="font-semibold break-words">
					{#if passed}
						{m.jobMatch.closeEnough(match.job.title, ownerName)}
					{:else}
						{m.jobMatch.notCloseEnough(match.job.title, ownerName)}
					{/if}
				</p>
				<p class="text-sm text-surface-700-300">
					{m.jobMatch.asksFor(ownerName, match.minScore)}
				</p>
			</div>
		</div>

		<!-- The score on its scale, with the minimum marked: said in words above -->
		<div class="relative pt-1 pb-5" aria-hidden="true">
			<div class="h-2 overflow-hidden rounded-full bg-surface-200-800">
				<div
					class={['h-full rounded-full', passed ? 'bg-success-500' : 'bg-error-500']}
					style:width="{match.score}%"
				></div>
			</div>
			<div
				class="absolute top-0 h-4 w-0.5 -translate-x-1/2 bg-surface-950-50"
				style:left="{match.minScore}%"
			></div>
			<span
				class={[
					'absolute top-5 text-xs whitespace-nowrap text-surface-700-300',
					match.minScore > 85 ? 'right-0' : match.minScore < 15 ? 'left-0' : '-translate-x-1/2'
				]}
				style:left={match.minScore > 85 || match.minScore < 15 ? undefined : `${match.minScore}%`}
			>
				{m.jobMatch.minimum(match.minScore)}
			</span>
		</div>

		{#if match.criteria && match.criteria.length > 0}
			<section class="space-y-2" aria-labelledby="{uid}-criteria">
				<h3 class="text-sm font-semibold" id="{uid}-criteria">
					{m.jobMatch.criteria(ownerName)}
				</h3>
				<ul class="divide-y divide-surface-200-800 rounded-container border border-surface-200-800">
					{#each match.criteria as entry (entry.criterion)}
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
								<span class="text-surface-700-300">· {jobMatchOutcomeText(entry)}</span>
							</span>
							{#if entry.dealBreaker}
								<span class="badge preset-filled-error-500 shrink-0">{m.jobMatch.dealBreaker}</span>
							{/if}
						</li>
					{/each}
				</ul>
				{#if match.criteria.some((entry) => entry.criterion === 'commute')}
					<p class="text-xs text-surface-700-300">
						{m.jobMatch.commute(ownerName)}
						<Rich text={m.jobMatch.commuteSources}>
							{#snippet ign(text)}<a
									class="underline underline-offset-2"
									href="https://geoservices.ign.fr/"
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
				{#if dealBreaker}
					<p class="text-sm">{m.jobMatch.dealBreakerMissed(ownerName)}</p>
				{/if}
			</section>
		{/if}

		{#if !passed}
			<div class="space-y-3">
				<p class="text-sm">
					{#if match.criteria && match.criteria.length > 0}
						{m.jobMatch.raiseWithDetails}
					{:else}
						{m.jobMatch.raiseWithoutDetails(ownerName)}
					{/if}
					{m.jobMatch.pickAnother}
				</p>
				<div class="flex flex-wrap gap-2">
					<a
						class="btn preset-tonal min-h-11"
						href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: match.job._id })}
					>
						<PencilSquare size="18" aria-hidden="true" />
						{m.jobMatch.edit}
					</a>
					<button type="button" class="btn preset-tonal min-h-11" onclick={() => reload()}>
						<ArrowPath size="18" aria-hidden="true" />
						{m.jobMatch.checkAgain}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
