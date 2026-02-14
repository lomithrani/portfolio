import type { Experience, Skill } from 'portfolio-api/models/database';

export type SkillFilters = {
  softSkills: Set<string>;
  hardSkills: Set<string>;
};

export function filterExperiences(
  experiences: Experience[],
  filters: SkillFilters
): Experience[] {
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
