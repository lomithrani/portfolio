import type { Experience, Skill } from 'portfolio-api/models/database';

export type SkillFilters = {
	softSkills: Set<string>;
	hardSkills: Set<string>;
};

const skillNames = (experiences: Experience[], kind: keyof SkillFilters): Set<string> =>
	new Set(
		experiences.flatMap((experience) =>
			experience.projects.flatMap((project) =>
				project[kind].map((entry) => (entry.skill as Skill).displayName)
			)
		)
	);

/**
 * The selected filters whose skill is still used by `experiences`. A filter whose skill an edit
 * removed has no chip left to clear it, so it is ignored instead of hiding every experience.
 */
export function activeSkillFilters(experiences: Experience[], filters: SkillFilters): SkillFilters {
	const softSkills = skillNames(experiences, 'softSkills');
	const hardSkills = skillNames(experiences, 'hardSkills');
	return {
		softSkills: new Set([...filters.softSkills].filter((name) => softSkills.has(name))),
		hardSkills: new Set([...filters.hardSkills].filter((name) => hardSkills.has(name)))
	};
}

export function filterExperiences(experiences: Experience[], filters: SkillFilters): Experience[] {
	if (filters.softSkills.size === 0 && filters.hardSkills.size === 0) {
		return experiences;
	}
	return experiences.filter((experience) =>
		experience.projects.some(
			(project) =>
				project.softSkills.some((softSkill) =>
					filters.softSkills.has((softSkill.skill as Skill).displayName)
				) ||
				project.hardSkills.some((hardSkill) =>
					filters.hardSkills.has((hardSkill.skill as Skill).displayName)
				)
		)
	);
}
