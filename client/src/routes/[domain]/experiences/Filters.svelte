<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { skillCategoryLabel } from 'portfolio-common';
	import { Check, ChevronDown, MagnifyingGlass } from 'svelte-heros-v2';
	import { formatMonthCount, formatShortDuration } from '#services/experienceDates.ts';
	import {
		activeFilters,
		collapsedSkills,
		emptyFilters,
		filtersToSearchParams,
		hasActiveFilters,
		skillGroups,
		skillIndex,
		toggleSkill,
		type ExperienceFilters,
		type RankedSkill,
		type SkillGroup,
		type SkillIndex
	} from '#services/filters.ts';
	import { m } from './Filters.messages.ts';

	// The skills of the page, to filter its experiences by. Folded by default, on every screen: the
	// technical skills used the longest, then the soft ones, each with its time, a fixed number of
	// them so the server renders the rows without measuring anything (see collapsedSkills). "All N
	// skills" shows every skill in place, grouped by category when the catalogue gave them one,
	// with a search box. A skill that others are part of ('.NET', with '.NET Core') counts their
	// time, and filtering by it matches their projects too.

	let {
		experiences,
		skills: givenSkills,
		filters = $bindable(),
		resultCount
	}: {
		/** Every experience of the page, unfiltered */
		experiences: ExperienceModel[];
		/** Their skills, ranked, with their families (see skillIndex), when the page has them already */
		skills?: SkillIndex;
		filters: ExperienceFilters;
		/** How many experiences the filters keep */
		resultCount: number;
	} = $props();

	const uid = $props.id();

	let skills = $derived(givenSkills ?? skillIndex(experiences));
	// Selections the data no longer has are ignored (and leave the URL on the next change)
	let active = $derived(activeFilters(experiences, filters, skills.taxonomy));
	let isActive = $derived(hasActiveFilters(active));
	// The rows shown before "All N skills": the selected skills are always among them
	let collapsed = $derived(collapsedSkills(skills, active.skills));
	let rows = $derived([
		{ kind: 'hard' as const, chips: collapsed.hard },
		{ kind: 'soft' as const, chips: collapsed.soft }
	]);
	// "All N skills" goes at the end of the first row there is
	let toggleRow = $derived(collapsed.hard.length > 0 ? 'hard' : 'soft');

	let query = $state('');
	let expanded = $state(false);
	// Nothing to expand when the rows hold every skill (a resize, an edit): they show instead
	let open = $derived(expanded && collapsed.more !== 'never');
	let groups = $derived(open ? skillGroups(skills, query) : null);
	let container: HTMLElement | undefined = $state();

	const total = $derived(experiences.length);
	let status = $derived(isActive ? m.countOf(resultCount, total) : m.count(total));
	let selectedNames = $derived(active.skills.map((key) => skills.byKey.get(key)?.label ?? key));

	const groupId = (group: SkillGroup) => `${uid}-${group.category ?? group.kind}`;

	/** The button that shows every skill, or folds them again: one at a time is in the page */
	const toggleButton = () => container?.querySelector<HTMLElement>('[data-skills-toggle]');

	/**
	 * Shows every skill in place, or folds them again. Either way the focus stays on the button,
	 * which is not the same element once the panel changed
	 */
	const toggleExpanded = async () => {
		expanded = !open;
		if (!expanded) query = '';
		await tick();
		toggleButton()?.focus();
	};

	const selectSkill = async (key: string, event: MouseEvent) => {
		const button = event.currentTarget as HTMLElement;
		filters = toggleSkill(active, key);
		await tick();
		// A skill the rows showed only because it was selected leaves them once it is not: the focus
		// stays in the panel rather than going back to the page's body
		if (!button.isConnected || button.getClientRects().length === 0) {
			(toggleButton() ?? container)?.focus();
		}
	};

	const clearFilters = async () => {
		filters = emptyFilters();
		query = '';
		await tick();
		container?.focus();
	};

	// The URL follows the filters so a filtered view can be shared (the page reads it on load).
	// Shallow routing: no load, scroll and focus stay. replaceState (deprecated in SvelteKit 3 for
	// goto(url, { shallow: true })) because it runs no navigation hooks: a shallow goto would run
	// the page's afterNavigate, which reads page.url (not updated by shallow routing) back into the
	// filters, and SvelteKit's route announcer would read out the page title on a chip press.
	// page.url keeps the URL of the last real navigation: compare with the browser's.
	// The first run is skipped: the filters come from that URL, and the router may not be started
	// yet during hydration.
	let urlReady = false;
	$effect(() => {
		const next = active;
		if (!urlReady) {
			urlReady = true;
			return;
		}
		const current = new URLSearchParams(location.search);
		const search = filtersToSearchParams(next, current).toString();
		if (search === current.toString()) return;
		untrack(() => {
			const domain = page.params.domain;
			if (!domain) return;
			const target = search
				? resolve(`/[domain]/experiences?${search}`, { domain })
				: resolve('/[domain]/experiences', { domain });
			replaceState(target, page.state).catch(() => {});
		});
	});

	/**
	 * A skill's tag. `selected`: filtered by; `included`: part of a skill filtered by (its
	 * projects match too); `part`: drawn beside the skill it is part of, a size down
	 */
	const chip = (state: 'selected' | 'included' | 'plain', part: boolean) =>
		`chip min-h-11 max-w-full border md:min-h-8 ${part ? 'md:min-h-7 md:text-xs' : 'font-medium'} ${
			state === 'selected'
				? 'preset-filled-primary-700-300 border-primary-700-300'
				: state === 'included'
					? 'preset-tonal-primary border-transparent'
					: 'border-surface-300-700 text-surface-800-200'
		}`;

	// The first column of a row from md up: its label (under md the label is above its tags)
	const ROW = 'md:grid md:grid-cols-[9.5rem_minmax(0,1fr)] md:gap-x-4';
	const ROW_LABEL =
		'mb-1.5 text-xs font-semibold tracking-wide text-surface-700-300 uppercase md:mb-0 md:pt-2';
</script>

<!-- A skill's tag: pressing it filters by the skill. Beside its name, how long it was used
	("9 yrs") and, in the folded rows, how many skills are part of it ("+6"): both at a glance, so
	the tag is named by the skill alone and says them in full as its description (a text of its
	own inside the tag, hidden: only aria-describedby reads it).
	data-preview: hovered or focused, the page shows the projects using the skill, or a skill
	that is part of it (ProjectPreview.svelte), and that preview describes the tag meanwhile -->
{#snippet skillTag(skill: RankedSkill, options: { folded?: boolean; part?: boolean } = {})}
	{@const selected = active.skills.includes(skill.key)}
	{@const included =
		!selected && skill.parentKey !== undefined && active.skills.includes(skill.parentKey)}
	{@const time = formatShortDuration(skill.months)}
	{@const parts = skill.childKeys.length}
	{@const details = m.skillDetails(formatMonthCount(skill.months), parts)}
	{@const detailsId = `${uid}-about-${skills.rank.get(skill.key) ?? 0}`}
	<button
		type="button"
		class={chip(selected ? 'selected' : included ? 'included' : 'plain', options.part ?? false)}
		aria-pressed={selected}
		aria-describedby={details ? detailsId : undefined}
		data-preview="skill:{skill.key}"
		data-included={included || undefined}
		onclick={(event) => selectSkill(skill.key, event)}
	>
		{#if selected}<Check size="14" class="shrink-0" aria-hidden="true" />{/if}
		<!-- Its own line height: the tag's is the size of its text, which would cut a "g" or a
			"y" of a name long enough to be cut short -->
		<span class="truncate leading-5">{skill.label}</span>
		{#if time}
			<!-- Quieter than the name on a plain tag, by the muted text colour: never by opacity, which
				takes a selected tag's text under the contrast its name has -->
			<span
				class="shrink-0 font-normal {selected || included ? '' : 'text-surface-700-300'}"
				aria-hidden="true"
				data-skill-time>{time}</span
			>
		{/if}
		{#if options.folded && parts > 0}
			<span
				class="shrink-0 font-normal {selected || included ? '' : 'text-surface-700-300'}"
				aria-hidden="true"
				data-skill-parts>+{parts}</span
			>
		{/if}
		{#if details}<span id={detailsId} class="sr-only" aria-hidden="true">{details}</span>{/if}
	</button>
{/snippet}

<!-- "All N skills", then "Show less" in its place at the top of every skill -->
{#snippet skillsToggle()}
	<button
		type="button"
		class="btn btn-sm preset-tonal min-h-11 shrink-0 md:min-h-8"
		aria-expanded={open}
		aria-controls="{uid}-skills"
		data-skills-toggle
		onclick={toggleExpanded}
	>
		{open ? m.showLess : m.allSkills(collapsed.total)}
		<ChevronDown
			size="16"
			aria-hidden="true"
			class="shrink-0 transition-transform motion-reduce:transition-none {open ? 'rotate-180' : ''}"
		/>
	</button>
{/snippet}

{#if skills.ranked.length > 0}
	<section
		bind:this={container}
		tabindex="-1"
		aria-label={m.filterExperiences}
		class="card preset-outlined-surface-200-800 bg-surface-50-950 flex flex-col gap-3 p-3 shadow-sm outline-offset-2 md:p-4"
		data-skills-expanded={open || undefined}
	>
		<div id="{uid}-skills" role="group" aria-labelledby="{uid}-skills-title" class="space-y-3">
			<!-- Labels, not headings: the page outline stays the experiences -->
			<p id="{uid}-skills-title" class="sr-only">{m.skills}</p>
			{#if open && groups}
				<div class="flex items-center gap-2 md:gap-3">
					<label class="relative block min-w-0 flex-1">
						<span class="sr-only">{m.searchSkills}</span>
						<MagnifyingGlass
							size="16"
							aria-hidden="true"
							class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-surface-600-400"
						/>
						<input
							type="search"
							class="input min-h-11 pl-9 text-base text-ellipsis md:min-h-9 md:text-sm"
							placeholder={m.searchPlaceholder(collapsed.total)}
							autocomplete="off"
							bind:value={query}
						/>
					</label>
					<p class="text-xs whitespace-nowrap text-surface-700-300 max-md:hidden">
						{m.sortedByTime}
					</p>
					{@render skillsToggle()}
				</div>
				{#each groups.groups as group (group.category ?? group.kind)}
					<div
						role="group"
						aria-labelledby={groupId(group)}
						class={groups.categorized ? ROW : ''}
						data-skill-group={group.category ?? group.kind}
					>
						<!-- Without categories the two lists are named for screen readers only -->
						<p id={groupId(group)} class={groups.categorized ? ROW_LABEL : 'sr-only'}>
							{group.category ? skillCategoryLabel(group.category) : m.kinds[group.kind]}
							<span class="font-normal">{group.count}</span>
						</p>
						<ul class="flex flex-wrap items-start gap-2 md:gap-1.5">
							{#each group.families as family (family.skill.key)}
								{#if family.children.length > 0}
									<!-- A skill and the skills that are part of it, drawn together -->
									<li class="max-w-full">
										<ul
											class="flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-surface-400-600 p-1"
											aria-label={m.family(family.skill.label)}
											data-skill-family={family.skill.key}
										>
											<li class="max-w-full">{@render skillTag(family.skill)}</li>
											{#each family.children as child (child.key)}
												<li class="max-w-full">{@render skillTag(child, { part: true })}</li>
											{/each}
										</ul>
									</li>
								{:else}
									<li class="max-w-full">{@render skillTag(family.skill)}</li>
								{/if}
							{/each}
						</ul>
					</div>
				{/each}
				<!-- What the search found, said to screen readers as it changes (always in the page, so its
					changes are read), and shown when it found nothing. Not a status: the panel has one,
					the experiences' count -->
				<p
					class={groups.count === 0 ? 'text-sm text-surface-700-300' : 'sr-only'}
					aria-live="polite"
					data-skill-search-result
				>
					{query.trim()
						? groups.count === 0
							? m.noSkillMatches(query.trim())
							: m.skillsFound(groups.count)
						: ''}
				</p>
			{:else}
				{#each rows as row (row.kind)}
					{#if row.chips.length > 0}
						<div
							role="group"
							aria-labelledby="{uid}-{row.kind}"
							class={ROW}
							data-skill-row={row.kind}
						>
							<p id="{uid}-{row.kind}" class={ROW_LABEL}>{m.rows[row.kind]}</p>
							<ul class="flex flex-wrap items-center gap-2 md:gap-1.5">
								{#each row.chips as { skill, small } (skill.key)}
									<!-- Small screens show fewer of them: by CSS, the server cannot know the screen -->
									<li class="max-w-full {small ? '' : 'max-md:hidden'}">
										{@render skillTag(skill, { folded: true })}
									</li>
								{/each}
								{#if row.kind === toggleRow && collapsed.more !== 'never'}
									<li class={collapsed.more === 'small' ? 'md:hidden' : ''}>
										{@render skillsToggle()}
									</li>
								{/if}
							</ul>
						</div>
					{/if}
				{/each}
			{/if}
		</div>

		<!-- Always in the page so screen readers hear the count change; shown when filtering, with
			the skills filtered by (the search box can hide their tags) -->
		<div
			class={isActive
				? 'flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-surface-200-800 pt-3'
				: 'sr-only'}
		>
			<p role="status" class="text-sm font-medium">{status}</p>
			{#if isActive}
				<!-- Small screens: the count and Clear on one line, the skills under them -->
				<p
					class="min-w-0 text-sm text-surface-700-300 wrap-anywhere max-md:order-last max-md:w-full"
					data-filtered-by
				>
					{m.filteredBy(selectedNames)}
				</p>
				<button
					type="button"
					class="btn btn-sm preset-tonal ml-auto min-h-11 md:min-h-8"
					onclick={clearFilters}
				>
					{m.clearFilters}
				</button>
			{/if}
		</div>
	</section>
{/if}
