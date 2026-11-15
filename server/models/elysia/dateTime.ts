import { t } from "elysia";

export const DateTime = t.Transform(t.String({ format: 'date-time' }))
  .Decode(value => new Date(value))
  .Encode(value => value.toISOString())