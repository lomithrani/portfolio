import { t } from "elysia";
import { ExperienceType } from "portfolio-common";

// Generous bounds: they only stop abusive payloads (documents are served on
// every public GET /domain/:name), never what the admin forms produce.
const MAX_TEXT = 20_000; // markdown summaries
const MAX_NAME = 300;
// The client caps icon files at 16 KB, i.e. a ~22 KB base64 data URL
const MAX_ICON = 32_768;

export const skillModel = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  level: t.Number({ minimum: -1, maximum: 100 })
})

export const projectModel = t.Object({
  name: t.String({ maxLength: MAX_NAME }),
  start: t.Optional(t.Date()),
  end: t.Optional(t.Date()),
  summary: t.String({ maxLength: MAX_TEXT }),
  hardSkills: t.Array(skillModel, { maxItems: 100 }),
  softSkills: t.Array(skillModel, { maxItems: 100 })
})

export const companyModel = t.Object({
  name: t.String({ maxLength: 200 }),
  summary: t.Optional(t.String({ maxLength: 5_000 })),
  svg: t.Optional(t.String({ maxLength: 100_000 })),
})

export const experienceRequest = t.Object({
  type: t.Union([
    t.Literal(ExperienceType.Educational),
    t.Literal(ExperienceType.Professional),
    t.Literal(ExperienceType.Leisure),
    t.Literal(ExperienceType.Personal),
  ]),
  title: t.String({ maxLength: MAX_NAME }),
  company: t.Optional(companyModel),
  summary: t.String({ maxLength: MAX_TEXT }),
  icon: t.Optional(t.String({ maxLength: MAX_ICON })),
  projects: t.Array(projectModel, { maxItems: 50 }),
})
