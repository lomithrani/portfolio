import { t } from "elysia";

// Route params that must be a MongoDB ObjectId (rejected with 422 otherwise)
export const objectIdParams = t.Object({
  id: t.String({ pattern: '^[0-9a-fA-F]{24}$' })
})
