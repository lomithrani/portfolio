<script lang="ts">
	import type { Project, Skill as SkillModel } from 'portfolio-api/models/database';
	import Skill from './Skill.svelte';
	import Markdown from './Markdown.svelte';
	import { formatProjectMonths, type ExperiencePeriod } from '#services/experienceDates.ts';

	let {
		project,
		experienceId,
		within = { ongoing: true },
		highlightSkill = () => false,
		revealed = false,
		previewed = false
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
	} = $props();

	// The API populates the skills (GET /domain/:name)
	const skillsOf = (entries: Project['hardSkills']) =>
		entries
			.map((entry) => entry.skill as SkillModel)
			.filter((skill) => typeof skill?.displayName === 'string');

	let headingId = $derived(`project-${experienceId}-${String(project._id ?? '')}`);
	let period = $derived(formatProjectMonths(project, within));
	let hardSkills = $derived(skillsOf(project.hardSkills));
	let softSkills = $derived(skillsOf(project.softSkills));
	// Uses a skill the list is filtered by: the project stands out in its card
	let matches = $derived(
		[...hardSkills, ...softSkills].some((skill) => highlightSkill(skill.displayName))
	);
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
			{project.name}{#if matches}<span class="sr-only">&nbsp;(uses the selected skills)</span>{/if}
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
			{#if hardSkills.length > 0}
				<ul class="flex flex-wrap gap-1.5" aria-label="Technical skills">
					{#each hardSkills as skill, index (index)}
						<li>
							<Skill {skill} variant="hard" highlighted={highlightSkill(skill.displayName)} />
						</li>
					{/each}
				</ul>
			{/if}
			{#if softSkills.length > 0}
				<ul class="flex flex-wrap gap-1.5" aria-label="Soft skills">
					{#each softSkills as skill, index (index)}
						<li>
							<Skill {skill} variant="soft" highlighted={highlightSkill(skill.displayName)} />
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</article>
