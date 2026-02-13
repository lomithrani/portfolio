<script lang="ts">
	import { Check } from 'svelte-heros-v2';
	import type { Experience as ExperienceModel, Skill } from 'portfolio-api/models/database';

	let { experiences, filters = $bindable({ softSkills: new Set<string>(), hardSkills: new Set<string>() }) }: {
		experiences: ExperienceModel[];
		filters?: { softSkills: Set<string>; hardSkills: Set<string> };
	} = $props();

	let softSkillsMap = experiences
		.flatMap((e) => e.projects.flatMap((p) => p.softSkills))
		.reduce((map, skill) => map.set((skill.skill as Skill).displayName, skill.skill), new Map());
	let softSkills = Array.from(softSkillsMap.values());

	let hardSkillsMap = experiences
		.flatMap((e) => e.projects.flatMap((p) => p.hardSkills))
		.reduce((map, skill) => map.set((skill.skill as Skill).displayName, skill.skill), new Map());
	let hardSkills = Array.from(hardSkillsMap.values());
</script>

<div class="w-full grid grid-cols-1 md:grid-cols-2 p-2">
	<div class="card m-1 p-1 variant-ghost">
		{#each softSkills as softSkill, index}
			{@const selected = filters.softSkills.has(softSkill.displayName)}
			<span
				role="checkbox"
				aria-checked={selected}
				tabindex={index}
				class="chip {selected ? 'variant-ringed-primary' : 'variant-soft'}"
				onclick={() => {
					// we need to reassign filters to trigger svelte reactivity
					if (!selected) {
						filters = {
							...filters,
							softSkills: new Set([...filters.softSkills, softSkill.displayName])
						};
					} else {
						filters = {
							...filters,
							softSkills: new Set(
								[...filters.softSkills].filter(
									(existingSkill) => existingSkill !== softSkill.displayName
								)
							)
						};
					}
				}}
	
			>
				{#if selected}<Check size="12px" />{/if}
				<span class="capitalize">{softSkill.displayName}</span>
			</span>
		{/each}
	</div>
	<div class="card m-1 p-1 variant-ghost">
		{#each hardSkills as hardSkill, index}
			{@const selected = filters.hardSkills.has(hardSkill.displayName)}
			<span
				role="checkbox"
				aria-checked={selected}
				tabindex={index}
				class="chip {selected ? 'variant-ringed-primary' : 'variant-soft'}"
				onclick={() => {
					// we need to reassign filters to trigger svelte reactivity
					if (!selected) {
						filters = {
							...filters,
							hardSkills: new Set([...filters.hardSkills, hardSkill.displayName])
						};
					} else {
						filters = {
							...filters,
							hardSkills: new Set(
								[...filters.hardSkills].filter(
									(existingSkill) => existingSkill !== hardSkill.displayName
								)
							)
						};
					}
				}}
	
			>
				{#if selected}<Check size="12px" />{/if}
				<span class="capitalize">{hardSkill.displayName}</span>
			</span>
		{/each}
	</div>
</div>
