import { test, expect } from 'bun:test'
import { treaty } from '@elysiajs/eden'
import type { Portfolio } from 'portfolio-api'

const api = treaty<Portfolio>("");

test("edenTreaty should have correct methods", async () => {
  expect(api).toBeDefined()
  expect(api.login.post).toBeDefined()
  expect((api.domain as any)[':name'].get).toBeDefined()
  expect(api.experiences.post).toBeDefined()
})
