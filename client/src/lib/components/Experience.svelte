<script lang="ts">
	import type { Experience } from 'portfolio-api/models';
	export let experience: Experience;
</script>

<div class="block card card-hover p-4">
	<article>
		<h2>{experience.title}</h2>
		<p>{experience.summary}</p>

		<ul>
			{#each experience.projects as project}
				<li>
					{project}
				</li>
			{/each}
		</ul>
	</article>
</div>
