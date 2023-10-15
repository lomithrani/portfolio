<script lang="ts">
	import { Check } from 'svelte-heros-v2';
	import type { Experience as ExperienceModel } from 'portfolio-api/models';
	export let experiences: ExperienceModel[];

	let softSkillsMap = experiences
		.flatMap((e) => e.projects.flatMap((p) => p.softSkills))
		.reduce((map, skill) => map.set(skill.name, skill), new Map());
	let softSkills = Array.from(softSkillsMap.values());

	let hardSkillsMap = experiences
		.flatMap((e) => e.projects.flatMap((p) => p.hardSkills))
		.reduce((map, skill) => map.set(skill.name, skill), new Map());
	let hardSkills = Array.from(hardSkillsMap.values());

	export let filters: { softSkills: Set<string>; hardSkills: Set<string> } = {
		softSkills: new Set(),
		hardSkills: new Set()
	};
</script>

<div class="w-full grid grid-cols-1 md:grid-cols-2 p-2">
	<div class="card m-1 p-1 variant-ghost">
		{#each softSkills as softSkill, index}
			{@const selected = filters.softSkills.has(softSkill.name)}
			<span
				role="checkbox"
				aria-checked={selected}
				tabindex={index}
				class="chip {selected ? 'variant-ringed-primary' : 'variant-soft'}"
				on:click={() => {
					// we need to reassign filters to trigger svelte reactivity
					if (!selected) {
						filters = {
							...filters,
							softSkills: new Set([...filters.softSkills, softSkill.name])
						};
					} else {
						filters = {
							...filters,
							softSkills: new Set(
								[...filters.softSkills].filter((existingSkill) => existingSkill !== softSkill.name)
							)
						};
					}
				}}
				on:keypress
			>
				{#if selected}<Check size="12px" />{/if}
				<span class="capitalize">{softSkill.name}</span>
			</span>
		{/each}
	</div>
	<div class="card m-1 p-1 variant-ghost">
		{#each hardSkills as hardSkill, index}
			{@const selected = filters.hardSkills.has(hardSkill.name)}
			<span
				role="checkbox"
				aria-checked={selected}
				tabindex={index}
				class="chip {selected ? 'variant-ringed-primary' : 'variant-soft'}"
				on:click={() => {
					// we need to reassign filters to trigger svelte reactivity
					if (!selected) {
						filters = {
							...filters,
							hardSkills: new Set([...filters.hardSkills, hardSkill.name])
						};
					} else {
						filters = {
							...filters,
							hardSkills: new Set(
								[...filters.hardSkills].filter((existingSkill) => existingSkill !== hardSkill.name)
							)
						};
					}
				}}
				on:keypress
			>
				{#if selected}<Check size="12px" />{/if}
				<span class="capitalize">{hardSkill.name}</span>
			</span>
		{/each}
	</div>
</div>
