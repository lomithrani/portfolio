import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'
import { User } from '../models/database'
import { GoogleCalendarNotConnectedError } from '../errors'

export function createOAuth2Client() {
  const clientId = Bun.env.GOOGLE_CLIENT_ID
  const clientSecret = Bun.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new GoogleCalendarNotConnectedError(
      'Google Calendar is not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)'
    )
  }

  return new google.auth.OAuth2(clientId, clientSecret, 'postmessage')
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuth2Client()
  try {
    const { tokens } = await client.getToken(code)
    return tokens
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GoogleCalendar] Token exchange failed:', msg)
    throw new Error(`Google token exchange failed: ${msg}`)
  }
}

export async function getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const user = await User.findById(userId)

  if (!user?.googleCalendar?.refreshToken) {
    throw new GoogleCalendarNotConnectedError('Google Calendar not connected')
  }

  const client = createOAuth2Client()
  client.setCredentials({
    refresh_token: user.googleCalendar.refreshToken,
    access_token: user.googleCalendar.accessToken ?? undefined,
    expiry_date: user.googleCalendar.tokenExpiry?.getTime()
  })

  client.on('tokens', async (tokens) => {
    const update: Record<string, unknown> = {}
    if (tokens.access_token) {
      update['googleCalendar.accessToken'] = tokens.access_token
    }
    if (tokens.expiry_date) {
      update['googleCalendar.tokenExpiry'] = new Date(tokens.expiry_date)
    }
    if (Object.keys(update).length > 0) {
      await User.findByIdAndUpdate(userId, { $set: update })
    }
  })

  return google.calendar({ version: 'v3', auth: client })
}

export async function listCalendars(calendar: calendar_v3.Calendar) {
  const res = await calendar.calendarList.list({
    minAccessRole: 'writer'
  })

  return (res.data.items ?? []).map((c) => ({
    id: c.id!,
    summary: c.summary ?? c.id!,
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

  return res.data.calendars?.[calendarId]?.busy ?? []
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
    conferenceData: params.addGoogleMeet ? {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    } : undefined,
    extendedProperties: {
      private: { portfolio_appointment: 'true' }
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

export async function listUpcomingEvents(calendar: calendar_v3.Calendar, calendarId: string, maxResults = 20) {
  const res = await calendar.events.list({
    calendarId,
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
    privateExtendedProperty: ['portfolio_appointment=true']
  })

  return res.data.items ?? []
}

export async function deleteEvent(calendar: calendar_v3.Calendar, calendarId: string, eventId: string) {
  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: 'all'
  })
}
