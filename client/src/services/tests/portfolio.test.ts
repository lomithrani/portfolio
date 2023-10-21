import { test, expect } from 'bun:test'
import { edenTreaty } from '@elysiajs/eden'
import type { Portfolio } from 'portfolio-api'

const api = edenTreaty<Portfolio>("");

test("edenTreaty should have correct methods", () => {
  expect(api).toBeDefined()
  expect(api.login.post).toBeDefined()
  expect(api.domain[':name'].get).toBeDefined()
  expect(api.experiences.post).toBeDefined()
})
