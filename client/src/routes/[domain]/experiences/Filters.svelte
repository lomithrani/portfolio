<script lang="ts">
	import { Check } from 'svelte-heros-v2';
	import type { Experience as ExperienceModel, Skill } from 'portfolio-api/models/database';

	let { allExperiences, filters = $bindable({ softSkills: new Set<string>(), hardSkills: new Set<string>() }) }: {
		allExperiences: ExperienceModel[];
		filters?: { softSkills: Set<string>; hardSkills: Set<string> };
	} = $props();

	let softSkills = $derived(
		Array.from(
			allExperiences
				.flatMap((e) => e.projects.flatMap((p) => p.softSkills))
				.reduce((map, skill) => map.set((skill.skill as Skill).displayName, skill.skill), new Map())
				.values()
		)
	);

	let hardSkills = $derived(
		Array.from(
			allExperiences
				.flatMap((e) => e.projects.flatMap((p) => p.hardSkills))
				.reduce((map, skill) => map.set((skill.skill as Skill).displayName, skill.skill), new Map())
				.values()
		)
	);
</script>

<div class="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
	<div class="card p-3 preset-tonal-surface flex flex-wrap gap-1 shadow-sm">
		{#each softSkills as softSkill, index}
			{@const selected = filters.softSkills.has(softSkill.displayName)}
			<button
				type="button"
				role="checkbox"
				aria-checked={selected}
				class="chip {selected ? 'preset-outlined-primary-700-300' : 'preset-tonal-surface'}"
				onclick={() => {
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
				<span class="inline-block w-3">{#if selected}<Check size="12px" />{/if}</span>
				<span class="capitalize">{softSkill.displayName}</span>
			</button>
		{/each}
	</div>
	<div class="card p-3 preset-tonal-surface flex flex-wrap gap-1 shadow-sm">
		{#each hardSkills as hardSkill, index}
			{@const selected = filters.hardSkills.has(hardSkill.displayName)}
			<button
				type="button"
				role="checkbox"
				aria-checked={selected}
				class="chip {selected ? 'preset-outlined-primary-700-300' : 'preset-tonal-surface'}"
				onclick={() => {
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
				<span class="inline-block w-3">{#if selected}<Check size="12px" />{/if}</span>
				<span class="capitalize">{hardSkill.displayName}</span>
			</button>
		{/each}
	</div>
</div>
