import Elysia, { t } from "elysia";

export const experienceRequest = new Elysia()
  .model({
    'experienceRequest': t.Object({
      type: t.String(),
      title: t.String(),
      summary: t.String(),
    })
  })