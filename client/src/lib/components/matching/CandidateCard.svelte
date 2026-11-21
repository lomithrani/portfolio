<!--
@component
A candidate's anonymous card, as the API gives it (readAnonymousCard of #services/matching.ts): the
headline they wrote, their months of professional experience, their roles (the time in each, held
now or not) and their skills with the time they were used. It computes nothing and shows nothing
else: never a name, an address, a company, a place or a score. Beside it, for a recruiter's job,
the outcomes the candidate's journey shows (`outcomes`: never the commute or the places, never a
score), and whether the candidate said they are interested in the job. Without `outcomes` (the
candidate's own preview) that section is left out. The heading takes the focus when the deck
moves to this card (`headingId`, tabindex -1).
-->
<script lang="ts">
	import { Briefcase, CheckCircle, EyeSlash, HandThumbUp, Sparkles } from 'svelte-heros-v2';
	import { formatMonthCount } from '#services/experienceDates.ts';
	import type { AnonymousCard } from '#services/matching.ts';
	import type { JobMatchCriterion } from '#services/workflow.ts';
	import CriterionOutcomes from './CriterionOutcomes.svelte';
	import { m } from './cards.messages.ts';

	let {
		card,
		outcomes,
		interested = false,
		headingId,
		headingLevel = 2
	}: {
		card: AnonymousCard;
		/** How the recruiter's job does on the candidate's criteria; none in a preview */
		outcomes?: readonly JobMatchCriterion[];
		/** The candidate said they are interested in the recruiter's job */
		interested?: boolean;
		/** The heading's id: the deck moves the focus to it */
		headingId?: string;
		headingLevel?: 2 | 3;
	} = $props();

	const uid = $props.id();
	let titleId = $derived(headingId ?? `${uid}-title`);
	let titleTag = $derived(`h${headingLevel}`);
	let sectionTag = $derived(`h${headingLevel + 1}`);
	let heading = $derived(card.headline ?? card.roles[0]?.title ?? m.candidate.anonymous);
	let experience = $derived(
		card.experienceMonths >= 1
			? m.candidate.experience(formatMonthCount(card.experienceMonths))
			: m.candidate.noExperience
	);

	const roleTime = (months: number | null) =>
		months === null
			? m.candidate.noDates
			: months < 1
				? m.candidate.underAMonth
				: formatMonthCount(months);
</script>

<article
	class="card preset-outlined-surface-200-800 space-y-5 bg-surface-50-950 p-4 sm:p-6"
	aria-labelledby={titleId}
>
	<header class="space-y-2">
		{#if interested}
			<p class="badge preset-filled-primary-500 gap-1.5">
				<HandThumbUp size="14" aria-hidden="true" />
				{m.candidate.interested}
			</p>
		{/if}
		<svelte:element
			this={titleTag}
			id={titleId}
			tabindex="-1"
			class="text-xl font-bold break-words outline-none focus-visible:ring-2 focus-visible:ring-primary-500 md:text-2xl"
		>
			{heading}
		</svelte:element>
		<p class="text-surface-700-300">{experience}</p>
	</header>

	{#if card.roles.length > 0}
		<section class="space-y-2" aria-labelledby="{uid}-roles">
			<svelte:element
				this={sectionTag}
				id="{uid}-roles"
				class="flex items-center gap-2 text-sm font-semibold"
			>
				<Briefcase size="16" aria-hidden="true" />
				{m.candidate.roles}
			</svelte:element>
			<ul class="divide-y divide-surface-200-800 rounded-container border border-surface-200-800">
				{#each card.roles as role, index (index)}
					<li class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
						<span class="min-w-0 font-medium break-words">{role.title}</span>
						<span class="flex shrink-0 items-center gap-2 text-sm text-surface-700-300">
							{roleTime(role.months)}
							{#if role.current}
								<span class="badge preset-tonal-success">{m.candidate.current}</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if card.skills.length > 0}
		<section class="space-y-2" aria-labelledby="{uid}-skills">
			<svelte:element
				this={sectionTag}
				id="{uid}-skills"
				class="flex items-center gap-2 text-sm font-semibold"
			>
				<Sparkles size="16" aria-hidden="true" />
				{m.candidate.skills}
			</svelte:element>
			<ul class="flex flex-wrap gap-1.5">
				{#each card.skills as skill, index (index)}
					<li class="chip preset-tonal max-w-full py-1 text-sm break-words whitespace-normal">
						{#if skill.months !== null && skill.months >= 1}
							<span class="sr-only"
								>{m.candidate.skillTime(skill.name, formatMonthCount(skill.months))}</span
							>
							<span aria-hidden="true">
								<span class="font-medium">{skill.name}</span>
								<span class="text-surface-700-300">· {formatMonthCount(skill.months)}</span>
							</span>
						{:else}
							<span class="font-medium">{skill.name}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if outcomes}
		<section class="space-y-2" aria-labelledby="{uid}-outcomes">
			<svelte:element this={sectionTag} id="{uid}-outcomes" class="text-sm font-semibold">
				{m.candidate.outcomes}
			</svelte:element>
			<p class="flex items-start gap-2 text-sm">
				<CheckCircle size="18" class="mt-px shrink-0 text-success-700-300" aria-hidden="true" />
				{m.candidate.reaches}
			</p>
			{#if outcomes.length > 0}
				<CriterionOutcomes criteria={outcomes} audience="recruiter" />
			{:else}
				<p class="text-sm text-surface-700-300">{m.candidate.noOutcomes}</p>
			{/if}
		</section>
	{/if}

	<p class="flex items-start gap-2 text-xs text-surface-700-300">
		<EyeSlash size="16" class="shrink-0" aria-hidden="true" />
		{m.candidate.anonymity}
	</p>
</article>
