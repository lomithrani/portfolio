import { jwtVerify } from 'jose'
import { Types } from 'mongoose'
import { env } from '../env'
import { User } from '../models/database'

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

/**
 * Whether the account of a session still exists. A session JWT outlives its
 * account (DELETE /me only clears the cookie of the device that asked), so
 * userLogged checks it: a deleted account's sessions on other devices get
 * 401 and cannot recreate data (a portfolio, a journey) under its id. An
 * object, so tests that use a session of an unsaved user can stub it
 */
export const sessionAccounts = {
  exists: async (userId: string): Promise<boolean> =>
    Types.ObjectId.isValid(userId) && !!(await User.exists({ _id: userId }))
}
