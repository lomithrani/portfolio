// Starts the real server (bun index.ts) against MONGO_URL (local, or from
// TEST_MONGO_URL: it gets seeded) on PORT and talks to it with the same typed
// Eden client the web app uses. HOST is left unset, so
// this also covers the '::' default and its IPv4 fallback on IPv6-less hosts.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { treaty } from '@elysiajs/eden'
import type { Subprocess } from 'bun'
import type { Portfolio } from '..'
import { assertDisposableDatabase } from './testDatabase'

const serverDir = `${import.meta.dir}/..`
const port = Number(Bun.env.PORT ?? 3000)
const baseUrl = `http://127.0.0.1:${port}`
const api = treaty<Portfolio>(baseUrl)

let server: Subprocess<'ignore', 'pipe', 'pipe'> | undefined
let output = ''

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const decoder = new TextDecoder()
  for await (const chunk of stream) output += decoder.decode(chunk)
}

const waitForHealthy = async (timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) return false
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.status === 200) return true
    } catch {
      // not listening yet
    }
    await Bun.sleep(200)
  }
  return false
}

beforeAll(async () => {
  assertDisposableDatabase()
  // Idempotent: makes sure the 'louis.gentil' domain exists
  const seed = Bun.spawnSync({ cmd: ['bun', 'run', 'tests/seedDb.ts'], cwd: serverDir, env: process.env })
  if (seed.exitCode !== 0) throw new Error(`seeding failed:\n${seed.stderr.toString()}`)

  const env: Record<string, string | undefined> = { ...process.env, PORT: String(port) }
  delete env.HOST
  server = Bun.spawn({
    cmd: ['bun', 'index.ts'],
    cwd: serverDir,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe'
  })
  void collect(server.stdout)
  void collect(server.stderr)

  if (!(await waitForHealthy())) {
    server.kill()
    throw new Error(`server did not become healthy on ${baseUrl}:\n${output}`)
  }
}, 30_000)

afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill()
    await server.exited
  }
})

describe('typed Eden client against the running server', () => {
  test('exposes the routes the web app calls', () => {
    expect(api.login.post).toBeFunction()
    expect(api.isLogged.get).toBeFunction()
    expect(api.logout.get).toBeFunction()
    expect(api.domain({ name: 'louis.gentil' }).get).toBeFunction()
    expect(api.domain.claim.post).toBeFunction()
    expect(api.experiences.post).toBeFunction()
    expect(api.experiences({ id: 'x' }).put).toBeFunction()
  })

  test('GET /health', async () => {
    const { data, status } = await api.health.get()
    expect(status).toBe(200)
    expect(data).toBe('OK')
  })

  test('GET /domain/:name returns the seeded domain', async () => {
    const { data, error, status } = await api.domain({ name: 'louis.gentil' }).get()
    expect(error).toBeNull()
    expect(status).toBe(200)
    expect(data?.name).toBe('louis.gentil')
    expect(data?.admin).toBeDefined()
    expect(data?.experiences).toBeArray()
  })

  test('GET /domain/:name answers 404 for an unknown domain', async () => {
    const { data, error } = await api.domain({ name: 'no-such-domain-xyz' }).get()
    expect(data).toBeNull()
    // Eden types only the declared (422) error; runtime statuses are wider
    expect(error?.status as number).toBe(404)
  })

  test('unmatched paths answer 404', async () => {
    const response = await fetch(`${baseUrl}/wp-admin/setup.php`)
    expect(response.status).toBe(404)
  })

  test('POST /login rejects an invalid Google token with 401', async () => {
    const { error } = await api.login.post({ token: 'not-a-google-token' })
    expect(error?.status as number).toBe(401)
  })
})

test('shuts down gracefully on SIGTERM', async () => {
  server!.kill('SIGTERM')
  const exitCode = await server!.exited
  expect(exitCode).toBe(0)
  expect(output).toContain('SIGTERM received, shutting down')
}, 15_000)
