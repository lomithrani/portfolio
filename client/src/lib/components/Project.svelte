<script lang="ts">
	import type { Project, Skill as SkillModel } from 'portfolio-api/models/database';
	import Skill from './Skill.svelte';
	import Markdown from './Markdown.svelte';
	import { formatMonthRange } from '#services/experienceDates.ts';

	let {
		project,
		experienceId,
		highlightSkill = () => false
	}: {
		project: Project;
		experienceId: string;
		/** Whether a skill (by display name) matches the active filters */
		highlightSkill?: (displayName: string) => boolean;
	} = $props();

	// The API populates the skills (GET /domain/:name)
	const skillsOf = (entries: Project['hardSkills']) =>
		entries
			.map((entry) => entry.skill as SkillModel)
			.filter((skill) => typeof skill?.displayName === 'string');

	let headingId = $derived(`project-${experienceId}-${String(project._id ?? '')}`);
	let period = $derived(formatMonthRange(project.start, project.end));
	let hardSkills = $derived(skillsOf(project.hardSkills));
	let softSkills = $derived(skillsOf(project.softSkills));
</script>

<article class="space-y-1.5" aria-labelledby={headingId}>
	<div class="flex flex-wrap items-baseline justify-between gap-x-3">
		<h3 class="font-semibold" id={headingId}>{project.name}</h3>
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
