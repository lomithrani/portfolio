<!--
@component
One criterion of the owner's perfect job (PerfectJobTab.svelte): a switch that makes it count,
and once it does, what is asked (the criterion's own controls, given as children), how much it
matters (1 to 5: its weight in a job's score) and whether it is a deal-breaker. `rating` is the
criterion's part of the form, changed in place.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import {
		IMPORTANCE_LABELS,
		IMPORTANCE_LEVELS,
		PERFECT_JOB_CRITERION_LABELS,
		type PerfectJobCriterion
	} from 'portfolio-common';
	import type { CriterionForm } from '#services/perfectJob.ts';

	let {
		criterion,
		description,
		rating = $bindable(),
		share,
		disabled = false,
		idPrefix,
		children
	}: {
		criterion: PerfectJobCriterion;
		/** What the criterion asks of a job, and how a job matches it */
		description: string;
		rating: CriterionForm;
		/** How much of the score it counts for, in percent, while it is on */
		share: number | undefined;
		disabled?: boolean;
		/** Unique in the page: prefix of the element ids */
		idPrefix: string;
		children: Snippet;
	} = $props();

	let label = $derived(PERFECT_JOB_CRITERION_LABELS[criterion]);
	let id = $derived(`${idPrefix}-${criterion}`);
</script>

<div
	class={[
		'card space-y-4 border p-4 sm:p-5',
		rating.enabled ? 'border-primary-500/60' : 'border-surface-200-800'
	]}
	role="group"
	aria-labelledby="{id}-name"
	data-criterion={criterion}
>
	<Switch
		class="flex w-full items-start gap-3"
		checked={rating.enabled}
		{disabled}
		onCheckedChange={(details) => (rating.enabled = details.checked)}
	>
		<Switch.Control class="mt-0.5 shrink-0">
			<Switch.Thumb />
		</Switch.Control>
		<Switch.Label class="min-w-0 flex-1 cursor-pointer space-y-0.5">
			<span class="block text-base font-semibold" id="{id}-name">{label}</span>
			<span class="block text-sm font-normal text-surface-700-300">{description}</span>
		</Switch.Label>
		<Switch.HiddenInput />
	</Switch>

	{#if rating.enabled}
		{@render children()}

		<div class="space-y-3 border-t border-surface-200-800 pt-4">
			<fieldset class="space-y-1.5" {disabled}>
				<legend class="label-text text-sm">How much it matters</legend>
				<div class="flex flex-wrap gap-1.5">
					{#each IMPORTANCE_LEVELS as level (level)}
						<label
							class={[
								'btn btn-sm relative min-h-10 min-w-10 has-focus-visible:ring-2 has-focus-visible:ring-primary-500',
								rating.importance === level ? 'preset-filled-primary-700-300' : 'preset-tonal'
							]}
						>
							<!-- Over the whole button: the click and the focus are the radio's own -->
							<input
								class="absolute inset-0 cursor-pointer opacity-0"
								type="radio"
								name="{id}-importance"
								value={level}
								aria-label="{level}: {IMPORTANCE_LABELS[level]}"
								bind:group={rating.importance}
							/>
							{level}
						</label>
					{/each}
				</div>
				<p class="text-xs text-surface-700-300" data-importance>
					{IMPORTANCE_LABELS[rating.importance]}{share === undefined
						? ''
						: ` · counts for ${share}% of the score`}
				</p>
			</fieldset>
			<label class="flex items-start gap-3">
				<input
					class="checkbox mt-0.5"
					type="checkbox"
					bind:checked={rating.dealBreaker}
					{disabled}
					aria-describedby="{id}-breaker-help"
				/>
				<span class="space-y-0.5">
					<span class="block text-sm">Deal-breaker</span>
					<span class="block text-xs text-surface-700-300" id="{id}-breaker-help">
						A job that does not match it at all scores 0, whatever the rest.
					</span>
				</span>
			</label>
		</div>
	{/if}
</div>
