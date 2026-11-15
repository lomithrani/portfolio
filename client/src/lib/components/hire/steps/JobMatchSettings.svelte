<!--
@component
The settings of a job match step in the owner's editor: the score out of 100 a recruiter's job
needs to go further, and whether recruiters also see how their job does on each criterion. The
rules are the manifest's (portfolio-common's JOB_MATCH_STEP_LIMITS): the editor passes what it
says is wrong, shown under the field it is about. The score is computed against the owner's
perfect job (the Perfect job tab, GET /perfect-job): the form says how many criteria it has, and
warns when it has none (every job then scores 100).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { JOB_MATCH_STEP_LIMITS, ratedCriteria } from 'portfolio-common';
	import { portfolioTextApi } from '#services';
	import { jobMatchSettings } from '#services/workflow.ts';
	import { m } from './steps.messages';
	import type { SettingsProps } from './types';

	let { config, onChange, problem, disabled, idPrefix }: SettingsProps = $props();

	const { min, max } = JOB_MATCH_STEP_LIMITS.minScore;

	let settings = $derived(jobMatchSettings(config));
	let minScoreProblem = $derived(problem?.field === 'minScore' ? problem.message : '');
	/** How many criteria the owner's perfect job has; null until known (or when it cannot be) */
	let criteriaCount = $state<number | null>(null);

	onMount(async () => {
		try {
			const { data } = await portfolioTextApi['perfect-job'].get({
				fetch: { credentials: 'include' }
			});
			if (data) criteriaCount = ratedCriteria(data.criteria).length;
		} catch {
			// Unknown: nothing is said about the criteria
		}
	});
</script>

<div class="space-y-3">
	<div class="space-y-1">
		<label class="label-text" for="{idPrefix}-min-score">{m.jobMatch.settings.minScore}</label>
		<div class="flex items-center gap-2">
			<input
				id="{idPrefix}-min-score"
				class="input w-24"
				type="number"
				inputmode="numeric"
				{min}
				{max}
				step="1"
				value={typeof settings.minScore === 'number' ? settings.minScore : ''}
				{disabled}
				aria-invalid={minScoreProblem ? true : undefined}
				aria-describedby="{idPrefix}-min-score-help"
				oninput={(event) => {
					const value = event.currentTarget.valueAsNumber;
					onChange({ ...settings, minScore: Number.isNaN(value) ? null : value });
				}}
			/>
			<span class="text-sm text-surface-700-300" aria-hidden="true">/ {max}</span>
		</div>
		<p class="text-xs" id="{idPrefix}-min-score-help">
			{#if minScoreProblem}
				<span class="text-error-700-300">{minScoreProblem}</span>
			{:else}
				<span class="text-surface-700-300">{m.jobMatch.settings.minScoreHelp(min)}</span>
			{/if}
		</p>
	</div>
	<label class="flex items-start gap-3">
		<input
			class="checkbox mt-0.5"
			type="checkbox"
			checked={settings.showDetails}
			{disabled}
			aria-describedby="{idPrefix}-details-help"
			onchange={(event) => onChange({ ...settings, showDetails: event.currentTarget.checked })}
		/>
		<span class="space-y-0.5">
			<span class="block text-sm">{m.jobMatch.settings.showDetails}</span>
			<span class="block text-xs text-surface-700-300" id="{idPrefix}-details-help">
				{m.jobMatch.settings.showDetailsHelp}
			</span>
		</span>
	</label>
	{#if criteriaCount === 0}
		<p class="card preset-tonal-warning p-3 text-sm">{m.jobMatch.settings.noCriterion}</p>
	{:else if criteriaCount !== null}
		<p class="text-xs text-surface-700-300">{m.jobMatch.settings.scoredOn(criteriaCount)}</p>
	{/if}
</div>
