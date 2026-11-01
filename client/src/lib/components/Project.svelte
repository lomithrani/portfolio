<script lang="ts">
	import type { Project, Skill as SkillModel } from 'portfolio-api/models/database';
	import Skill from './Skill.svelte';
	import Markdown from './Markdown.svelte';
	let {
		project,
		experienceId,
		activeFilters = { softSkills: new Set<string>(), hardSkills: new Set<string>() }
	}: {
		project: Project;
		experienceId: string;
		activeFilters?: { softSkills: Set<string>; hardSkills: Set<string> };
	} = $props();

	const castSkill = (skill: unknown) => {
		return skill as SkillModel;
	};

	const formatDate = (date: unknown) => {
		if (!date) return '';
		const d = date instanceof Date ? date : new Date(String(date));
		return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
	};
</script>

<div class="card preset-tonal-surface p-3 space-y-2 shadow-sm">
	<article>
		<h3 class="font-semibold" id={`project-${experienceId}-${String(project._id ?? '')}`}>
			{project.name}
		</h3>
		<p class="text-xs opacity-70">{formatDate(project.start)} — {formatDate(project.end)}</p>
		<div class="text-sm mt-1">
			<Markdown content={project.summary ?? ''} />
		</div>

		{#if project.hardSkills.length > 0 || project.softSkills.length > 0}
			<div class="flex flex-wrap gap-1 pt-2">
				{#each project.hardSkills as hardSkill, index (index)}
					<Skill
						skill={castSkill(hardSkill.skill)}
						highlighted={activeFilters.hardSkills.has(castSkill(hardSkill.skill).displayName)}
					/>
				{/each}
				{#each project.softSkills as softSkill, index (index)}
					<Skill
						skill={castSkill(softSkill.skill)}
						highlighted={activeFilters.softSkills.has(castSkill(softSkill.skill).displayName)}
					/>
				{/each}
			</div>
		{/if}
	</article>
</div>

