<script lang="ts">
	import type { Project } from 'portfolio-api/models';
	import Skill from './Skill.svelte';
	export let project: Project;
	export let experienceId: String;
</script>

<div class="block card card-hover variant-ghost-secondary p-2 m-1">
	<article>
		<h3 id={`${project.name}_${experienceId}`}>{project.name}</h3>
		<h4 data-toc-ignore>{project.start} - {project.end}</h4>
		<p>{project.summary}</p>

		<div>
			{#each project.hardSkills as hardSkill}
				<Skill skill={hardSkill} />
			{/each}
			{#each project.softSkills as softSkill}
				<Skill skill={softSkill} />
			{/each}
		</div>
	</article>
</div>
