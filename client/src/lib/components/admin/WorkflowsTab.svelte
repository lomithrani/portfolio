<!--
@component
The owner's hiring journey (GET, PUT /workflow): the steps recruiters go through on the Hire
page, in the order chosen here. Steps are added from the step types of portfolio-common
(stepManifests), moved, removed, and set with their type's settings form (the client's registry,
components/hire/steps/). The journey is checked on every change with the rules the API enforces
(parseWorkflow): what is wrong is said at the step and the setting it is about, and the journey
cannot be saved until it is fixed.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { ChevronDown, ChevronUp, Eye, PlusCircle, Trash } from 'svelte-heros-v2';
	import {
		parseWorkflow,
		stepManifest,
		stepManifests,
		type WorkflowProblem,
		type WorkflowStep
	} from 'portfolio-common';
	import { portfolioApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication } from '#services/authentication.ts';
	import { SESSION_EXPIRED_MESSAGE } from '#services/account.ts';
	import { NETWORK_ERROR, failureText } from '#services/recruiter.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		addStep,
		addStepProblem,
		journeySummary,
		moveStep,
		removeStep,
		sameSteps,
		savedWorkflowProblem,
		stepName,
		withStepConfig
	} from '#services/workflow.ts';
	import { clientStep } from '#components/hire/steps/index.ts';

	let { domainName }: { domainName: string } = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const LOAD_FAILED = 'Could not load your hiring journey.';
	const SAVE_FAILED = 'Could not save your hiring journey. Try again.';

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let loadError = $state('');
	/** The steps as saved */
	let saved = $state.raw<WorkflowStep[]>([]);
	/** The steps as edited */
	let steps = $state.raw<WorkflowStep[]>([]);
	let saving = $state(false);
	let saveError = $state('');
	/** What the API refused in the journey last sent, until it is changed */
	let refused = $state.raw<WorkflowProblem | null>(null);
	/** What a move, an addition or a removal did, for screen readers */
	let announcement = $state('');

	let list: HTMLElement | undefined = $state();
	let addHeading: HTMLElement | undefined = $state();

	let checked = $derived(parseWorkflow(steps));
	let problem = $derived(checked.ok ? refused : checked.problem);
	let problemIndex = $derived(
		problem?.stepId === undefined ? -1 : steps.findIndex((step) => step.id === problem.stepId)
	);
	let changed = $derived(!sameSteps(steps, saved));

	/** The name of its own a step has (a note's title), when it has one */
	const ownTitle = (step: WorkflowStep) => clientStep(step.type)?.title?.(step);
	/** A step as the buttons name it: its type's label, and its own name to tell two of a type apart */
	const fullName = (step: WorkflowStep) => {
		const title = ownTitle(step);
		return title ? `${stepName(step)}: ${title}` : stepName(step);
	};

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
			saved = data.steps;
			steps = saved;
			refused = null;
			status = 'ready';
		} catch {
			loadError = NETWORK_ERROR;
			status = 'error';
		}
	}

	function edit(next: WorkflowStep[]) {
		steps = next;
		refused = null;
		saveError = '';
	}

	/** An element of the step `id`'s card */
	const inStep = (id: string, selector: string) =>
		list?.querySelector<HTMLElement>(`[data-step="${CSS.escape(id)}"] ${selector}`);

	async function add(type: string) {
		const next = addStep(steps, type, saved);
		const added = next.find((step) => !steps.includes(step));
		edit(next);
		if (!added) return;
		announcement = `${stepName(added)} added as step ${next.indexOf(added) + 1} of ${next.length}.`;
		await tick();
		inStep(added.id, '[data-heading]')?.focus();
	}

	async function move(step: WorkflowStep, by: -1 | 1) {
		const next = moveStep(steps, step.id, by);
		edit(next);
		announcement = `${fullName(step)} moved to step ${next.indexOf(step) + 1} of ${next.length}.`;
		await tick();
		// The focus stays on the step moved: on the other button once it reached an end
		const [same, other] = by === -1 ? ['up', 'down'] : ['down', 'up'];
		const button = inStep(step.id, `[data-move="${same}"]:not(:disabled)`);
		(button ?? inStep(step.id, `[data-move="${other}"]:not(:disabled)`))?.focus();
	}

	async function remove(step: WorkflowStep) {
		const index = steps.indexOf(step);
		const next = removeStep(steps, step.id);
		edit(next);
		announcement = `${fullName(step)} removed.`;
		await tick();
		// Its button went with it: on to the step that took its place, else the one before
		const neighbour = next[index] ?? next[index - 1];
		(neighbour ? inStep(neighbour.id, '[data-heading]') : addHeading)?.focus();
	}

	async function save() {
		if (problem || saving) return;
		saving = true;
		saveError = '';
		const sent = steps;
		try {
			const { data, error } = await portfolioApi.workflow.put(
				{ steps: sent.map(({ id, type, config }) => ({ id, type, config })) },
				withCredentials
			);
			if (error || !data) {
				// The rules are checked here first: the API only refuses what this page does not know yet
				refused = errorStatus(error) === 422 ? savedWorkflowProblem(error?.value, sent) : null;
				if (!refused) saveError = error ? failure(error, SAVE_FAILED) : SAVE_FAILED;
				return;
			}
			saved = data.steps;
			steps = saved;
			toaster.success({
				title: 'Hiring journey saved',
				description: journeySummary(saved, ownTitle)
			});
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
			Choose the steps recruiters go through on your Hire page, in order. Each step opens once the
			ones before it are done.
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
		{#if steps.length === 0}
			<p class="card border border-surface-200-800 p-4 text-sm text-surface-700-300">
				Your journey has no step. Add one below.
			</p>
		{/if}
		<ol class="space-y-3" aria-label="Steps" bind:this={list}>
			{#each steps as step, index (step.id)}
				{@const manifest = stepManifest(step.type)}
				{@const entry = clientStep(step.type)}
				{@const name = fullName(step)}
				{@const stepProblem = problem && problemIndex === index ? problem : undefined}
				<!-- A problem about a setting is shown by the settings form, under that setting -->
				{@const inSettings = stepProblem?.field !== undefined && entry?.Settings !== undefined}
				<li
					class={[
						'card flex items-start gap-4 border p-4 sm:p-5',
						stepProblem ? 'border-error-500/60' : 'border-surface-200-800'
					]}
					data-step={step.id}
				>
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold preset-filled-primary-500"
						aria-hidden="true"
					>
						{index + 1}
					</span>
					<div class="min-w-0 flex-1 space-y-3">
						<div class="space-y-1">
							<h3 class="font-semibold outline-none" tabindex="-1" data-heading>
								<span class="sr-only">Step {index + 1}:</span>
								{stepName(step)}
							</h3>
							{#if manifest}
								<p class="text-sm text-surface-700-300">{manifest.description}</p>
								<p class="text-xs opacity-60">
									{manifest.kind === 'access'
										? 'What the journey leads to.'
										: 'Asked before the steps it opens.'}
								</p>
							{/if}
							{#if stepProblem && !inSettings}
								<p class="text-sm text-error-700-300">{stepProblem.message}</p>
							{/if}
						</div>
						{#if entry?.Settings}
							<entry.Settings
								config={step.config}
								onChange={(config) => edit(withStepConfig(steps, step.id, config))}
								problem={inSettings ? stepProblem : undefined}
								disabled={saving}
								idPrefix="{uid}-{step.id}"
							/>
						{/if}
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="btn btn-sm preset-tonal"
								data-move="up"
								disabled={saving || index === 0}
								onclick={() => move(step, -1)}
							>
								<ChevronUp size="16" aria-hidden="true" />
								Move up
								<span class="sr-only">{name}</span>
							</button>
							<button
								type="button"
								class="btn btn-sm preset-tonal"
								data-move="down"
								disabled={saving || index === steps.length - 1}
								onclick={() => move(step, 1)}
							>
								<ChevronDown size="16" aria-hidden="true" />
								Move down
								<span class="sr-only">{name}</span>
							</button>
							<button
								type="button"
								class="btn btn-sm preset-tonal"
								disabled={saving}
								onclick={() => remove(step)}
							>
								<Trash size="16" aria-hidden="true" />
								Remove
								<span class="sr-only">{name}</span>
							</button>
						</div>
					</div>
				</li>
			{/each}
		</ol>

		<section class="space-y-3" aria-labelledby="{uid}-add">
			<h3 class="font-semibold outline-none" id="{uid}-add" tabindex="-1" bind:this={addHeading}>
				Add a step
			</h3>
			<ul class="space-y-3">
				{#each stepManifests() as manifest (manifest.type)}
					{@const reason = addStepProblem(steps, manifest)}
					<li class="flex flex-col items-start gap-x-4 gap-y-1 sm:flex-row sm:items-center">
						<button
							type="button"
							class="btn preset-tonal shrink-0"
							disabled={saving || reason !== null}
							aria-describedby="{uid}-add-{manifest.type}"
							onclick={() => add(manifest.type)}
						>
							<PlusCircle size="18" aria-hidden="true" />
							<span class="sr-only">Add step:</span>
							{manifest.label}
						</button>
						<p class="text-sm text-surface-700-300" id="{uid}-add-{manifest.type}">
							{reason ?? manifest.description}
						</p>
					</li>
				{/each}
			</ul>
		</section>

		<p class="sr-only" aria-live="polite">{announcement}</p>

		<!-- What recruiters will go through, or why it cannot be saved -->
		<div aria-live="polite">
			{#if problem}
				<p class="card preset-tonal-warning p-3 text-sm">
					{#if problemIndex !== -1}
						Step {problemIndex + 1} ({stepName(steps[problemIndex])}):
					{/if}
					{problem.message}
				</p>
			{:else}
				<p class="text-sm">{journeySummary(steps, ownTitle)}</p>
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
					onclick={() => edit(saved)}
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
