<!--
@component
The owner's perfect job (GET, PUT /perfect-job): what they look for in a job, criterion by
criterion, each read from what a recruiter fills in for a job description and each with how much
it matters (1 to 5). A recruiter's job is scored against it out of 100 in the hiring journey
(the step "Match the perfect job", which sets the minimum). The criteria are checked on every
change with the rules the API enforces (portfolio-common's parsePerfectJob): what is wrong is
said at the setting it is about, and nothing can be saved until it is fixed. Recruiters never
see the criteria.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { Scale } from 'svelte-heros-v2';
	import {
		CONTRACT_TYPE_LABELS,
		FR_CONTRACT_TYPES,
		FR_FORFAIT_JOURS_STANDARD_DAYS,
		HOURS_TOLERANCE,
		MANAGEMENT_ROLES,
		MANAGEMENT_ROLE_LABELS,
		PAY_TOLERANCE,
		PERFECT_JOB_CRITERION_LABELS,
		PERFECT_JOB_LIMITS,
		SENIORITY_LABELS,
		SENIORITY_LEVELS,
		TRAVEL_FREQUENCIES,
		WORKING_TIME_ARRANGEMENTS,
		WORKING_TIME_LABELS,
		WORK_MODES,
		WORK_MODE_LABELS,
		type PerfectJobProblem,
		type TravelFrequency
	} from 'portfolio-common';
	import { portfolioTextApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication } from '#services/authentication.ts';
	import { SESSION_EXPIRED_MESSAGE } from '#services/account.ts';
	import {
		checkPerfectJob,
		criterionShares,
		perfectJobCriteria,
		perfectJobForm,
		perfectJobSummary,
		problemAt,
		problemCriterion,
		sameCriteria,
		savedForm,
		savedPerfectJobProblem,
		type PerfectJobForm
	} from '#services/perfectJob.ts';
	import { NETWORK_ERROR, failureText } from '#services/recruiter.ts';
	import { toaster } from '#services/toaster.ts';
	import ChipList from './perfect-job/ChipList.svelte';
	import Choices from './perfect-job/Choices.svelte';
	import Criterion from './perfect-job/Criterion.svelte';

	let {
		openJourney
	}: {
		/** Shows the tab of the hiring journey, where the step using the perfect job is set */
		openJourney: () => void;
	} = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const LOAD_FAILED = 'Could not load your perfect job.';
	const SAVE_FAILED = 'Could not save your perfect job. Try again.';

	const TRAVEL_CHOICES: Record<TravelFrequency, string> = {
		none: 'No travel',
		occasional: 'Occasional travel at most',
		frequent: 'Frequent travel is fine'
	};
	const groupClass = 'space-y-3';
	const groupHeadingClass = 'text-lg font-semibold';

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let loadError = $state('');
	/** The criteria as saved */
	let saved = $state.raw<PerfectJobForm>(perfectJobForm());
	/** The criteria as edited */
	let form = $state<PerfectJobForm>(perfectJobForm());
	let saving = $state(false);
	let saveError = $state('');
	/** What the API refused, and the criteria it refused it in: said until they are changed */
	let refused = $state.raw<{ problem: PerfectJobProblem; sent: string } | null>(null);

	let checked = $derived(checkPerfectJob(form));
	let problems = $derived.by(() => {
		if (checked.problems.length > 0) return checked.problems;
		return refused?.sent === JSON.stringify(perfectJobCriteria(form)) ? [refused.problem] : [];
	});
	let shares = $derived(criterionShares(form));
	let changed = $derived(!sameCriteria(form, saved));
	const at = (field: string) => problemAt(problems, field) ?? '';

	// Unsaved criteria: leaving the page asks first. A reload or a closed tab gets the browser's
	// own prompt; a link, this one
	beforeNavigate((navigation) => {
		if (!changed || navigation.willUnload) {
			if (changed) navigation.cancel();
			return;
		}
		if (!confirm('Leave without saving your perfect job? Your changes will be lost.')) {
			navigation.cancel();
		}
	});

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
			const { data, error } = await portfolioTextApi['perfect-job'].get(withCredentials);
			if (error || !data) {
				loadError = error ? failure(error, LOAD_FAILED) : LOAD_FAILED;
				status = 'error';
				return;
			}
			saved = perfectJobForm(data.criteria);
			form = perfectJobForm(data.criteria);
			refused = null;
			saveError = '';
			status = 'ready';
		} catch {
			loadError = NETWORK_ERROR;
			status = 'error';
		}
	}

	async function save() {
		if (problems.length > 0 || saving) return;
		saving = true;
		saveError = '';
		const criteria = perfectJobCriteria(form);
		try {
			const { data, error } = await portfolioTextApi['perfect-job'].put(
				{ criteria },
				withCredentials
			);
			if (error || !data) {
				// The rules are checked here first: the API only refuses what this page does not know yet
				const problem = errorStatus(error) === 422 ? savedPerfectJobProblem(error?.value) : null;
				refused = problem && { problem, sent: JSON.stringify(criteria) };
				if (!refused) saveError = error ? failure(error, SAVE_FAILED) : SAVE_FAILED;
				return;
			}
			const next = savedForm($state.snapshot(form), data.criteria);
			saved = next;
			form = structuredClone(next);
			toaster.success({ title: 'Perfect job saved', description: perfectJobSummary(next) });
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
		<h2 class="h3">Perfect job</h2>
		<p class="opacity-75">
			Say what you look for in a job and how much each point matters. The job a recruiter picks in
			your hiring journey is scored against it, out of 100.
		</p>
	</section>

	{#if status === 'loading'}
		<p class="text-sm opacity-50" role="status">Loading your perfect job...</p>
	{:else if status === 'error'}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{loadError}</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={load}>Try again</button>
		</div>
	{:else}
		<div class="card preset-tonal flex items-start gap-3 p-4 text-sm" role="note">
			<Scale size="20" class="mt-0.5 shrink-0" aria-hidden="true" />
			<div class="min-w-0 space-y-2">
				<p class="font-semibold">How a job is scored</p>
				<ul class="list-disc space-y-1 ps-5">
					<li>
						Each criterion you switch on counts for its importance, from 1 to 5. The score is what
						the job matches out of the total, on 100.
					</li>
					<li>Some criteria can match partly: a pay a little under yours, fewer remote days.</li>
					<li>
						What a job description does not state (its seniority, its skills, its travel…) counts as
						not matching.
					</li>
					<li>A deal-breaker the job does not match at all brings the score to 0.</li>
				</ul>
				<p>
					Recruiters never see your criteria. To use the score, add the step “Match the perfect job”
					to your
					<button type="button" class="underline underline-offset-2" onclick={openJourney}>
						hiring journey
					</button>
					and set the minimum there.
				</p>
			</div>
		</div>

		<fieldset class="min-w-0 space-y-8" disabled={saving}>
			<section class={groupClass} aria-labelledby="{uid}-group-role">
				<h3 class={groupHeadingClass} id="{uid}-group-role">The role</h3>
				<Criterion
					criterion="titles"
					description="The job titles you are after. A job matches when its title has one of them, as whole words."
					bind:rating={form.titles}
					share={shares.titles}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label="Job titles"
						bind:value={form.titles.keywords}
						max={PERFECT_JOB_LIMITS.titles}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						itemName="job title"
						placeholder="e.g. Staff Engineer"
						error={at('titles.keywords')}
						disabled={saving}
						id="{uid}-titles-keywords"
					/>
				</Criterion>
				<Criterion
					criterion="seniority"
					description="The levels you would take."
					bind:rating={form.seniority}
					share={shares.seniority}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend="Levels"
						options={SENIORITY_LEVELS}
						labels={SENIORITY_LABELS}
						bind:value={form.seniority.levels}
						error={at('seniority.levels')}
						id="{uid}-seniority-levels"
					/>
				</Criterion>
				<Criterion
					criterion="management"
					description="Whether you want people reporting to you (the job's direct reports)."
					bind:rating={form.management}
					share={shares.management}
					disabled={saving}
					idPrefix={uid}
				>
					<fieldset
						class="space-y-1.5"
						aria-describedby={at('management.role') ? `${uid}-management-error` : undefined}
					>
						<legend class="label-text text-sm">You want</legend>
						<div class="flex flex-wrap gap-x-5 gap-y-2">
							{#each MANAGEMENT_ROLES as role (role)}
								<label class="flex min-h-8 items-center gap-2 text-sm">
									<input
										class="radio"
										type="radio"
										name="{uid}-management-role"
										value={role}
										bind:group={form.management.role}
									/>
									{MANAGEMENT_ROLE_LABELS[role]}
								</label>
							{/each}
						</div>
						{#if at('management.role')}
							<p class="text-sm text-error-700-300" id="{uid}-management-error">
								{at('management.role')}
							</p>
						{/if}
					</fieldset>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-place">
				<h3 class={groupHeadingClass} id="{uid}-group-place">The place</h3>
				<Criterion
					criterion="workMode"
					description="How you want to work: at the office, partly or fully remote."
					bind:rating={form.workMode}
					share={shares.workMode}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend="Work modes you accept"
						options={WORK_MODES}
						labels={WORK_MODE_LABELS}
						bind:value={form.workMode.modes}
						error={at('workMode.modes')}
						id="{uid}-workMode-modes"
					/>
					{#if form.workMode.modes.includes('hybrid')}
						<div class="space-y-1 sm:max-w-xs">
							<label class="label-text text-sm" for="{uid}-workMode-days">
								Remote days a week in a hybrid job, at least
							</label>
							<select
								class="select"
								id="{uid}-workMode-days"
								bind:value={form.workMode.minRemoteDays}
								aria-describedby="{uid}-workMode-days-help"
							>
								<option value="">Any number</option>
								{#each { length: PERFECT_JOB_LIMITS.minRemoteDays.max }, index (index)}
									<option value={String(index + 1)}>{index + 1}</option>
								{/each}
							</select>
							<p class="text-xs text-surface-700-300" id="{uid}-workMode-days-help">
								{at('workMode.minRemoteDays') ||
									'A hybrid job with fewer remote days matches in proportion.'}
							</p>
						</div>
					{/if}
				</Criterion>
				<Criterion
					criterion="cities"
					description="Where the office can be. A fully remote job has no office: it always matches."
					bind:rating={form.cities}
					share={shares.cities}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label="Cities or postal codes"
						bind:value={form.cities.places}
						max={PERFECT_JOB_LIMITS.cities}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						itemName="place"
						placeholder="e.g. Lyon, or 69"
						hint="A city's name, or the first digits of a postal code (69 for the Rhône)."
						error={at('cities.places')}
						disabled={saving}
						id="{uid}-cities-places"
					/>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-contract">
				<h3 class={groupHeadingClass} id="{uid}-group-contract">The contract and the time</h3>
				<Criterion
					criterion="contractTypes"
					description="The contracts you would sign."
					bind:rating={form.contractTypes}
					share={shares.contractTypes}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend="Contracts"
						options={FR_CONTRACT_TYPES}
						labels={CONTRACT_TYPE_LABELS}
						bind:value={form.contractTypes.types}
						error={at('contractTypes.types')}
						id="{uid}-contractTypes-types"
					/>
				</Criterion>
				<Criterion
					criterion="workingTime"
					description="How your working time is counted, and how many hours a week at most."
					bind:rating={form.workingTime}
					share={shares.workingTime}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend="Working time you accept, counted in"
						options={WORKING_TIME_ARRANGEMENTS}
						labels={WORKING_TIME_LABELS}
						bind:value={form.workingTime.arrangements}
						error={at('workingTime.arrangements')}
						id="{uid}-workingTime-arrangements"
					/>
					{#if form.workingTime.arrangements.includes('weekly_hours')}
						<div class="space-y-1 sm:max-w-xs">
							<label class="label-text text-sm" for="{uid}-workingTime-hours">
								Hours a week, at most <span class="font-normal">(optional)</span>
							</label>
							<input
								class="input"
								id="{uid}-workingTime-hours"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder="e.g. 35"
								bind:value={form.workingTime.maxHoursPerWeek}
								aria-invalid={at('workingTime.maxHoursPerWeek') ? true : undefined}
								aria-describedby="{uid}-workingTime-hours-help"
							/>
							<p class="text-xs" id="{uid}-workingTime-hours-help">
								{#if at('workingTime.maxHoursPerWeek')}
									<span class="text-error-700-300">{at('workingTime.maxHoursPerWeek')}</span>
								{:else}
									<span class="text-surface-700-300">
										A job over it matches less with each hour, and not at all {HOURS_TOLERANCE} hours
										over.
									</span>
								{/if}
							</p>
						</div>
					{/if}
				</Criterion>
				<Criterion
					criterion="rttDays"
					description="The reduced working time days (RTT) you want a year. A job with fewer matches in proportion."
					bind:rating={form.rttDays}
					share={shares.rttDays}
					disabled={saving}
					idPrefix={uid}
				>
					<div class="space-y-1 sm:max-w-xs">
						<label class="label-text text-sm" for="{uid}-rttDays-min">
							RTT days a year, at least
						</label>
						<input
							class="input"
							id="{uid}-rttDays-min"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 10"
							bind:value={form.rttDays.min}
							aria-invalid={at('rttDays.min') ? true : undefined}
							aria-describedby={at('rttDays.min') ? `${uid}-rttDays-error` : undefined}
						/>
						{#if at('rttDays.min')}
							<p class="text-sm text-error-700-300" id="{uid}-rttDays-error">{at('rttDays.min')}</p>
						{/if}
					</div>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-pay">
				<h3 class={groupHeadingClass} id="{uid}-group-pay">The pay</h3>
				<Criterion
					criterion="pay"
					description={`The gross pay (brut) you ask for, in euros. A job matches when the middle of its range reaches it, partly when it is under, and not at all ${PAY_TOLERANCE * 100}% under.`}
					bind:rating={form.pay}
					share={shares.pay}
					disabled={saving}
					idPrefix={uid}
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-1">
							<label class="label-text text-sm" for="{uid}-pay-perYear">Per year</label>
							<div class="flex items-center gap-2">
								<input
									class="input min-w-0 flex-1"
									id="{uid}-pay-perYear"
									type="text"
									inputmode="numeric"
									autocomplete="off"
									placeholder="e.g. 70 000"
									bind:value={form.pay.perYear}
									aria-invalid={at('pay.perYear') ? true : undefined}
									aria-describedby={at('pay.perYear') ? `${uid}-pay-perYear-error` : undefined}
								/>
								<span class="shrink-0 text-sm text-surface-700-300" aria-hidden="true">€</span>
							</div>
							{#if at('pay.perYear')}
								<p class="text-sm text-error-700-300" id="{uid}-pay-perYear-error">
									{at('pay.perYear')}
								</p>
							{/if}
						</div>
						<div class="space-y-1">
							<label class="label-text text-sm" for="{uid}-pay-perDay">
								Per day <span class="font-normal">(day rates)</span>
							</label>
							<div class="flex items-center gap-2">
								<input
									class="input min-w-0 flex-1"
									id="{uid}-pay-perDay"
									type="text"
									inputmode="numeric"
									autocomplete="off"
									placeholder="e.g. 600"
									bind:value={form.pay.perDay}
									aria-invalid={at('pay.perDay') ? true : undefined}
									aria-describedby={at('pay.perDay') ? `${uid}-pay-perDay-error` : undefined}
								/>
								<span class="shrink-0 text-sm text-surface-700-300" aria-hidden="true">€</span>
							</div>
							{#if at('pay.perDay')}
								<p class="text-sm text-error-700-300" id="{uid}-pay-perDay-error">
									{at('pay.perDay')}
								</p>
							{/if}
						</div>
					</div>
					<p class="text-xs text-surface-700-300">
						Give one or both. With one only, the other kind of job is converted ({FR_FORFAIT_JOURS_STANDARD_DAYS}
						days a year); a monthly pay counts 12 months.
					</p>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-skills">
				<h3 class={groupHeadingClass} id="{uid}-group-skills">The skills</h3>
				<Criterion
					criterion="skills"
					description="What you want to work with. A job scores by the share of the skills it asks for that are in your list."
					bind:rating={form.skills}
					share={shares.skills}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label="Skills you want to use"
						bind:value={form.skills.names}
						max={PERFECT_JOB_LIMITS.skills}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						itemName="skill"
						placeholder="e.g. TypeScript"
						error={at('skills.names')}
						disabled={saving}
						id="{uid}-skills-names"
					/>
				</Criterion>
				<Criterion
					criterion="avoidedSkills"
					description="What you do not want to work with. A job asking for one of them does not match."
					bind:rating={form.avoidedSkills}
					share={shares.avoidedSkills}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label="Skills you want to avoid"
						bind:value={form.avoidedSkills.names}
						max={PERFECT_JOB_LIMITS.avoidedSkills}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						itemName="skill"
						placeholder="e.g. PHP"
						error={at('avoidedSkills.names')}
						disabled={saving}
						id="{uid}-avoidedSkills-names"
					/>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-conditions">
				<h3 class={groupHeadingClass} id="{uid}-group-conditions">The conditions</h3>
				<Criterion
					criterion="travel"
					description="How much the job can make you travel."
					bind:rating={form.travel}
					share={shares.travel}
					disabled={saving}
					idPrefix={uid}
				>
					<div class="space-y-1 sm:max-w-xs">
						<label class="label-text text-sm" for="{uid}-travel-max">The most you accept</label>
						<select
							class="select"
							id="{uid}-travel-max"
							bind:value={form.travel.max}
							aria-invalid={at('travel.max') ? true : undefined}
							aria-describedby={at('travel.max') ? `${uid}-travel-error` : undefined}
						>
							<option value="" disabled>Pick one</option>
							{#each TRAVEL_FREQUENCIES as value (value)}
								<option {value}>{TRAVEL_CHOICES[value]}</option>
							{/each}
						</select>
						{#if at('travel.max')}
							<p class="text-sm text-error-700-300" id="{uid}-travel-error">{at('travel.max')}</p>
						{/if}
					</div>
				</Criterion>
			</section>
		</fieldset>

		<!-- Why it cannot be saved (read out when it changes), or what a job is scored on -->
		<div aria-live="polite">
			{#if problems.length > 0}
				<div class="card preset-tonal-warning space-y-1 p-3 text-sm">
					<p class="font-semibold">Complete the criteria you switched on:</p>
					<ul class="list-disc ps-5">
						{#each problems as problem (problem.field)}
							{@const criterion = problemCriterion(problem)}
							<li>
								{criterion ? `${PERFECT_JOB_CRITERION_LABELS[criterion]}: ` : ''}{problem.message}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
		{#if problems.length === 0}
			<p class="text-sm" data-summary>{perfectJobSummary(form)}</p>
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			<button
				type="button"
				class="btn preset-filled-primary-700-300"
				disabled={!changed || problems.length > 0 || saving}
				onclick={save}
			>
				{saving ? 'Saving...' : 'Save perfect job'}
			</button>
			{#if changed}
				<button
					type="button"
					class="btn preset-tonal"
					disabled={saving}
					onclick={() => (form = structuredClone(saved))}
				>
					Undo changes
				</button>
			{/if}
		</div>
		{#if saveError}
			<p class="text-sm text-error-700-300" role="alert">{saveError}</p>
		{/if}
	{/if}
</div>
