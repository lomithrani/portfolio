<script lang="ts">
	import type { Experience } from 'portfolio-api/models/database';

	import Project from './Project.svelte';

	export let experience: Experience;
</script>

<div class="block card card-hover variant-ghost-primary p-2 m-1">
	<article>
		<h2 id={`${experience._id}`}>{experience.title}</h2>
		<p>{experience.summary}</p>

		<ul>
			{#each experience.projects as project}
				<Project {project} experienceId={`${experience._id}`} />
			{/each}
		</ul>
	</article>
</div>
