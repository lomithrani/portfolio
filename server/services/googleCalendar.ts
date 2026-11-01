import { auth, calendar as calendarApi } from '@googleapis/calendar'
import type { calendar_v3 } from '@googleapis/calendar'
import type { Types } from 'mongoose'
import { env } from '../env'
import { User } from '../models/database'
import { GoogleCalendarAuthorizationError, GoogleCalendarNotConnectedError } from '../errors'
import { logger } from './logger'

// The Google OAuth tokens are `select: false` on the User schema: this module
// is the only place that loads them, and it never returns them.
const TOKEN_FIELDS = '+googleCalendar.refreshToken +googleCalendar.accessToken'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

/** Tags the events created by the app, so only bookings are listed or deleted */
export const APPOINTMENT_TAG = 'portfolio_appointment'

type UserId = string | Types.ObjectId

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

  if (tokens.refresh_token) {
    update['googleCalendar.refreshToken'] = tokens.refresh_token
    await User.updateOne({ _id: userId }, { $set: update })
    return
  }

  // No refresh token: only usable if one is already stored
  const result = await User.updateOne(
    { _id: userId, 'googleCalendar.refreshToken': { $exists: true } },
    { $set: update }
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

/** Connection status, without loading the tokens */
export async function getCalendarConnection(userId: UserId) {
  // Projects connectedAt only: projecting the parent path (googleCalendar)
  // would return its select: false children too
  const user = await User.findOne(
    { _id: userId, 'googleCalendar.refreshToken': { $exists: true } },
    { 'googleCalendar.connectedAt': 1 }
  ).lean<{ googleCalendar?: { connectedAt?: Date } }>()
  return {
    connected: user !== null,
    connectedAt: user?.googleCalendar?.connectedAt ?? null
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

  // Persist access tokens refreshed by the client
  client.on('tokens', (refreshed) => {
    const update: Record<string, unknown> = {}
    if (refreshed.access_token) update['googleCalendar.accessToken'] = refreshed.access_token
    if (refreshed.expiry_date) update['googleCalendar.tokenExpiry'] = new Date(refreshed.expiry_date)
    if (Object.keys(update).length === 0) return
    User.updateOne({ _id: userId }, { $set: update }).catch((error: unknown) => {
      logger.error('Could not store the refreshed Google access token', {
        errorName: error instanceof Error ? error.name : typeof error
      })
    })
  })

  return calendarApi({ version: 'v3', auth: client })
}

export async function listCalendars(calendar: calendar_v3.Calendar) {
  const res = await calendar.calendarList.list({
    minAccessRole: 'writer'
  })

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
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: timezone,
      items: [{ id: calendarId }]
    }
  })

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

  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
    conferenceDataVersion: params.addGoogleMeet ? 1 : 0,
    sendUpdates: 'all'
  })

  return res.data
}

export async function listUpcomingEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  maxResults = 20
) {
  const res = await calendar.events.list({
    calendarId,
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
    privateExtendedProperty: [`${APPOINTMENT_TAG}=true`]
  })

  return res.data.items ?? []
}

/** The event, or null when Google answers 404/410 (deleted or unknown) */
export async function getEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string
) {
  try {
    const res = await calendar.events.get({ calendarId, eventId })
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
  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: 'all'
  })
}
