<!--
@component
What a candidate still misses to be proposed to recruiters (GET /discovery's `missing`, in the order
of portfolio-common's DISCOVERY_REQUIREMENTS, which the API checks again at the opt-in), each said
as portfolio-common says it (discoveryRequirementMessage, the API's words for its 422 too) with what
fixes it from the Perfect job tab (requirementAction of #services/discovery.ts): the account page
for the terms, the criteria above, the journey's missing steps (added in the Hiring journey tab as
unsaved changes, never saved from here), the calendar's settings. Nothing missing: says so.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, CheckCircle, ExclamationCircle } from 'svelte-heros-v2';
	import { discoveryRequirementMessage, type DiscoveryRequirement } from 'portfolio-common';
	import { requirementAction } from '#services/discovery.ts';
	import { m } from './discovery.messages.ts';

	let {
		missing,
		heading,
		headingLevel = 4,
		onCriteria,
		onJourney,
		onAppointments
	}: {
		missing: readonly DiscoveryRequirement[];
		/** "Before you turn it on" (off), "What is missing" (paused, lapsed) */
		heading: string;
		headingLevel?: 3 | 4;
		/** Shows the criteria above: the pay (`pay`), or the first of them */
		onCriteria: (which: 'pay' | 'criteria') => void;
		/** Adds the gate's missing steps in the Hiring journey tab */
		onJourney: () => void;
		/** Shows the calendar's settings (the Appointments tab) */
		onAppointments: () => void;
	} = $props();

	const uid = $props.id();
	const button =
		'btn btn-sm preset-tonal max-w-full whitespace-normal text-center leading-5 py-0.75';
</script>

<section class="space-y-2" aria-labelledby="{uid}-heading" data-discovery-checklist>
	<svelte:element this={`h${headingLevel}`} id="{uid}-heading" class="text-sm font-semibold">
		{heading}
	</svelte:element>
	{#if missing.length === 0}
		<p class="flex items-start gap-2 text-sm">
			<CheckCircle size="18" class="mt-px shrink-0 text-success-700-300" aria-hidden="true" />
			{m.checklist.ready}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each missing as requirement (requirement)}
				{@const action = requirementAction(requirement)}
				<li
					class="flex flex-col items-start gap-2 rounded-container border border-warning-500/40 p-3 sm:flex-row sm:items-center"
					data-requirement={requirement}
				>
					<p class="flex min-w-0 flex-1 items-start gap-2 text-sm">
						<ExclamationCircle
							size="18"
							class="mt-px shrink-0 text-warning-800-200"
							aria-hidden="true"
						/>
						{discoveryRequirementMessage(requirement)}
					</p>
					{#if action === 'account'}
						<a class="{button} shrink-0" href={resolve('/(site)/account')}>
							{m.checklist.action.account}
							<ArrowRight size="16" aria-hidden="true" />
						</a>
					{:else if action === 'criteria' || action === 'pay'}
						<button type="button" class="{button} shrink-0" onclick={() => onCriteria(action)}>
							{m.checklist.action[action]}
						</button>
					{:else if action === 'journey'}
						<button type="button" class="{button} shrink-0" onclick={onJourney}>
							{m.checklist.action.journey}
							<ArrowRight size="16" aria-hidden="true" />
						</button>
					{:else if action === 'appointments'}
						<button type="button" class="{button} shrink-0" onclick={onAppointments}>
							{m.checklist.action.appointments}
							<ArrowRight size="16" aria-hidden="true" />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
