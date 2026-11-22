<script lang="ts">
	import type { PresentedSkill, Project } from 'portfolio-api/models/database';
	import Skill from './Skill.svelte';
	import Markdown from './Markdown.svelte';
	import { formatProjectMonths, type ExperiencePeriod } from '#services/experienceDates.ts';
	import {
		foldSkills,
		orderSkillsByRank,
		skillMatchesKey,
		type SkillIndex
	} from '#services/filters.ts';
	import { m } from './Project.messages.ts';

	let {
		project,
		experienceId,
		within = { ongoing: true },
		highlightSkill = () => false,
		revealed = false,
		previewed = false,
		skills,
		previewSkill = null
	}: {
		project: Project;
		experienceId: string;
		/** The period of its experience: a project without an end stopped with it when it ended */
		within?: ExperiencePeriod;
		/** Whether a skill (by display name) matches the active filters */
		highlightSkill?: (displayName: string) => boolean;
		/** Briefly outlined: it was picked on the timeline */
		revealed?: boolean;
		/** Outlined: it uses the skill whose tag is hovered or focused (see ProjectPreview) */
		previewed?: boolean;
		/** The skills of the page, ranked: the tags are listed the most used on the page first */
		skills?: SkillIndex;
		/** Key of the skill whose tag is hovered or focused: its tags here are never folded away */
		previewSkill?: string | null;
	} = $props();

	// The API populates the skills and presents each as the catalogue knows it (GET /domain/:name)
	const skillsOf = (entries: Project['hardSkills']) => {
		const presented = entries
			.map((entry) => entry.skill as PresentedSkill)
			.filter((skill) => typeof skill?.displayName === 'string');
		return skills ? orderSkillsByRank(presented, skills.rank) : presented;
	};

	let headingId = $derived(`project-${experienceId}-${String(project._id ?? '')}`);
	let period = $derived(formatProjectMonths(project, within));
	let hardSkills = $derived(skillsOf(project.hardSkills));
	let softSkills = $derived(skillsOf(project.softSkills));
	// Uses a skill the list is filtered by: the project stands out in its card
	let matches = $derived(
		[...hardSkills, ...softSkills].some((skill) => highlightSkill(skill.displayName))
	);

	// Beyond its first tags of a kind, the rest fold behind a "+N" button that shows them in place
	// (see foldSkills). Never one that matches the filters, or the skill being previewed: what the
	// page points at stays in sight
	const pinned = (skill: PresentedSkill) =>
		highlightSkill(skill.displayName) ||
		(previewSkill !== null && skillMatchesKey(skill.displayName, previewSkill, skills?.taxonomy));
	let lists = $derived([
		{ kind: 'hard' as const, label: m.technicalSkills, ...foldSkills(hardSkills, pinned) },
		{ kind: 'soft' as const, label: m.softSkills, ...foldSkills(softSkills, pinned) }
	]);
	let unfolded = $state({ hard: false, soft: false });
</script>

<!-- The negative margin takes back the padding: the text stays aligned with the other projects,
	the tint of a matching one reaches past it -->
<article
	class="-mx-2 scroll-mt-4 space-y-1.5 rounded-md px-2 py-1.5 motion-safe:transition-colors {matches
		? 'bg-[color-mix(in_oklab,var(--color-primary-500)_12%,transparent)] shadow-[inset_3px_0_0_var(--color-primary-500)]'
		: ''} {revealed
		? 'ring-2 ring-primary-500'
		: previewed
			? 'ring-2 ring-primary-500 ring-inset'
			: ''}"
	aria-labelledby={headingId}
	data-matched={matches || undefined}
	data-revealed={revealed || undefined}
	data-previewed={previewed || undefined}
>
	<div class="flex flex-wrap items-baseline justify-between gap-x-3">
		<h3 class="font-semibold" id={headingId}>
			{project.name}{#if matches}<span class="sr-only">&nbsp;{m.usesSelectedSkills}</span>{/if}
		</h3>
		{#if period}
			<p class="text-xs text-surface-700-300 whitespace-nowrap">{period}</p>
		{/if}
	</div>
	{#if project.summary}
		<div class="text-sm">
			<Markdown content={project.summary} headingOffset={3} compact />
		</div>
	{/if}
	{#if hardSkills.length > 0 || softSkills.length > 0}
		<!-- Technical skills, then soft skills on their own line in a lighter tint (Skill.svelte):
			the order and the names tell them apart -->
		<div class="space-y-1.5 pt-1">
			{#each lists as list (list.kind)}
				{@const open = unfolded[list.kind]}
				{#if list.shown.length > 0 || list.hidden.length > 0}
					<ul class="flex flex-wrap items-center gap-1.5" aria-label={list.label}>
						{#each open ? [...list.shown, ...list.hidden] : list.shown as skill, index (index)}
							<li class="max-w-full">
								<Skill
									{skill}
									variant={list.kind}
									highlighted={highlightSkill(skill.displayName)}
								/>
							</li>
						{/each}
						{#if list.hidden.length > 0}
							<li>
								<!-- As tall as a tag: the row keeps its height. Its name says what it shows -->
								<button
									type="button"
									class="chip min-w-9 border border-surface-300-700 font-medium text-surface-800-200 hover:preset-tonal"
									aria-expanded={open}
									aria-label={open ? undefined : m.showMoreSkills(list.hidden.length)}
									data-more-skills={list.kind}
									onclick={() => (unfolded[list.kind] = !open)}
								>
									{open ? m.fewerSkills : `+${list.hidden.length}`}
								</button>
							</li>
						{/if}
					</ul>
				{/if}
			{/each}
		</div>
	{/if}
</article>
