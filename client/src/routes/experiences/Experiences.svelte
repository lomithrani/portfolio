<script lang="ts">
	import Experience from '$components/Experience.svelte';
	import type { Experience as ExperienceModel } from 'portfolio-api/models';
	export let experiences: ExperienceModel[];
</script>

{#each experiences as experience}
	<Experience {experience} />
{/each}
