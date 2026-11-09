import { jwtVerify } from 'jose'
import { env } from '../env'

// The session of a request read outside the userLogged plugin: by app.ts
// before a PDF import's body is read, and by the public routes that answer
// signed-in visitors differently (a portfolio's hiring journey, and the
// booking routes it gates).

/** The value of the request's session cookie ('auth'), if any */
const sessionCookie = (request: Request) => {
  for (const pair of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = pair.split('=')
    if (name.trim() === 'auth') return value.join('=').trim()
  }
  return undefined
}

/**
 * The user id of the request's session: a session JWT signed with
 * JWT_SECRET, unexpired, with a subject (what userLogged accepts).
 * Undefined without one: any cookie named auth is not enough
 */
export const sessionUserId = async (request: Request): Promise<string | undefined> => {
  const token = sessionCookie(request)
  if (!token) return undefined
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_SECRET))
    return payload.sub && payload.exp ? payload.sub : undefined
  } catch {
    return undefined
  }
}
