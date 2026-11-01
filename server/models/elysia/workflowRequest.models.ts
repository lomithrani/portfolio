import { t } from "elysia";

export const workflowRequest = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  enabled: t.Boolean(),
  description: t.Optional(t.String({ maxLength: 5_000 })),
})
