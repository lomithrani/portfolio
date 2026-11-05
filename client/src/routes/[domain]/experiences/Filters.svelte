<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { ExperienceType } from 'portfolio-common';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { Check, ChevronDown, MagnifyingGlass, XMark } from 'svelte-heros-v2';
	import { experienceTypeLabels } from '#components/experience-list/experienceList.ts';
	import {
		activeFilters,
		emptyFilters,
		filtersToSearchParams,
		hasActiveFilters,
		normalizeSkill,
		skillOptions,
		toggleSkill,
		toggleType,
		typeOptions,
		type ExperienceFilters,
		type SkillOption
	} from '#services/filters.ts';

	let {
		experiences,
		filters = $bindable(),
		resultCount
	}: {
		/** Every experience of the page, unfiltered */
		experiences: ExperienceModel[];
		filters: ExperienceFilters;
		/** How many experiences the filters keep */
		resultCount: number;
	} = $props();

	const uid = $props.id();
	/** Above this many skills, a search box narrows the lists */
	const SEARCH_THRESHOLD = 12;

	// Selections the data no longer has are ignored (and leave the URL on the next change)
	let active = $derived(activeFilters(experiences, filters));
	let isActive = $derived(hasActiveFilters(active));
	let types = $derived(typeOptions(experiences, filters));
	let skills = $derived(skillOptions(experiences));
	let skillCount = $derived(skills.hard.length + skills.soft.length);
	let labels = $derived(
		new Map([...skills.hard, ...skills.soft].map((option) => [option.key, option.label]))
	);

	let query = $state('');
	// Small screens: the skill lists are behind a toggle (always shown from md up)
	let skillsOpen = $state(false);
	let container: HTMLElement | undefined = $state();
	let selectedList: HTMLElement | undefined = $state();

	const matches = (option: SkillOption) =>
		normalizeSkill(option.label).includes(normalizeSkill(query));
	let sections = $derived([
		{ kind: 'hard', label: 'Technical', options: skills.hard.filter(matches) },
		{ kind: 'soft', label: 'Soft', options: skills.soft.filter(matches) }
	]);
	let noMatch = $derived(sections.every((section) => section.options.length === 0));

	const total = $derived(experiences.length);
	const plural = (count: number) => (count === 1 ? 'experience' : 'experiences');
	let status = $derived(
		isActive ? `${resultCount} of ${total} ${plural(total)}` : `${total} ${plural(total)}`
	);

	const selectType = (type: ExperienceType | null) => {
		filters = type ? toggleType(active, type) : { ...active, types: [] };
	};

	const selectSkill = (key: string) => {
		filters = toggleSkill(active, key);
	};

	/** Removes a selected skill and keeps the focus in the selected row (or on the toolbar) */
	const removeSkill = async (key: string) => {
		const index = active.skills.indexOf(key);
		filters = toggleSkill(active, key);
		await tick();
		const remaining = selectedList?.querySelectorAll<HTMLButtonElement>('button') ?? [];
		const next = remaining[Math.min(index, remaining.length - 1)];
		(next ?? container)?.focus();
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

	const chip = (selected: boolean) =>
		`chip min-h-11 shrink-0 border font-medium md:min-h-8 ${
			selected
				? 'preset-filled-primary-700-300 border-primary-700-300'
				: 'border-surface-300-700 text-surface-800-200'
		}`;
</script>

{#if types.types.length > 1 || skillCount > 0}
	<section
		bind:this={container}
		tabindex="-1"
		aria-label="Filter experiences"
		class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-3 shadow-sm outline-offset-2 md:p-4"
	>
		{#if types.types.length > 1}
			<!-- Small screens: one scrolling row (the padding keeps the focus rings visible) -->
			<div
				role="group"
				aria-label="Experience type"
				class="-mx-3 flex gap-2 overflow-x-auto px-3 py-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:py-0"
			>
				<button
					type="button"
					class={chip(active.types.length === 0)}
					aria-pressed={active.types.length === 0}
					onclick={() => selectType(null)}
				>
					All <span class="tabular-nums opacity-75">{types.all}</span>
				</button>
				{#each types.types as option (option.type)}
					{@const selected = active.types.includes(option.type)}
					<button
						type="button"
						class={chip(selected)}
						aria-pressed={selected}
						onclick={() => selectType(option.type)}
					>
						{experienceTypeLabels[option.type]}
						<span class="tabular-nums opacity-75">{option.count}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if skillCount > 0}
			<button
				type="button"
				class="btn preset-tonal min-h-11 w-full justify-between md:hidden"
				aria-expanded={skillsOpen}
				aria-controls="{uid}-skills"
				onclick={() => (skillsOpen = !skillsOpen)}
			>
				<span>
					Filter skills{#if active.skills.length > 0}&nbsp;({active.skills.length}){/if}
				</span>
				<ChevronDown
					size="18"
					aria-hidden="true"
					class="transition-transform motion-reduce:transition-none {skillsOpen
						? 'rotate-180'
						: ''}"
				/>
			</button>

			<div
				id="{uid}-skills"
				role="group"
				aria-labelledby="{uid}-skills-title"
				class="space-y-3 {skillsOpen ? '' : 'hidden'} md:block {types.types.length > 1
					? 'md:border-t md:border-surface-200-800 md:pt-3'
					: ''}"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<!-- Labels, not headings: the page outline stays the experiences -->
					<p id="{uid}-skills-title" class="hidden text-sm font-semibold md:block">Skills</p>
					{#if skillCount > SEARCH_THRESHOLD}
						<label class="relative block w-full md:w-60">
							<span class="sr-only">Search skills</span>
							<MagnifyingGlass
								size="16"
								aria-hidden="true"
								class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-surface-600-400"
							/>
							<input
								type="search"
								class="input min-h-11 pl-9 text-base md:min-h-9 md:text-sm"
								placeholder="Search skills"
								autocomplete="off"
								bind:value={query}
							/>
						</label>
					{/if}
				</div>

				{#each sections as section (section.kind)}
					{#if section.options.length > 0}
						<div
							role="group"
							aria-labelledby="{uid}-{section.kind}"
							class="md:flex md:items-start md:gap-3"
						>
							<p
								id="{uid}-{section.kind}"
								class="mb-1.5 text-xs font-semibold tracking-wide text-surface-700-300 uppercase md:mb-0 md:w-20 md:shrink-0 md:pt-2"
							>
								{section.label}
							</p>
							<ul class="flex flex-wrap content-start items-start gap-2 md:gap-1.5">
								{#each section.options as option (option.key)}
									{@const selected = active.skills.includes(option.key)}
									<li>
										<button
											type="button"
											class={chip(selected)}
											aria-pressed={selected}
											onclick={() => selectSkill(option.key)}
										>
											{#if selected}<Check size="14" aria-hidden="true" />{/if}
											{option.label}
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/each}
				{#if noMatch}
					<p class="text-sm text-surface-700-300">No skill matches “{query.trim()}”.</p>
				{/if}
			</div>
		{/if}

		<!-- Always in the page so screen readers hear the count change; shown when filtering.
			Small screens: the count and Clear on one line, the selected skills below -->
		<div
			class={isActive
				? 'flex flex-wrap items-center gap-2 border-t border-surface-200-800 pt-3'
				: 'sr-only'}
		>
			<p role="status" class="text-sm font-medium">{status}</p>
			{#if active.skills.length > 0}
				<ul
					bind:this={selectedList}
					class="order-last flex w-full flex-wrap items-center gap-2 md:order-none md:w-auto"
					aria-label="Selected skills"
				>
					{#each active.skills as key (key)}
						<li>
							<button
								type="button"
								class="{chip(true)} pr-1.5"
								aria-label="Remove {labels.get(key) ?? key} filter"
								onclick={() => removeSkill(key)}
							>
								{labels.get(key) ?? key}
								<XMark size="14" aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if isActive}
				<button
					type="button"
					class="btn btn-sm preset-tonal ml-auto min-h-11 md:min-h-8"
					onclick={clearFilters}
				>
					Clear filters
				</button>
			{/if}
		</div>
	</section>
{/if}
