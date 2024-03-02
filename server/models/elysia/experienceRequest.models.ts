import { t } from "elysia";
import { ExperienceType } from "portfolio-common";
import { DateTime } from "./dateTime";


export const skillModel = t.Object({
  name: t.String(),
  svg: t.Optional(t.String()),
  level: t.Number()
})

export const projectModel = t.Object({
  name: t.String(),
  start: t.Optional(DateTime),
  end: t.Optional(DateTime),
  summary: t.String(),
  hardSkills: t.Array(skillModel),
  softSkills: t.Array(skillModel)
})

export const companyModel = t.Object({
  name: t.String(),
  summary: t.Optional(t.String()),
  svg: t.Optional(t.String()),
})

export const experienceRequest = t.Object({
  type: t.Union([
    t.Literal(ExperienceType.Educational),
    t.Literal(ExperienceType.Professional),
    t.Literal(ExperienceType.Leisure),
    t.Literal(ExperienceType.Personal),
  ]),
  title: t.String(),
  company: t.Optional(companyModel),
  summary: t.String(),
  projects: t.Array(projectModel),
})