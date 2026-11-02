import { auth, calendar as calendarApi } from '@googleapis/calendar'
import type { calendar_v3 } from '@googleapis/calendar'
import type { Types } from 'mongoose'
import { env } from '../env'
import { User } from '../models/database'
import {
  GoogleCalendarAuthorizationError,
  GoogleCalendarNotConnectedError,
  GoogleCalendarReconnectRequiredError
} from '../errors'
import { logger } from './logger'

// The Google OAuth tokens are `select: false` on the User schema: this module
// is the only place that loads them, and it never returns them.
const TOKEN_FIELDS = '+googleCalendar.refreshToken +googleCalendar.accessToken'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

/** Tags the events created by the app, so only bookings are listed or deleted */
export const APPOINTMENT_TAG = 'portfolio_appointment'

/**
 * Client timeout of an event insert. A booking waiting for Google longer than
 * a few times this is taken for abandoned (services/appointmentBookings.ts)
 */
export const EVENT_INSERT_TIMEOUT_MS = 30_000
/** Client timeout of an event lookup */
const EVENT_GET_TIMEOUT_MS = 10_000

type UserId = string | Types.ObjectId

export const RECONNECT_REQUIRED_MESSAGE =
  'Google Calendar access was revoked or has expired. Reconnect Google Calendar'

export function createOAuth2Client() {
  if (!env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleCalendarNotConnectedError('Google Calendar is not configured on this server')
  }
  // 'postmessage': the redirect URI of codes obtained with the Google Identity
  // Services popup code flow (AppointmentsTab.svelte)
  return new auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, 'postmessage')
}

const httpStatusOf = (error: unknown): number | undefined => {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/**
 * Whether Google refused an event insert, so no event exists. A timeout, a
 * network error or a 5xx may hide an event Google created; a 409 means one
 * with the requested id exists.
 */
export const isRejectedInsert = (error: unknown) => {
  // Refused credentials: Google created nothing
  if (error instanceof GoogleCalendarReconnectRequiredError) return true
  const status = httpStatusOf(error)
  return status !== undefined && status >= 400 && status < 500 && status !== 409
}

/** Token endpoint errors (RFC 6749, section 5.2) that make the stored grant unusable */
const REFUSED_GRANT_ERRORS = new Set(['invalid_grant', 'unauthorized_client'])

/**
 * Why Google refused the stored grant, or null for any other failure (network,
 * 5xx, 403 quota or calendar permission...). The token endpoint answers
 * invalid_grant when the refresh token was revoked, has expired or was issued
 * to another OAuth client, and unauthorized_client (401) when this client may
 * not use it. The Calendar API answers 401 to an access token revoked with its
 * grant: google-auth-library only sends tokens it believes valid for 5 more
 * minutes, and refreshes the others first. Not invalid_client: a wrong
 * GOOGLE_CLIENT_SECRET is a server fault, which reconnecting would not fix.
 */
export function refusedGrantReason(error: unknown): string | null {
  const response = (error as { response?: { status?: unknown; data?: unknown } } | null)?.response
  if (!response) return null
  const apiError = (response.data as { error?: unknown } | null | undefined)?.error
  // OAuth token endpoint: { error: 'invalid_grant', error_description }
  if (typeof apiError === 'string') return REFUSED_GRANT_ERRORS.has(apiError) ? apiError : null
  // Calendar API: { error: { code: 401, status: 'UNAUTHENTICATED', message } }
  return response.status === 401 ? 'unauthenticated' : null
}

async function exchangeCode(code: string) {
  try {
    const { tokens } = await createOAuth2Client().getToken(code)
    return tokens
  } catch (error) {
    const status = httpStatusOf(error)
    // 4xx: invalid, expired or reused code (invalid_grant), wrong client...
    if (status !== undefined && status >= 400 && status < 500) {
      logger.warn('Google Calendar authorization code rejected', { status })
      throw new GoogleCalendarAuthorizationError('Google rejected the authorization code')
    }
    throw error
  }
}

/**
 * Exchanges an authorization code from the admin's consent popup and stores
 * the tokens on the user. Google only returns a refresh token on the first
 * consent, so an existing one is kept when none comes back.
 */
export async function connectGoogleCalendar(userId: UserId, code: string) {
  const tokens = await exchangeCode(code)

  const grantedScopes = tokens.scope?.split(' ') ?? []
  if (!grantedScopes.includes(CALENDAR_SCOPE)) {
    throw new GoogleCalendarAuthorizationError('Calendar access was not granted')
  }

  const update: Record<string, unknown> = {
    'googleCalendar.connectedAt': new Date()
  }
  if (tokens.access_token) update['googleCalendar.accessToken'] = tokens.access_token
  if (tokens.expiry_date) update['googleCalendar.tokenExpiry'] = new Date(tokens.expiry_date)
  const clearRevoked = { 'googleCalendar.revokedAt': 1 }

  if (tokens.refresh_token) {
    update['googleCalendar.refreshToken'] = tokens.refresh_token
    await User.updateOne({ _id: userId }, { $set: update, $unset: clearRevoked })
    return
  }

  // No refresh token: only usable if one is already stored
  const result = await User.updateOne(
    { _id: userId, 'googleCalendar.refreshToken': { $exists: true } },
    { $set: update, $unset: clearRevoked }
  )
  if (result.matchedCount === 0) {
    throw new GoogleCalendarAuthorizationError(
      'Google did not grant offline access. Remove this app from your Google account permissions, then connect again'
    )
  }
}

export async function disconnectGoogleCalendar(userId: UserId) {
  await User.updateOne({ _id: userId }, { $unset: { googleCalendar: 1 } })
}

/**
 * Connection status, whose tokens are never returned. `revokedAt`: when Google
 * refused the stored grant, if the owner has not connected since
 */
export async function getCalendarConnection(userId: UserId) {
  // One read, so the status and its dates come from the same state. The
  // refresh token only tells whether one is stored. Projects the fields only:
  // projecting the parent path (googleCalendar) would load the access token too
  const user = await User.findById(userId)
    .select('googleCalendar.connectedAt googleCalendar.revokedAt +googleCalendar.refreshToken')
    .lean<{ googleCalendar?: { refreshToken?: string; connectedAt?: Date; revokedAt?: Date } }>()
  const stored = user?.googleCalendar
  const connected = Boolean(stored?.refreshToken)
  return {
    connected,
    connectedAt: (connected && stored?.connectedAt) || null,
    revokedAt: (!connected && stored?.revokedAt) || null
  }
}

/**
 * The stored grant each client of getCalendarClient uses: its refresh token,
 * and when it was connected. A reconnect sets a new connectedAt, even when
 * Google keeps the refresh token (it sends none on a repeated consent)
 */
interface CalendarGrant {
  userId: UserId
  refreshToken: string
  connectedAt: Date | null
}
const grants = new WeakMap<calendar_v3.Calendar, CalendarGrant>()

/** Matches the user while it still stores this grant */
const storedGrant = ({ userId, refreshToken, connectedAt }: CalendarGrant) => ({
  _id: userId,
  'googleCalendar.refreshToken': refreshToken,
  // null also matches a missing connectedAt
  'googleCalendar.connectedAt': connectedAt
})

/**
 * Clears a grant Google refused, keeping when it happened: the admin panel
 * then asks to reconnect, and visitors are offered nothing. A grant connected
 * since is kept.
 */
async function clearRefusedGrant(grant: CalendarGrant, reason: string) {
  const result = await User.updateOne(
    storedGrant(grant),
    {
      $unset: {
        'googleCalendar.refreshToken': 1,
        'googleCalendar.accessToken': 1,
        'googleCalendar.tokenExpiry': 1,
        'googleCalendar.connectedAt': 1
      },
      $set: { 'googleCalendar.revokedAt': new Date() }
    }
  )
  // Once, whatever the number of requests that ran into it
  if (result.modifiedCount === 0) return
  logger.warn('Google refused the stored Google Calendar grant: connection cleared', { reason })

  // Revoked at Google too: Google only sends a refresh token with the first
  // consent of a grant, and the consent popup cannot ask for another one. A
  // grant still alive at Google (a Calendar 401 for another reason) would
  // otherwise make reconnecting fail. Usually already gone: best effort
  try {
    await createOAuth2Client().revokeToken(grant.refreshToken)
  } catch {
    // Revoked or expired already (400 invalid_token), or Google unreachable
  }
}

/**
 * Runs a Calendar API call. When Google refuses the stored grant, it is
 * cleared and GoogleCalendarReconnectRequiredError (409) thrown: an expected
 * state, logged at warn by the error handler, not a server fault.
 */
async function callGoogle<T>(calendar: calendar_v3.Calendar, request: () => Promise<T>): Promise<T> {
  try {
    return await request()
  } catch (error) {
    const reason = refusedGrantReason(error)
    const grant = grants.get(calendar)
    if (reason === null || !grant) throw error
    await clearRefusedGrant(grant, reason)
    throw new GoogleCalendarReconnectRequiredError(RECONNECT_REQUIRED_MESSAGE)
  }
}

export async function getCalendarClient(userId: UserId): Promise<calendar_v3.Calendar> {
  const user = await User.findById(userId).select(TOKEN_FIELDS)
  const tokens = user?.googleCalendar

  if (!tokens?.refreshToken) {
    throw new GoogleCalendarNotConnectedError('Google Calendar not connected')
  }

  const client = createOAuth2Client()
  client.setCredentials({
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken ?? undefined,
    expiry_date: tokens.tokenExpiry?.getTime()
  })

  // Persist access tokens refreshed by the client, unless the grant changed
  // since it was loaded (disconnected, cleared, or connected again)
  const grant: CalendarGrant = {
    userId,
    refreshToken: tokens.refreshToken,
    connectedAt: tokens.connectedAt ?? null
  }
  client.on('tokens', (refreshed) => {
    const update: Record<string, unknown> = {}
    if (refreshed.access_token) update['googleCalendar.accessToken'] = refreshed.access_token
    if (refreshed.expiry_date) update['googleCalendar.tokenExpiry'] = new Date(refreshed.expiry_date)
    if (Object.keys(update).length === 0) return
    User.updateOne(storedGrant(grant), { $set: update }).catch((error: unknown) => {
      logger.error('Could not store the refreshed Google access token', {
        errorName: error instanceof Error ? error.name : typeof error
      })
    })
  })

  const calendar = calendarApi({ version: 'v3', auth: client })
  grants.set(calendar, grant)
  return calendar
}

export async function listCalendars(calendar: calendar_v3.Calendar) {
  const res = await callGoogle(calendar, () =>
    calendar.calendarList.list({
      minAccessRole: 'writer'
    })
  )

  return (res.data.items ?? [])
    .filter((c): c is calendar_v3.Schema$CalendarListEntry & { id: string } => !!c.id)
    .map((c) => ({
      id: c.id,
      summary: c.summary ?? c.id,
      primary: c.primary ?? false
    }))
}

export async function getFreeBusy(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  timezone: string
) {
  const res = await callGoogle(calendar, () =>
    calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: timezone,
        items: [{ id: calendarId }]
      }
    })
  )

  const result = res.data.calendars?.[calendarId]
  // Google reports per-calendar problems (notFound, no access) here instead
  // of failing the request: treating them as "free" would allow double bookings
  if (!result || (result.errors?.length ?? 0) > 0) {
    throw new Error(`FreeBusy failed for the schedule's calendar: ${result?.errors?.[0]?.reason ?? 'missing'}`)
  }

  return result.busy ?? []
}

export async function createEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  params: {
    /** Client-chosen id (base32hex, 5 to 1024 characters), so the event can be looked up whatever happens to the response */
    id?: string
    summary: string
    description?: string
    startTime: string
    endTime: string
    timezone: string
    attendeeEmail?: string
    addGoogleMeet?: boolean
  }
) {
  const event: calendar_v3.Schema$Event = {
    id: params.id,
    summary: params.summary,
    description: params.description,
    start: { dateTime: params.startTime, timeZone: params.timezone },
    end: { dateTime: params.endTime, timeZone: params.timezone },
    attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : undefined,
    conferenceData: params.addGoogleMeet
      ? {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      : undefined,
    extendedProperties: {
      private: { [APPOINTMENT_TAG]: 'true' }
    }
  }

  const res = await callGoogle(calendar, () =>
    calendar.events.insert(
      {
        calendarId,
        requestBody: event,
        conferenceDataVersion: params.addGoogleMeet ? 1 : 0,
        sendUpdates: 'all'
      },
      { timeout: EVENT_INSERT_TIMEOUT_MS }
    )
  )

  return res.data
}

export async function listUpcomingEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  maxResults = 20
) {
  const res = await callGoogle(calendar, () =>
    calendar.events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
      privateExtendedProperty: [`${APPOINTMENT_TAG}=true`]
    })
  )

  return res.data.items ?? []
}

/** The event, or null when Google answers 404/410 (deleted or unknown) */
export async function getEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string
) {
  try {
    const res = await callGoogle(calendar, () =>
      calendar.events.get({ calendarId, eventId }, { timeout: EVENT_GET_TIMEOUT_MS })
    )
    return res.data
  } catch (error) {
    const status = httpStatusOf(error)
    if (status === 404 || status === 410) return null
    throw error
  }
}

export const isAppointmentEvent = (event: calendar_v3.Schema$Event | null) =>
  event?.extendedProperties?.private?.[APPOINTMENT_TAG] === 'true' && event.status !== 'cancelled'

export async function deleteEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string
) {
  await callGoogle(calendar, () =>
    calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all'
    })
  )
}
