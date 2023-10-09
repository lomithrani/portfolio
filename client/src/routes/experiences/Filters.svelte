<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models';
	export let experiences: ExperienceModel[];

	export let

	let softSkills = new Set(
		experiences.flatMap((experience) =>
			experience.projects.flatMap((project) => project.softSkills.map((x) => x.name))
		)
	);
	let hardSkills = new Set(
		experiences.flatMap((experience) =>
			experience.projects.flatMap((project) => project.hardSkills.map((x) => x.name))
		)
	);
</script>

<div class="w-full grid grid-cols-1 md:grid-cols-2 p-2">
	<div class="card p-1 variant-ghost">
		{#each softSkills as softSkill}
			<span
				class="chip {false ? 'variant-ringed-primary' : 'variant-soft'}"
				on:click={() => {}}
				on:keypress
			>
				{#if false}<span>(icon)</span>{/if}
				<span class="capitalize">{softSkill}</span>
			</span>
		{/each}
	</div>
	<div class="card p-2 variant-ghost">
		{#each hardSkills as hardskill}
			<span
				class="chip {false ? 'variant-filled' : 'variant-soft'} m-1 p-1"
				on:click={() => {}}
				on:keypress
			>
				{#if true}<span>(icon)</span>{/if}
				<span class="capitalize">{hardskill}</span>
			</span>{/each}
	</div>
</div>
