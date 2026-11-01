import Elysia, { t } from 'elysia'
import type { calendar_v3 } from '@googleapis/calendar'
import type { Types } from 'mongoose'
import { normalizeDomainName } from 'portfolio-common'
import { env } from '../env'
import { userLogged } from './userLogged'
import { AppointmentSchedule, Domain } from '../models/database'
import {
  AppointmentEventNotFoundError,
  AppointmentScheduleNotFoundError,
  BadRequestError,
  DomainDoesNotExistError,
  SlotUnavailableError
} from '../errors'
import {
  appointmentScheduleRequest,
  availableSlotsQuery,
  bookAppointmentRequest,
  objectIdParams
} from '../models/elysia'
import {
  connectGoogleCalendar,
  createEvent,
  deleteEvent,
  disconnectGoogleCalendar,
  getCalendarClient,
  getCalendarConnection,
  getEvent,
  getFreeBusy,
  isAppointmentEvent,
  listCalendars,
  listUpcomingEvents
} from '../services/googleCalendar'
import {
  computeAvailableSlots,
  isValidTimeZone,
  wallClockToUTC,
  wallDateInTimezone
} from '../services/slotComputation'

type ScheduleRequest = typeof appointmentScheduleRequest.static
type ScheduleDocument = AppointmentSchedule & { _id: Types.ObjectId }

// Checks TypeBox cannot express: a real IANA zone, windows that end after they start
const assertValidSchedule = (body: ScheduleRequest) => {
  if (!isValidTimeZone(body.timezone)) throw new BadRequestError('Unknown time zone')
  const windows = [
    ...body.availability,
    ...(body.dateOverrides ?? []).flatMap((override) => override.windows ?? [])
  ]
  if (windows.some((window) => window.startTime >= window.endTime)) {
    throw new BadRequestError('Availability windows must end after they start')
  }
}

const appointmentsAdmin = new Elysia()
  .use(userLogged)
  .get('/appointments/calendar-status', async ({ userId }) => ({
    configured: env.googleCalendarEnabled,
    ...(await getCalendarConnection(userId))
  }))
  .post(
    '/appointments/connect',
    async ({ body: { code }, userId }) => {
      await connectGoogleCalendar(userId, code)
      return { connected: true }
    },
    {
      body: t.Object({ code: t.String({ minLength: 1, maxLength: 2048 }) })
    }
  )
  .post('/appointments/disconnect', async ({ userId }) => {
    await disconnectGoogleCalendar(userId)
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
  .post(
    '/appointments/schedules',
    async ({ body, userId }) => {
      assertValidSchedule(body)
      const schedule = await AppointmentSchedule.create({ ...body, user: userId })
      return schedule.toObject()
    },
    {
      body: appointmentScheduleRequest
    }
  )
  .put(
    '/appointments/schedules/:id',
    async ({ body, userId, params: { id } }) => {
      assertValidSchedule(body)
      const schedule = await AppointmentSchedule.findOne({ _id: id, user: userId })
      if (!schedule) throw new AppointmentScheduleNotFoundError('Schedule not found')

      schedule.set(body)
      await schedule.save()
      return schedule.toObject()
    },
    {
      params: objectIdParams,
      body: appointmentScheduleRequest
    }
  )
  .delete(
    '/appointments/schedules/:id',
    async ({ userId, params: { id } }) => {
      const schedule = await AppointmentSchedule.findOneAndDelete({ _id: id, user: userId })
      if (!schedule) throw new AppointmentScheduleNotFoundError('Schedule not found')
      return { deleted: true }
    },
    {
      params: objectIdParams
    }
  )
  .get('/appointments/upcoming', async ({ userId }) => {
    const calendar = await getCalendarClient(userId)
    const schedules = await AppointmentSchedule.find({ user: userId })
    const calendarIds = [...new Set(schedules.map((s) => s.calendarId ?? 'primary'))]

    const eventsByCalendar = await Promise.all(
      calendarIds.map(async (calendarId) =>
        (await listUpcomingEvents(calendar, calendarId)).map((event) => ({ event, calendarId }))
      )
    )

    return eventsByCalendar
      .flat()
      .map(({ event, calendarId }) => ({
        id: event.id ?? '',
        summary: event.summary ?? null,
        start: event.start?.dateTime ?? event.start?.date ?? null,
        end: event.end?.dateTime ?? event.end?.date ?? null,
        attendees: (event.attendees ?? [])
          .map((a) => a.email)
          .filter((email): email is string => Boolean(email)),
        meetLink: event.hangoutLink ?? null,
        htmlLink: event.htmlLink ?? null,
        // The calendar the event was listed from, needed to cancel it
        calendarId
      }))
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
  })
  .delete(
    '/appointments/events/:eventId',
    async ({ userId, params: { eventId }, query }) => {
      const calendar = await getCalendarClient(userId)
      const calendarId = query.calendarId ?? 'primary'
      // Only events created by the app: never the owner's other events
      const event = await getEvent(calendar, calendarId, eventId)
      if (!isAppointmentEvent(event)) {
        throw new AppointmentEventNotFoundError('Appointment not found')
      }
      await deleteEvent(calendar, calendarId, eventId)
      return { deleted: true }
    },
    {
      params: t.Object({ eventId: t.String({ minLength: 1, maxLength: 1024 }) }),
      query: t.Object({
        calendarId: t.Optional(t.String({ minLength: 1, maxLength: 1024 }))
      })
    }
  )

// What visitors see of a schedule: not its calendar or owner
const publicScheduleFields = (schedule: ScheduleDocument) => ({
  id: schedule._id.toString(),
  title: schedule.title,
  description: schedule.description ?? null,
  durationMinutes: schedule.durationMinutes ?? 30,
  minNoticeHours: schedule.minNoticeHours ?? 24,
  maxAdvanceDays: schedule.maxAdvanceDays ?? 30,
  timezone: schedule.timezone,
  locationType: schedule.locationType ?? 'google_meet',
  locationDetails: schedule.locationDetails ?? null,
  availability: schedule.availability.map(({ dayOfWeek, startTime, endTime }) => ({
    dayOfWeek,
    startTime,
    endTime
  }))
})

const isWithinBookingHorizon = (schedule: ScheduleDocument, date: string) => {
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + (schedule.maxAdvanceDays ?? 30))
  return date <= horizon.toISOString().slice(0, 10)
}

const findEnabledSchedule = async (id: string) => {
  const schedule = await AppointmentSchedule.findById(id)
  if (!schedule || !schedule.enabled) {
    throw new AppointmentScheduleNotFoundError('Schedule not found')
  }
  return schedule
}

const getAvailableSlotsForDate = async (
  calendar: calendar_v3.Calendar,
  schedule: ScheduleDocument,
  date: string
) => {
  if (!isWithinBookingHorizon(schedule, date)) return []

  const calendarId = schedule.calendarId ?? 'primary'
  const tz = schedule.timezone
  const dayStart = wallClockToUTC(date, '00:00', tz).toISOString()
  const dayEnd = wallClockToUTC(date, '23:59', tz).toISOString()
  const busyBlocks = await getFreeBusy(calendar, calendarId, dayStart, dayEnd, tz)

  const busy = busyBlocks.map((b) => ({
    start: b.start ?? '',
    end: b.end ?? ''
  }))

  return computeAvailableSlots(schedule, date, busy)
}

const appointmentsPublic = new Elysia()
  .get('/appointments/domains/:domainName/schedules', async ({ params: { domainName } }) => {
    const domain = await Domain.findOne({ name: normalizeDomainName(domainName) })
    if (!domain) throw new DomainDoesNotExistError('Domain not found')
    const ownerId = domain.admin.toString()

    // Nothing is bookable while the owner's calendar is not connected
    if (!env.googleCalendarEnabled || !(await getCalendarConnection(ownerId)).connected) {
      return []
    }

    const schedules = await AppointmentSchedule.find({ user: ownerId, enabled: true })
    return schedules.map(publicScheduleFields)
  })
  .get(
    '/appointments/schedules/:id/public',
    async ({ params: { id } }) => publicScheduleFields(await findEnabledSchedule(id)),
    {
      params: objectIdParams
    }
  )
  .get(
    '/appointments/available-slots',
    async ({ query: { scheduleId, date } }) => {
      const schedule = await findEnabledSchedule(scheduleId)
      // Throws GoogleCalendarNotConnectedError (409) when the owner disconnected
      const calendar = await getCalendarClient(schedule.user)
      return await getAvailableSlotsForDate(calendar, schedule, date)
    },
    {
      query: availableSlotsQuery
    }
  )
  .post(
    '/appointments/book',
    async ({ body }) => {
      const { scheduleId, startTime, name, email, notes } = body

      const schedule = await findEnabledSchedule(scheduleId)

      const slotStart = new Date(startTime)
      if (isNaN(slotStart.getTime())) {
        throw new BadRequestError('Invalid start time')
      }

      // Recompute availability server-side: the slot must still be free, within
      // the booking horizon and respect the minimum notice
      const calendar = await getCalendarClient(schedule.user)
      const date = wallDateInTimezone(slotStart, schedule.timezone)
      const slots = await getAvailableSlotsForDate(calendar, schedule, date)
      const slot = slots.find((s) => new Date(s.start).getTime() === slotStart.getTime())
      if (!slot) {
        throw new SlotUnavailableError('This slot is no longer available')
      }

      const description = [
        `Booked via portfolio by ${name} (${email})`,
        notes ? `\nNotes:\n${notes}` : ''
      ].join('')
      const event = await createEvent(calendar, schedule.calendarId ?? 'primary', {
        summary: `${schedule.title} — ${name}`,
        description,
        startTime: slot.start,
        endTime: slot.end,
        timezone: schedule.timezone,
        attendeeEmail: email,
        addGoogleMeet: schedule.locationType === 'google_meet'
      })

      return {
        booked: true,
        start: slot.start,
        end: slot.end,
        meetLink: event.hangoutLink ?? null,
        eventLink: event.htmlLink ?? null
      }
    },
    {
      body: bookAppointmentRequest
    }
  )

export const appointments = new Elysia().use(appointmentsAdmin).use(appointmentsPublic)
