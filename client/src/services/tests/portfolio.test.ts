import { test, expect } from 'bun:test'
import { edenTreaty } from '@elysiajs/eden'
import type { Portfolio } from 'portfolio-api'
import { ExperienceType } from 'portfolio-common';

const api = edenTreaty<Portfolio>("");

test("edenTreaty should have correct methods", async () => {
  expect(api).toBeDefined()
  expect(api.login.post).toBeDefined()
  expect(api.domain[':name'].get).toBeDefined()
  expect(api.experiences.post).toBeDefined()
  let { data, error } = await api.domain[''].get();
})
