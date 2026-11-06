import { t } from "elysia";
import { EXPERIENCE_LIMITS, ExperienceType } from "portfolio-common";

// Limits shared with the client's form validation (portfolio-common). The
// company logo is not edited by the client, only sent back as received.
const MAX_COMPANY_SVG = 100_000;

export const skillModel = t.Object({
  name: t.String({ minLength: 1, maxLength: EXPERIENCE_LIMITS.skillName }),
  level: t.Number({ minimum: -1, maximum: 100 })
})

// Dates have month precision: stored as UTC midnight of the 1st of the month
export const projectModel = t.Object({
  // Not blank: also trimmed on save, a whitespace-only name answers 422
  name: t.String({ minLength: 1, maxLength: EXPERIENCE_LIMITS.projectName }),
  start: t.Optional(t.Date()),
  // Unset: ongoing (when start is set)
  end: t.Optional(t.Date()),
  summary: t.String({ maxLength: EXPERIENCE_LIMITS.text }),
  hardSkills: t.Array(skillModel, { maxItems: EXPERIENCE_LIMITS.skillsPerProject }),
  softSkills: t.Array(skillModel, { maxItems: EXPERIENCE_LIMITS.skillsPerProject })
})

export const companyModel = t.Object({
  // A blank name means "no company"
  name: t.String({ maxLength: EXPERIENCE_LIMITS.companyName }),
  summary: t.Optional(t.String({ maxLength: EXPERIENCE_LIMITS.companySummary })),
  svg: t.Optional(t.String({ maxLength: MAX_COMPANY_SVG })),
})

export const experienceRequest = t.Object({
  type: t.Union([
    t.Literal(ExperienceType.Educational),
    t.Literal(ExperienceType.Professional),
    t.Literal(ExperienceType.Leisure),
    t.Literal(ExperienceType.Personal),
  ]),
  // Not blank: also trimmed on save, a whitespace-only title answers 422
  title: t.String({ minLength: 1, maxLength: EXPERIENCE_LIMITS.title }),
  company: t.Optional(companyModel),
  // Trimmed; blank means none
  location: t.Optional(t.String({ maxLength: EXPERIENCE_LIMITS.location })),
  start: t.Optional(t.Date()),
  // Unset with a start: ongoing ("Present")
  end: t.Optional(t.Date()),
  summary: t.String({ maxLength: EXPERIENCE_LIMITS.text }),
  icon: t.Optional(t.String({ maxLength: EXPERIENCE_LIMITS.icon })),
  projects: t.Array(projectModel, { maxItems: EXPERIENCE_LIMITS.projects }),
})
