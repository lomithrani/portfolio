<!--
@component
"Before you start", on the Hire page: what the journey takes from a recruiter before they start.
What each step asks (unless the journey is a single step, which the page's intro already says),
about how long the steps take, what to have at hand (a Google account, the job description and its
pay range...) and what happens once the step the journey leads to is done. Read from the entries
of the step types (`effort`, and the `goal` of the step the journey leads to: components/hire/steps/)
and from the journey as anyone signed out gets it, so the server renders it: a page without
JavaScript, and a recruiter before they sign in, read it all.
-->
<script lang="ts">
	import { CalendarDays, ClipboardDocumentList, Clock } from 'svelte-heros-v2';
	import { plural } from 'portfolio-common';
	import { clientStep, stepNeedText } from '#components/hire/steps/index.ts';
	import {
		goalStepIndex,
		isBareJourney,
		journeyEffort,
		stepName,
		type Journey
	} from '#services/workflow.ts';
	import { m as workflowMessages } from '#services/workflow.messages.ts';
	import { m } from './BeforeYouStart.messages.ts';

	let { journey, ownerName }: { journey: Journey; ownerName: string } = $props();

	const uid = $props.id();

	let effort = $derived(journeyEffort(journey.steps.map((step) => clientStep(step.type)?.effort)));
	// Once the step the journey leads to is done; nothing for a journey that leads nowhere
	let next = $derived.by(() => {
		const goal = goalStepIndex(journey.steps);
		return goal === -1 ? undefined : clientStep(journey.steps[goal].type)?.goal?.next(ownerName);
	});
</script>

<section
	class="card border border-surface-200-800 space-y-4 p-4 sm:p-6"
	aria-labelledby="{uid}-title"
	data-before-you-start
>
	<h2 class="h4" id="{uid}-title">{m.title}</h2>
	{#if !isBareJourney(journey)}
		<ol class="space-y-3" aria-label={m.steps}>
			{#each journey.steps as step, index (step.id)}
				{@const entry = clientStep(step.type)}
				<li class="flex items-start gap-3 text-sm">
					<span
						class="preset-tonal flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
						aria-hidden="true">{index + 1}</span
					>
					<div class="min-w-0 space-y-0.5 break-words">
						<p class="font-semibold">{stepName(step, entry?.title?.(step))}</p>
						<p class="text-surface-700-300">
							{entry ? entry.effort.asks(step, ownerName) : workflowMessages.stepUnavailable}
						</p>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
	<dl class="space-y-3 text-sm">
		<div>
			<dt class="flex items-center gap-2.5 font-semibold">
				<Clock size="18" class="shrink-0" aria-hidden="true" />
				{m.howLong}
			</dt>
			<dd class="ps-7">
				{plural(effort.minutes, m.minutes.one, m.minutes.other(effort.minutes))}
			</dd>
		</div>
		<div>
			<dt class="flex items-center gap-2.5 font-semibold">
				<ClipboardDocumentList size="18" class="shrink-0" aria-hidden="true" />
				{m.needs}
			</dt>
			<dd class="ps-7">
				{#if effort.needs.length > 0}
					<ul class="list-disc space-y-0.5 ps-4">
						{#each effort.needs as need (need)}
							<li>{stepNeedText(need)}</li>
						{/each}
					</ul>
				{:else}
					{m.nothingNeeded}
				{/if}
			</dd>
		</div>
		{#if next}
			<div>
				<dt class="flex items-center gap-2.5 font-semibold">
					<CalendarDays size="18" class="shrink-0" aria-hidden="true" />
					{m.next}
				</dt>
				<dd class="ps-7">{next}</dd>
			</div>
		{/if}
	</dl>
</section>
