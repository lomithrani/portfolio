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
		COMMUTE_MODES,
		COMMUTE_MODE_LABELS,
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
		stepManifest,
		type PerfectJob,
		type PerfectJobProblem
	} from 'portfolio-common';
	import { portfolioTextApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication } from '#services/authentication.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import {
		checkPerfectJob,
		commuteBudgetHint,
		commutePlace,
		criterionShares,
		perfectJobCriteria,
		perfectJobForm,
		perfectJobSummary,
		problemAt,
		problemCriterion,
		sameCriteria,
		savedForm,
		savedPerfectJobProblem,
		type CommuteAvailability,
		type PerfectJobForm
	} from '#services/perfectJob.ts';
	import { networkError, failureText } from '#services/recruiter.ts';
	import { toaster } from '#services/toaster.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import AddressSearch from '#components/address/AddressSearch.svelte';
	import { m } from './PerfectJobTab.messages.ts';
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
	const groupClass = 'space-y-3';
	const groupHeadingClass = 'text-lg font-semibold';

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let loadError = $state('');
	/** The criteria as saved */
	let saved = $state.raw<PerfectJobForm>(perfectJobForm());
	/** The criteria as the API stored them: the place it found for the commute's address */
	let stored = $state.raw<PerfectJob>({});
	/** Whether this site computes travel times, and by which modes */
	let travelTimes = $state.raw<CommuteAvailability>({ enabled: false, modes: [] });
	/** The criteria as edited */
	let form = $state<PerfectJobForm>(perfectJobForm());
	/** Where the API found the commute's address, while it is the one saved */
	let place = $derived(commutePlace(form, stored));
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
		if (!confirm(m.leaveUnsaved)) {
			navigation.cancel();
		}
	});

	const failure = (error: { status: unknown; value?: unknown }, fallback: string) => {
		if (errorStatus(error) === 401) {
			clearAuthentication();
			return accountMessages.sessionExpired;
		}
		return failureText(error.value, fallback);
	};

	async function load() {
		status = 'loading';
		try {
			const { data, error } = await portfolioTextApi['perfect-job'].get(withCredentials);
			if (error || !data) {
				loadError = error ? failure(error, m.loadFailed) : m.loadFailed;
				status = 'error';
				return;
			}
			saved = perfectJobForm(data.criteria);
			form = perfectJobForm(data.criteria);
			stored = data.criteria;
			travelTimes = data.commute;
			refused = null;
			saveError = '';
			status = 'ready';
		} catch {
			loadError = networkError();
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
				if (!refused) saveError = error ? failure(error, m.saveFailed) : m.saveFailed;
				return;
			}
			const next = savedForm($state.snapshot(form), data.criteria);
			saved = next;
			stored = data.criteria;
			travelTimes = data.commute;
			form = structuredClone(next);
			toaster.success({ title: m.saved, description: perfectJobSummary(next) });
		} catch {
			saveError = networkError();
		} finally {
			saving = false;
		}
	}

	onMount(load);
</script>

<div class="space-y-6">
	<section class="space-y-2">
		<h2 class="h3">{m.title}</h2>
		<p class="opacity-75">{m.intro}</p>
	</section>

	{#if status === 'loading'}
		<p class="text-sm opacity-50" role="status">{m.loading}</p>
	{:else if status === 'error'}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{loadError}</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={load}>{common.retry}</button>
		</div>
	{:else}
		<div class="card preset-tonal flex items-start gap-3 p-4 text-sm" role="note">
			<Scale size="20" class="mt-0.5 shrink-0" aria-hidden="true" />
			<div class="min-w-0 space-y-2">
				<p class="font-semibold">{m.scoring.title}</p>
				<ul class="list-disc space-y-1 ps-5">
					<li>{m.scoring.importance}</li>
					<li>{m.scoring.partly}</li>
					<li>{m.scoring.notStated}</li>
					<li>{m.scoring.dealBreaker}</li>
				</ul>
				<p>
					<Rich text={m.scoring.use(stepManifest('job-match')?.label ?? '')}>
						{#snippet journey(text)}
							<button type="button" class="underline underline-offset-2" onclick={openJourney}>
								{text}
							</button>
						{/snippet}
					</Rich>
				</p>
			</div>
		</div>

		<fieldset class="min-w-0 space-y-8" disabled={saving}>
			<section class={groupClass} aria-labelledby="{uid}-group-role">
				<h3 class={groupHeadingClass} id="{uid}-group-role">{m.groups.role}</h3>
				<Criterion
					criterion="titles"
					description={m.titles.description}
					bind:rating={form.titles}
					share={shares.titles}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label={m.titles.label}
						bind:value={form.titles.keywords}
						max={PERFECT_JOB_LIMITS.titles}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						kind="jobTitle"
						placeholder={m.titles.placeholder}
						error={at('titles.keywords')}
						disabled={saving}
						id="{uid}-titles-keywords"
					/>
				</Criterion>
				<Criterion
					criterion="seniority"
					description={m.seniority.description}
					bind:rating={form.seniority}
					share={shares.seniority}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend={m.seniority.legend}
						options={SENIORITY_LEVELS}
						labels={SENIORITY_LABELS}
						bind:value={form.seniority.levels}
						error={at('seniority.levels')}
						id="{uid}-seniority-levels"
					/>
				</Criterion>
				<Criterion
					criterion="management"
					description={m.management.description}
					bind:rating={form.management}
					share={shares.management}
					disabled={saving}
					idPrefix={uid}
				>
					<fieldset
						class="space-y-1.5"
						aria-describedby={at('management.role') ? `${uid}-management-error` : undefined}
					>
						<legend class="label-text text-sm">{m.management.legend}</legend>
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
				<h3 class={groupHeadingClass} id="{uid}-group-place">{m.groups.place}</h3>
				<Criterion
					criterion="workMode"
					description={m.workMode.description}
					bind:rating={form.workMode}
					share={shares.workMode}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend={m.workMode.legend}
						options={WORK_MODES}
						labels={WORK_MODE_LABELS}
						bind:value={form.workMode.modes}
						error={at('workMode.modes')}
						id="{uid}-workMode-modes"
					/>
					{#if form.workMode.modes.includes('hybrid')}
						<div class="space-y-1 sm:max-w-xs">
							<label class="label-text text-sm" for="{uid}-workMode-days">
								{m.workMode.minRemoteDays}
							</label>
							<select
								class="select"
								id="{uid}-workMode-days"
								bind:value={form.workMode.minRemoteDays}
								aria-describedby="{uid}-workMode-days-help"
							>
								<option value="">{m.workMode.anyNumber}</option>
								{#each { length: PERFECT_JOB_LIMITS.minRemoteDays.max }, index (index)}
									<option value={String(index + 1)}>{index + 1}</option>
								{/each}
							</select>
							<p class="text-xs text-surface-700-300" id="{uid}-workMode-days-help">
								{at('workMode.minRemoteDays') || m.workMode.minRemoteDaysHelp}
							</p>
						</div>
					{/if}
				</Criterion>
				<Criterion
					criterion="cities"
					description={m.cities.description}
					bind:rating={form.cities}
					share={shares.cities}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label={m.cities.label}
						bind:value={form.cities.places}
						max={PERFECT_JOB_LIMITS.cities}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						kind="place"
						placeholder={m.cities.placeholder}
						hint={m.cities.hint}
						error={at('cities.places')}
						disabled={saving}
						id="{uid}-cities-places"
					/>
				</Criterion>
				<Criterion
					criterion="commute"
					description={travelTimes.enabled || form.commute.enabled
						? m.commute.description
						: m.commute.descriptionOff}
					bind:rating={form.commute}
					share={shares.commute}
					disabled={saving || (!travelTimes.enabled && !form.commute.enabled)}
					idPrefix={uid}
				>
					{#if !travelTimes.enabled}
						<p class="card preset-tonal-warning p-3 text-sm">{m.commute.off}</p>
					{/if}
					<div class="space-y-1">
						<label class="label-text text-sm" for="{uid}-commute-from">{m.commute.from}</label>
						<AddressSearch
							id="{uid}-commute-from"
							autocomplete="off"
							maxlength={PERFECT_JOB_LIMITS.address}
							placeholder={m.commute.fromPlaceholder}
							bind:value={form.commute.from}
							aria-invalid={at('commute.from') ? true : undefined}
							aria-describedby="{uid}-commute-from-help"
						/>
						<p class="text-xs" id="{uid}-commute-from-help">
							{#if at('commute.from')}
								<span class="text-error-700-300">{at('commute.from')}</span>
							{:else if place}
								<span class="text-surface-700-300" data-place>{m.commute.found(place.label)}</span>
							{:else}
								<span class="text-surface-700-300">{m.commute.fromHelp}</span>
							{/if}
						</p>
					</div>
					<Choices
						legend={m.commute.modes}
						options={COMMUTE_MODES}
						labels={COMMUTE_MODE_LABELS}
						unavailable={COMMUTE_MODES.filter((mode) => !travelTimes.modes.includes(mode))}
						bind:value={form.commute.modes}
						error={at('commute.modes')}
						id="{uid}-commute-modes"
					/>
					<p class="text-xs text-surface-700-300">{m.commute.modesHelp}</p>
					<fieldset class="space-y-1" aria-describedby="{uid}-commute-time-help">
						<legend class="label-text text-sm">{m.commute.time}</legend>
						<div class="flex flex-wrap items-center gap-2">
							<input
								class="input w-20"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder="5"
								aria-label={m.commute.hours}
								bind:value={form.commute.hours}
								aria-invalid={at('commute.maxMinutesPerWeek') ? true : undefined}
							/>
							<span class="text-sm text-surface-700-300" aria-hidden="true">h</span>
							<input
								class="input w-20"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder="0"
								aria-label={m.commute.minutes}
								bind:value={form.commute.minutes}
								aria-invalid={at('commute.maxMinutesPerWeek') ? true : undefined}
							/>
							<span class="text-sm text-surface-700-300" aria-hidden="true">min</span>
						</div>
						<p class="text-xs" id="{uid}-commute-time-help">
							{#if at('commute.maxMinutesPerWeek')}
								<span class="text-error-700-300">{at('commute.maxMinutesPerWeek')}</span>
							{:else}
								<span class="text-surface-700-300" data-budget>
									{commuteBudgetHint(form.commute.hours, form.commute.minutes) || m.commute.eachDay}
									{m.commute.over}
								</span>
							{/if}
						</p>
					</fieldset>
					<p class="text-xs text-surface-700-300">
						<Rich
							text={m.commute.privacy[
								(travelTimes.modes.includes('transit') && travelTimes.transit) || 'none'
							]}
						>
							{#snippet ign(text)}<a
									class="underline underline-offset-2"
									href="https://geoservices.ign.fr/"
									target="_blank"
									rel="noreferrer">{text}</a
								>{/snippet}
							{#snippet here(text)}<a
									class="underline underline-offset-2"
									href="https://legal.here.com/privacy/policy"
									target="_blank"
									rel="noreferrer">{text}</a
								>{/snippet}
							{#snippet transitous(text)}<a
									class="underline underline-offset-2"
									href="https://transitous.org/sources/"
									target="_blank"
									rel="noreferrer">{text}</a
								>{/snippet}
						</Rich>
					</p>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-contract">
				<h3 class={groupHeadingClass} id="{uid}-group-contract">{m.groups.contract}</h3>
				<Criterion
					criterion="contractTypes"
					description={m.contractTypes.description}
					bind:rating={form.contractTypes}
					share={shares.contractTypes}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend={m.contractTypes.legend}
						options={FR_CONTRACT_TYPES}
						labels={CONTRACT_TYPE_LABELS}
						bind:value={form.contractTypes.types}
						error={at('contractTypes.types')}
						id="{uid}-contractTypes-types"
					/>
				</Criterion>
				<Criterion
					criterion="workingTime"
					description={m.workingTime.description}
					bind:rating={form.workingTime}
					share={shares.workingTime}
					disabled={saving}
					idPrefix={uid}
				>
					<Choices
						legend={m.workingTime.legend}
						options={WORKING_TIME_ARRANGEMENTS}
						labels={WORKING_TIME_LABELS}
						bind:value={form.workingTime.arrangements}
						error={at('workingTime.arrangements')}
						id="{uid}-workingTime-arrangements"
					/>
					{#if form.workingTime.arrangements.includes('weekly_hours')}
						<div class="space-y-1 sm:max-w-xs">
							<label class="label-text text-sm" for="{uid}-workingTime-hours">
								<Rich text={m.workingTime.maxHours}>
									{#snippet note(text)}<span class="font-normal">{text}</span>{/snippet}
								</Rich>
							</label>
							<input
								class="input"
								id="{uid}-workingTime-hours"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder={m.workingTime.maxHoursPlaceholder}
								bind:value={form.workingTime.maxHoursPerWeek}
								aria-invalid={at('workingTime.maxHoursPerWeek') ? true : undefined}
								aria-describedby="{uid}-workingTime-hours-help"
							/>
							<p class="text-xs" id="{uid}-workingTime-hours-help">
								{#if at('workingTime.maxHoursPerWeek')}
									<span class="text-error-700-300">{at('workingTime.maxHoursPerWeek')}</span>
								{:else}
									<span class="text-surface-700-300">
										{m.workingTime.maxHoursHelp(HOURS_TOLERANCE)}
									</span>
								{/if}
							</p>
						</div>
					{/if}
				</Criterion>
				<Criterion
					criterion="rttDays"
					description={m.rttDays.description}
					bind:rating={form.rttDays}
					share={shares.rttDays}
					disabled={saving}
					idPrefix={uid}
				>
					<div class="space-y-1 sm:max-w-xs">
						<label class="label-text text-sm" for="{uid}-rttDays-min">
							{m.rttDays.min}
						</label>
						<input
							class="input"
							id="{uid}-rttDays-min"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							placeholder={m.rttDays.minPlaceholder}
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
				<h3 class={groupHeadingClass} id="{uid}-group-pay">{m.groups.pay}</h3>
				<Criterion
					criterion="pay"
					description={m.pay.description(PAY_TOLERANCE * 100)}
					bind:rating={form.pay}
					share={shares.pay}
					disabled={saving}
					idPrefix={uid}
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-1">
							<label class="label-text text-sm" for="{uid}-pay-perYear">{m.pay.perYear}</label>
							<div class="flex items-center gap-2">
								<input
									class="input min-w-0 flex-1"
									id="{uid}-pay-perYear"
									type="text"
									inputmode="numeric"
									autocomplete="off"
									placeholder={m.pay.perYearPlaceholder}
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
								<Rich text={m.pay.perDay}>
									{#snippet note(text)}<span class="font-normal">{text}</span>{/snippet}
								</Rich>
							</label>
							<div class="flex items-center gap-2">
								<input
									class="input min-w-0 flex-1"
									id="{uid}-pay-perDay"
									type="text"
									inputmode="numeric"
									autocomplete="off"
									placeholder={m.pay.perDayPlaceholder}
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
					<p class="text-xs text-surface-700-300">{m.pay.help(FR_FORFAIT_JOURS_STANDARD_DAYS)}</p>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-skills">
				<h3 class={groupHeadingClass} id="{uid}-group-skills">{m.groups.skills}</h3>
				<Criterion
					criterion="skills"
					description={m.skills.description}
					bind:rating={form.skills}
					share={shares.skills}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label={m.skills.label}
						bind:value={form.skills.names}
						max={PERFECT_JOB_LIMITS.skills}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						kind="skill"
						placeholder={m.skills.placeholder}
						error={at('skills.names')}
						disabled={saving}
						id="{uid}-skills-names"
					/>
				</Criterion>
				<Criterion
					criterion="avoidedSkills"
					description={m.avoidedSkills.description}
					bind:rating={form.avoidedSkills}
					share={shares.avoidedSkills}
					disabled={saving}
					idPrefix={uid}
				>
					<ChipList
						label={m.avoidedSkills.label}
						bind:value={form.avoidedSkills.names}
						max={PERFECT_JOB_LIMITS.avoidedSkills}
						maxLength={PERFECT_JOB_LIMITS.listItem}
						kind="skill"
						placeholder={m.avoidedSkills.placeholder}
						error={at('avoidedSkills.names')}
						disabled={saving}
						id="{uid}-avoidedSkills-names"
					/>
				</Criterion>
			</section>

			<section class={groupClass} aria-labelledby="{uid}-group-conditions">
				<h3 class={groupHeadingClass} id="{uid}-group-conditions">{m.groups.conditions}</h3>
				<Criterion
					criterion="travel"
					description={m.travel.description}
					bind:rating={form.travel}
					share={shares.travel}
					disabled={saving}
					idPrefix={uid}
				>
					<div class="space-y-1 sm:max-w-xs">
						<label class="label-text text-sm" for="{uid}-travel-max">{m.travel.max}</label>
						<select
							class="select"
							id="{uid}-travel-max"
							bind:value={form.travel.max}
							aria-invalid={at('travel.max') ? true : undefined}
							aria-describedby={at('travel.max') ? `${uid}-travel-error` : undefined}
						>
							<option value="" disabled>{m.travel.pickOne}</option>
							{#each TRAVEL_FREQUENCIES as value (value)}
								<option {value}>{m.travel.choices[value]}</option>
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
					<p class="font-semibold">{m.complete}</p>
					<ul class="list-disc ps-5">
						{#each problems as problem (problem.field)}
							{@const criterion = problemCriterion(problem)}
							<li>
								{criterion
									? m.problemOf(PERFECT_JOB_CRITERION_LABELS[criterion], problem.message)
									: problem.message}
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
				{saving ? m.saving : m.save}
			</button>
			{#if changed}
				<button
					type="button"
					class="btn preset-tonal"
					disabled={saving}
					onclick={() => (form = structuredClone(saved))}
				>
					{m.undo}
				</button>
			{/if}
		</div>
		{#if saveError}
			<p class="text-sm text-error-700-300" role="alert">{saveError}</p>
		{/if}
	{/if}
</div>
