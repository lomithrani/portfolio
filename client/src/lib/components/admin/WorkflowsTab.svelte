<!--
@component
The owner's hiring journey (GET, PUT /workflow): which steps recruiters go through on the Hire
page, in the catalogue's order (portfolio-common WORKFLOW_STEPS). Each step is switched on or
off; a journey the API would refuse (a step that opens nothing) says why and cannot be saved.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { Eye } from 'svelte-heros-v2';
	import {
		WORKFLOW_STEPS,
		WORKFLOW_STEP_TYPES,
		workflowStepsProblem,
		type WorkflowStepType
	} from 'portfolio-common';
	import { portfolioApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication } from '#services/authentication.ts';
	import { SESSION_EXPIRED_MESSAGE } from '#services/account.ts';
	import { NETWORK_ERROR, failureText } from '#services/recruiter.ts';
	import { toaster } from '#services/toaster.ts';
	import { journeySummary, sameSteps, withStep } from '#services/workflow.ts';

	let { domainName }: { domainName: string } = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const LOAD_FAILED = 'Could not load your hiring journey.';
	const SAVE_FAILED = 'Could not save your hiring journey. Try again.';

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let loadError = $state('');
	/** The steps as saved */
	let saved = $state<WorkflowStepType[]>([]);
	/** The steps as edited */
	let steps = $state<WorkflowStepType[]>([]);
	let saving = $state(false);
	let saveError = $state('');

	let problem = $derived(workflowStepsProblem(steps));
	let changed = $derived(!sameSteps(steps, saved));

	const failure = (error: { status: unknown; value?: unknown }, fallback: string) => {
		if (errorStatus(error) === 401) {
			clearAuthentication();
			return SESSION_EXPIRED_MESSAGE;
		}
		return failureText(error.value, fallback);
	};

	async function load() {
		status = 'loading';
		try {
			const { data, error } = await portfolioApi.workflow.get(withCredentials);
			if (error || !data) {
				loadError = error ? failure(error, LOAD_FAILED) : LOAD_FAILED;
				status = 'error';
				return;
			}
			saved = data.steps.map((step) => step.type);
			steps = [...saved];
			status = 'ready';
		} catch {
			loadError = NETWORK_ERROR;
			status = 'error';
		}
	}

	async function save() {
		if (problem || saving) return;
		saving = true;
		saveError = '';
		try {
			const { data, error } = await portfolioApi.workflow.put(
				{ steps: steps.map((type) => ({ type })) },
				withCredentials
			);
			if (error || !data) {
				saveError = error ? failure(error, SAVE_FAILED) : SAVE_FAILED;
				return;
			}
			saved = data.steps.map((step) => step.type);
			steps = [...saved];
			toaster.success({ title: 'Hiring journey saved', description: journeySummary(saved) });
		} catch {
			saveError = NETWORK_ERROR;
		} finally {
			saving = false;
		}
	}

	onMount(load);
</script>

<div class="space-y-6">
	<section class="space-y-2">
		<h2 class="h3">Hiring journey</h2>
		<p class="opacity-75">
			Choose the steps recruiters go through on your Hire page. Each step opens once the ones before
			it are done.
		</p>
	</section>

	{#if status === 'loading'}
		<p class="text-sm opacity-50" role="status">Loading your hiring journey...</p>
	{:else if status === 'error'}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{loadError}</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={load}>Try again</button>
		</div>
	{:else}
		<ol class="space-y-3" aria-label="Steps">
			{#each WORKFLOW_STEP_TYPES as type (type)}
				{@const on = steps.includes(type)}
				{@const position = steps.indexOf(type) + 1}
				<li
					class={[
						'card flex items-start gap-4 border p-4 sm:p-5',
						on ? 'border-primary-500/60' : 'border-surface-200-800'
					]}
				>
					<span
						class={[
							'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
							on ? 'preset-filled-primary-500' : 'preset-tonal opacity-60'
						]}
						aria-hidden="true"
					>
						{on ? position : '–'}
					</span>
					<div class="min-w-0 flex-1 space-y-1">
						<h3 class="font-semibold" id="{uid}-{type}">{WORKFLOW_STEPS[type].label}</h3>
						<p class="text-sm text-surface-700-300">{WORKFLOW_STEPS[type].description}</p>
						<p class="text-xs opacity-60">
							{WORKFLOW_STEPS[type].kind === 'access'
								? 'What the journey leads to.'
								: 'Asked before the steps it opens.'}
						</p>
					</div>
					<Switch
						class="shrink-0"
						checked={on}
						disabled={saving}
						onCheckedChange={(details) => (steps = withStep(steps, type, details.checked))}
					>
						<Switch.Control>
							<Switch.Thumb />
						</Switch.Control>
						<Switch.Label class="sr-only">{WORKFLOW_STEPS[type].label}</Switch.Label>
						<Switch.HiddenInput />
					</Switch>
				</li>
			{/each}
		</ol>

		<!-- What recruiters will go through, or why it cannot be saved -->
		<div aria-live="polite">
			{#if problem}
				<p class="card preset-tonal-warning p-3 text-sm" role="alert">{problem}</p>
			{:else}
				<p class="text-sm">{journeySummary(steps)}</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<button
				type="button"
				class="btn preset-filled-primary-700-300"
				disabled={!changed || !!problem || saving}
				onclick={save}
			>
				{saving ? 'Saving...' : 'Save journey'}
			</button>
			{#if changed}
				<button
					type="button"
					class="btn preset-tonal"
					disabled={saving}
					onclick={() => (steps = [...saved])}
				>
					Undo changes
				</button>
			{/if}
			<a class="btn hover:preset-tonal" href={resolve('/[domain]/hire', { domain: domainName })}>
				<Eye size="18" aria-hidden="true" />
				See your Hire page
			</a>
		</div>
		{#if saveError}
			<p class="text-sm text-error-700-300" role="alert">{saveError}</p>
		{/if}
	{/if}
</div>
