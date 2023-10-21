import { t } from "elysia";

export const experienceRequest = t.Object({
  type: t.String(),
  title: t.String(),
  summary: t.String(),
})
