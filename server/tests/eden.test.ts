import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { treaty } from '@elysiajs/eden'
import type { Portfolio } from '..'
import { Subprocess, fetch } from 'bun';

let appInstance: Subprocess<"ignore", "inherit", "inherit"> | undefined = undefined;

const api = treaty<Portfolio>("http://localhost:3000");

beforeAll(async () => {
  appInstance = Bun.spawn({
    cmd: ['bun', 'run', 'index.ts'],
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  await waitForHealthCheck()
});

afterAll(() => {
  if (appInstance) {
    appInstance.kill();
  }
});


test("edenTreaty should have correct methods", async () => {
  expect(api).toBeDefined()
  expect(api.login.post).toBeDefined()
  expect(api.domain[':name'].get).toBeDefined()
})

// Remove waiting for:  https://github.com/elysiajs/eden/issues/125
test("edentTreaty should return correct responses", async () => {
  const mySelfDomainResponse = await api.domain['louis.gentil'].get()
  expect(mySelfDomainResponse).toBeDefined()
  expect(mySelfDomainResponse.status).toBe(200)
  expect(mySelfDomainResponse.data).toBeDefined()
  expect(mySelfDomainResponse.data).toBeObject()
})

async function waitForHealthCheck(url = "http://localhost:3000/health", maxAttempts = 10, interval = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 200) {
        console.log("Service is healthy!");
        return true;
      } else {
        console.log(`Attempt ${attempt}: Received status ${response.status}. Retrying in ${interval / 1000} seconds...`);
      }
    } catch (error) {
      console.log(`Attempt ${attempt}: Error occurred - ${error}. Retrying in ${interval / 1000} seconds...`);
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  console.log("Failed to receive a 200 status after max attempts.");
  return false;
}