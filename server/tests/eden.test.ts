// Starts the real server (bun index.ts) against MONGO_URL (local, or from
// TEST_MONGO_URL) on PORT and talks to it with the same typed Eden client the
// web app uses. HOST is left unset, so this also covers the '::' default and
// its IPv4 fallback on IPv6-less hosts. The suite seeds its own domain (named
// with a unique suffix, removed after) and each describe block starts its own
// server, so tests pass in any order (--randomize).
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { connect } from 'node:net'
import { treaty } from '@elysiajs/eden'
import type { Subprocess } from 'bun'
import mongoose from 'mongoose'
import type { Portfolio } from '..'
import { env } from '../env'
import { Domain, User } from '../models/database'
import { assertDisposableDatabase } from './testDatabase'

const serverDir = `${import.meta.dir}/..`
const port = Number(Bun.env.PORT ?? 3000)
const baseUrl = `http://127.0.0.1:${port}`
const api = treaty<Portfolio>(baseUrl)

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const DOMAIN_NAME = `eden-${suffix}`
const ADMIN_EMAIL = `eden-${suffix}@example.com`

interface Server {
  process: Subprocess<'ignore', 'pipe', 'pipe'>
  /** Everything the server printed so far (stdout and stderr) */
  output: () => string
  /** Resolves once stdout and stderr are closed: output() is then complete */
  outputClosed: Promise<unknown>
}

const waitForHealthy = async (server: Server, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.process.exitCode !== null) return false
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

/** Spawns the API on PORT and waits until /health answers 200 */
const startServer = async (): Promise<Server> => {
  // The memory line is logged at startup whatever the interval (unless 0)
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(port),
    MEMORY_LOG_INTERVAL_MS: '600000'
  }
  delete childEnv.HOST
  const child = Bun.spawn({
    cmd: ['bun', 'index.ts'],
    cwd: serverDir,
    env: childEnv,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe'
  })
  let output = ''
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder()
    for await (const chunk of stream) output += decoder.decode(chunk)
  }
  const server = {
    process: child,
    output: () => output,
    outputClosed: Promise.all([collect(child.stdout), collect(child.stderr)])
  }

  if (!(await waitForHealthy(server))) {
    child.kill()
    await child.exited
    throw new Error(`server did not become healthy on ${baseUrl}:\n${output}`)
  }
  return server
}

/** The server's output once a line matches `pattern` (or after `timeoutMs`, for the caller's assertions to fail) */
const waitForOutput = async (server: Server, pattern: RegExp, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs
  while (!pattern.test(server.output()) && Date.now() < deadline) await Bun.sleep(20)
  return server.output()
}

/**
 * Sends a request over a raw socket, to control its framing (fetch always
 * sends one valid Content-Length or a chunked body), and resolves with the
 * response's status and text once the server closes the connection
 */
const rawRequest = (head: string[], body: string) =>
  new Promise<{ status: number; text: string }>((resolve) => {
    let response = ''
    const socket = connect(port, '127.0.0.1')
    const done = () => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ status: Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1] ?? 0), text: response })
    }
    const timer = setTimeout(done, 10_000)
    socket.setEncoding('latin1')
    socket.on('data', (chunk: string) => (response += chunk))
    // The server may answer, then close, before the whole body is sent
    socket.on('error', done)
    socket.on('close', done)
    socket.write(`${[...head, 'Host: 127.0.0.1', 'Connection: close'].join('\r\n')}\r\n\r\n`)
    socket.write(body)
  })

/** `text` as a chunked body, in 64 KiB chunks */
const chunked = (text: string) => {
  let body = ''
  for (let start = 0; start < text.length; start += 64 * 1024) {
    const chunk = text.slice(start, start + 64 * 1024)
    body += `${chunk.length.toString(16)}\r\n${chunk}\r\n`
  }
  return `${body}0\r\n\r\n`
}

/** Kills the server if it still runs, and waits until it has exited (PORT is free again) */
const stopServer = async (server: Server | undefined) => {
  if (!server) return
  if (server.process.exitCode === null) server.process.kill()
  await server.process.exited
}

// Set once beforeAll has connected. afterAll then always cleans up: after a
// dropped connection Mongoose waits for it to come back, or the hook fails
let connected = false

const removeSeed = async () => {
  const admin = await User.findOne({ email: ADMIN_EMAIL })
  await Domain.deleteMany({ $or: [{ name: DOMAIN_NAME }, ...(admin ? [{ admin: admin._id }] : [])] })
  await User.deleteMany({ email: ADMIN_EMAIL })
}

beforeAll(async () => {
  assertDisposableDatabase()
  // The suite's own domain, which the server then reads from the same database
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 })
  connected = true
  const admin = await User.create({ email: ADMIN_EMAIL, name: 'Eden', surname: 'Suite' })
  await Domain.create({ name: DOMAIN_NAME, admin: admin._id, experiences: [] })
})

afterAll(async () => {
  if (!connected) return
  await removeSeed()
  await mongoose.disconnect()
})

describe('typed Eden client against the running server', () => {
  let server: Server | undefined

  beforeAll(async () => {
    server = await startServer()
  }, 30_000)

  afterAll(async () => {
    await stopServer(server)
  })

  test('exposes the routes the web app calls', () => {
    expect(api.login.post).toBeFunction()
    expect(api.isLogged.get).toBeFunction()
    expect(api.logout.get).toBeFunction()
    expect(api.domain({ name: DOMAIN_NAME }).get).toBeFunction()
    expect(api.domain.claim.post).toBeFunction()
    expect(api.experiences.post).toBeFunction()
    expect(api.experiences({ id: 'x' }).put).toBeFunction()
    expect(api.experiences({ id: 'x' }).delete).toBeFunction()
    expect(api.experiences.import.get).toBeFunction()
    expect(api.experiences.import.post).toBeFunction()
  })

  test('DELETE /experiences/:id requires a session', async () => {
    const { data, error } = await api.experiences({ id: '0123456789abcdef01234567' }).delete()
    expect(data).toBeNull()
    expect(error?.status as number).toBe(401)
  })

  test('GET /experiences/import needs a session', async () => {
    const { error } = await api.experiences.import.get()
    expect(error?.status as number).toBe(401)
  })

  test('caps request bodies at 1 MB, and at 6 MB (Bun) for the résumé import', async () => {
    const MB = 1024 * 1024
    const origin = env.ALLOWED_DOMAINS[0]
    // {"file":""} is 11 characters; fetch sends Content-Length, as browsers do
    const post = (path: string, bytes: number) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ file: 'x'.repeat(bytes - 11) })
      })

    const tooLarge = await post('/experiences', MB + 1)
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.text()).toBe('Payload Too Large')
    // The browser can read the 413 (CORS headers present)
    expect(tooLarge.headers.get('access-control-allow-origin')).toBe(origin)

    // Past both caps, to the route: no session
    expect((await post('/experiences/import', 6 * MB)).status).toBe(401)

    // Over Bun's own cap: refused before the app runs
    expect((await post('/experiences/import', 6 * MB + 1)).status).toBe(413)
  })

  test('caps bodies without a usable Content-Length at 1 MB too: chunked, or with the header repeated', async () => {
    const MB = 1024 * 1024
    const origin = env.ALLOWED_DOMAINS[0]
    // Valid JSON, so that only the size can refuse it: {"title":""} is 12 characters
    const json = (bytes: number) => JSON.stringify({ title: 'x'.repeat(bytes - 12) })
    const head = ['POST /experiences HTTP/1.1', 'Content-Type: application/json', `Origin: ${origin}`]

    const tooLarge = await rawRequest([...head, 'Transfer-Encoding: chunked'], chunked(json(2 * MB)))
    expect(tooLarge.status).toBe(413)
    expect(tooLarge.text).toContain('Payload Too Large')
    expect(tooLarge.text.toLowerCase()).toContain(`access-control-allow-origin: ${origin}`)

    // Up to 1 MB, a chunked body reaches the route: no session
    expect((await rawRequest([...head, 'Transfer-Encoding: chunked'], chunked(json(MB)))).status).toBe(401)

    // The header twice: "2097152, 2097152" is not a number for the Content-Length check
    const body = json(2 * MB)
    const repeated = await rawRequest([...head, `Content-Length: ${body.length}`, `Content-Length: ${body.length}`], body)
    expect(repeated.status).toBe(413)
  })

  test('GET /health', async () => {
    const { data, status } = await api.health.get()
    expect(status).toBe(200)
    expect(data).toBe('OK')
  })

  test('GET /domain/:name returns the seeded domain', async () => {
    const { data, error, status } = await api.domain({ name: DOMAIN_NAME }).get()
    expect(error).toBeNull()
    expect(status).toBe(200)
    expect(data?.name).toBe(DOMAIN_NAME)
    expect(data?.admin).toBeDefined()
    expect(data?.experiences).toBeArray()
  })

  test('GET /domain/:name answers 404 for an unknown domain', async () => {
    const { data, error } = await api.domain({ name: `no-such-domain-${suffix}` }).get()
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

  test('logs the telemetry state and a one-line memory record at startup', async () => {
    // Logged right after listening, before /health answers, but stdout is read
    // asynchronously: wait for the memory line (the later of the two)
    const output = await waitForOutput(server!, /^\[INFO\] memory \{.*\}$/m)
    // Either state: tests/setup.ts removes ANTHROPIC_API_KEY, but the server
    // loads server/.env again, which may set it
    expect(output).toMatch(
      /^\[INFO\] Running at .+"telemetry":"(off \(.+\)|traces=\w+ metrics=\w+ logs=\w+)","resumeImport":"(off|on) \(.+\)"\}$/m
    )
    const memoryLine = output.match(/^\[INFO\] memory (\{.*\})$/m)
    expect(memoryLine).not.toBeNull()
    const fields = JSON.parse(memoryLine![1])
    expect(Object.keys(fields)).toEqual([
      'rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers',
      'objectCount', 'protectedObjectCount', 'topObjectTypes'
    ])
    for (const name of ['rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers']) {
      expect(Math.round(fields[name] * 10) / 10).toBe(fields[name])
    }
    expect(fields.objectCount).toBeInteger()
    expect(fields.topObjectTypes).toMatch(/^(\S+=\d+ ){7}\S+=\d+$/)
  })
})

describe('graceful shutdown', () => {
  // Its own server: the other block's server keeps running for all its tests
  let server: Server | undefined

  beforeAll(async () => {
    server = await startServer()
  }, 30_000)

  afterAll(async () => {
    await stopServer(server)
  })

  test('shuts down gracefully on SIGTERM', async () => {
    server!.process.kill('SIGTERM')
    const exitCode = await server!.process.exited
    await server!.outputClosed
    expect(exitCode).toBe(0)
    expect(server!.output()).toContain('SIGTERM received, shutting down')
  }, 15_000)
})
