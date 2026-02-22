import Elysia, { t } from 'elysia'
import type { calendar_v3 } from 'googleapis'
import { corsConf } from './corsConf'
import { userLogged } from './userLogged'
import { User, AppointmentSchedule } from '../models/database'
import { AppointmentScheduleNotFoundError, GoogleCalendarNotConnectedError } from '../errors'
import { appointmentScheduleRequest } from '../models/elysia'
import {
  exchangeCodeForTokens,
  getCalendarClient,
  listCalendars,
  listUpcomingEvents,
  deleteEvent,
  getFreeBusy
} from '../services/googleCalendar'
import { computeAvailableSlots, wallClockToUTC } from '../services/slotComputation'

const appointmentsAdmin = new Elysia()
  .use(corsConf())
  .use(userLogged)
  .get('/appointments/calendar-status', async ({ userId }) => {
    const user = await User.findById(userId)
    const cal = user?.googleCalendar
    return {
      connected: !!cal?.refreshToken,
      connectedAt: cal?.connectedAt ?? null
    }
  })
  .post('/appointments/connect', async ({ body: { code }, userId }) => {
    const tokens = await exchangeCodeForTokens(code)

    const update: Record<string, unknown> = {
      'googleCalendar.accessToken': tokens.access_token,
      'googleCalendar.tokenExpiry': tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      'googleCalendar.connectedAt': new Date()
    }
    if (tokens.refresh_token) {
      update['googleCalendar.refreshToken'] = tokens.refresh_token
    }

    await User.findByIdAndUpdate(userId, { $set: update })

    return { connected: true }
  }, {
    body: t.Object({ code: t.String() })
  })
  .post('/appointments/disconnect', async ({ userId }) => {
    await User.findByIdAndUpdate(userId, {
      $unset: { googleCalendar: 1 }
    })
    return { connected: false }
  })
  .get('/appointments/calendars', async ({ userId }) => {
    const calendar = await getCalendarClient(userId)
    return await listCalendars(calendar)
  })
  .get('/appointments/schedules', async ({ userId }) => {
    const schedules = await AppointmentSchedule.find({ user: userId })
    return schedules.map((s) => s.toObject())
  })
  .post('/appointments/schedules', async ({ body, userId }) => {
    const schedule = new AppointmentSchedule({ ...body, user: userId })
    const result = await schedule.save()
    return result.toObject()
  }, {
    body: appointmentScheduleRequest
  })
  .put('/appointments/schedules/:id', async ({ body, userId, params: { id } }) => {
    const schedule = await AppointmentSchedule.findOne({ _id: id, user: userId })
    if (!schedule) throw new AppointmentScheduleNotFoundError('Schedule not found')

    schedule.set(body)
    const result = await schedule.save()
    return result.toObject()
  }, {
    body: appointmentScheduleRequest
  })
  .delete('/appointments/schedules/:id', async ({ userId, params: { id } }) => {
    const schedule = await AppointmentSchedule.findOneAndDelete({ _id: id, user: userId })
    if (!schedule) throw new AppointmentScheduleNotFoundError('Schedule not found')
    return { deleted: true }
  })
  .get('/appointments/upcoming', async ({ userId }) => {
    const calendar = await getCalendarClient(userId)
    const schedules = await AppointmentSchedule.find({ user: userId })
    const calendarIds = [...new Set(schedules.map((s) => s.calendarId ?? 'primary'))]

    const allEvents = await Promise.all(
      calendarIds.map((cid) => listUpcomingEvents(calendar, cid))
    )

    return allEvents.flat().map((e: calendar_v3.Schema$Event) => ({
      id: e.id,
      summary: e.summary,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      attendees: (e.attendees ?? [])
        .map((a: calendar_v3.Schema$EventAttendee) => a.email)
        .filter((email): email is string => Boolean(email)),
      meetLink: e.hangoutLink ?? null,
      htmlLink: e.htmlLink ?? null,
      calendarId: e.organizer?.email ?? null
    }))
  })
  .delete('/appointments/events/:eventId', async ({ userId, params: { eventId }, query }) => {
    const calendar = await getCalendarClient(userId)
    const calendarId = query.calendarId ?? 'primary'
    await deleteEvent(calendar, calendarId, eventId)
    return { deleted: true }
  }, {
    query: t.Object({
      calendarId: t.Optional(t.String())
    })
  })

const appointmentsPublic = new Elysia()
  .use(corsConf())
  .get('/appointments/schedules/:id/public', async ({ params: { id } }) => {
    const schedule = await AppointmentSchedule.findById(id)
    if (!schedule || !schedule.enabled) {
      throw new AppointmentScheduleNotFoundError('Schedule not found')
    }
    return {
      id: schedule._id,
      title: schedule.title,
      description: schedule.description,
      durationMinutes: schedule.durationMinutes,
      timezone: schedule.timezone,
      locationType: schedule.locationType,
      locationDetails: schedule.locationDetails,
      availability: schedule.availability,
      maxAdvanceDays: schedule.maxAdvanceDays
    }
  })
  .get('/appointments/available-slots', async ({ query }) => {
    const { scheduleId, date } = query

    const schedule = await AppointmentSchedule.findById(scheduleId)
    if (!schedule || !schedule.enabled) {
      throw new AppointmentScheduleNotFoundError('Schedule not found')
    }

    const user = await User.findById(schedule.user)
    if (!user?.googleCalendar?.refreshToken) {
      throw new GoogleCalendarNotConnectedError('Calendar not connected')
    }

    const calendarId = schedule.calendarId ?? 'primary'
    const calendar = await getCalendarClient(schedule.user.toString())
    const tz = schedule.timezone
    const dayStart = wallClockToUTC(date, '00:00', tz).toISOString()
    const dayEnd = wallClockToUTC(date, '23:59', tz).toISOString()
    const busyBlocks = await getFreeBusy(calendar, calendarId, dayStart, dayEnd, tz)

    const busy = busyBlocks.map((b) => ({
      start: b.start ?? '',
      end: b.end ?? ''
    }))

    const slots = computeAvailableSlots(schedule, date, busy)
    return slots
  }, {
    query: t.Object({
      scheduleId: t.String(),
      date: t.String()
    })
  })

export const appointments = new Elysia()
  .use(appointmentsAdmin)
  .use(appointmentsPublic)
