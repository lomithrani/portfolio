<script lang="ts">
	import type { Experience } from 'portfolio-api/models';
	export let experience: Experience;
	export let index: Number;
</script>

<div class="block card card-hover p-2 m-1">
	<article>
		<h2 id={`${experience._id}`}>{experience.title}</h2>
		<p>{experience.summary}</p>

		<ul>
			{#each experience.projects as project}
				<li>
					{@html JSON.stringify(project, null, '\t')}
				</li>
			{/each}
		</ul>
	</article>
</div>
