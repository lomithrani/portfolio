import Elysia, { t } from 'elysia'
import type { calendar_v3 } from '@googleapis/calendar'
import type { Types } from 'mongoose'
import {
  MAX_AVAILABLE_DATES_RANGE,
  addDays,
  bookingHorizon,
  daysBetween,
  isCalendarDate,
  normalizeDomainName,
  wallDateInTimezone
} from 'portfolio-common'
import type { BookingHorizon } from 'portfolio-common'
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
  availableDatesQuery,
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
  isRejectedInsert,
  listCalendars,
  listUpcomingEvents
} from '../services/googleCalendar'
import {
  bookingEventId,
  confirmBooking,
  heldBookingBlocks,
  limitAvailabilityRequestsFromIp,
  limitBookingRequestsForEmail,
  limitBookingRequestsFromIp,
  releaseBooking,
  releaseEventBooking,
  reserveSlot
} from '../services/appointmentBookings'
import { clientAddress } from '../services/clientAddress'
import {
  computeAvailableSlotsByDate,
  isValidTimeZone,
  wallClockToUTC
} from '../services/slotComputation'
import type { Slot } from '../services/slotComputation'

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
      // The slot is bookable again
      await releaseEventBooking(userId, eventId)
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

const findEnabledSchedule = async (id: string) => {
  const schedule = await AppointmentSchedule.findById(id)
  if (!schedule || !schedule.enabled) {
    throw new AppointmentScheduleNotFoundError('Schedule not found')
  }
  return schedule
}

// The YYYY-MM-DD pattern lets 2026-02-30 through
const assertCalendarDates = (...dates: (string | undefined)[]) => {
  if (!dates.every((date) => date === undefined || isCalendarDate(date))) {
    throw new BadRequestError('Invalid date')
  }
}

/**
 * The free slots of each date from `from` to `to` (YYYY-MM-DD in the
 * schedule's time zone) inside the booking horizon; the dates outside it are
 * left out, without asking Google. One FreeBusy call and one bookings query
 * for the whole range: every public answer about availability (available-slots,
 * available-dates, and the re-check of /book) comes from here.
 */
const getAvailableSlotsByDate = async (
  calendar: calendar_v3.Calendar,
  schedule: ScheduleDocument,
  from: string,
  to: string,
  horizon: BookingHorizon = bookingHorizon(schedule)
): Promise<Map<string, Slot[]>> => {
  const first = from > horizon.first ? from : horizon.first
  const last = to < horizon.last ? to : horizon.last
  if (first > last) return new Map()

  const tz = schedule.timezone
  const calendarId = schedule.calendarId ?? 'primary'
  const rangeStart = wallClockToUTC(first, '00:00', tz)
  const rangeEnd = wallClockToUTC(addDays(last, 1), '00:00', tz)
  const [freeBusy, held] = await Promise.all([
    getFreeBusy(calendar, calendarId, rangeStart.toISOString(), rangeEnd.toISOString(), tz),
    heldBookingBlocks(schedule.user, rangeStart, rangeEnd)
  ])
  const busy = [...freeBusy.map((b) => ({ start: b.start ?? '', end: b.end ?? '' })), ...held]

  return computeAvailableSlotsByDate(schedule, first, last, busy)
}

const getAvailableSlotsForDate = async (
  calendar: calendar_v3.Calendar,
  schedule: ScheduleDocument,
  date: string
) => (await getAvailableSlotsByDate(calendar, schedule, date, date)).get(date) ?? []

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
    async ({ query: { scheduleId, date }, request, server }) => {
      // Each lookup asks Google: every request counts, whatever its outcome
      await limitAvailabilityRequestsFromIp(clientAddress(request, server))
      assertCalendarDates(date)
      const schedule = await findEnabledSchedule(scheduleId)
      // Throws GoogleCalendarNotConnectedError (409) when the owner disconnected
      const calendar = await getCalendarClient(schedule.user)
      return await getAvailableSlotsForDate(calendar, schedule, date)
    },
    {
      query: availableSlotsQuery
    }
  )
  // The dates of [from, to] that /appointments/available-slots has slots for,
  // so the booking page only offers those, with the booking horizon by the
  // API's clock: the page asks without `from` first, so its calendar never
  // depends on the visitor's clock, then for the rest of the horizon
  .get(
    '/appointments/available-dates',
    async ({ query: { scheduleId, from, to }, request, server }) => {
      await limitAvailabilityRequestsFromIp(clientAddress(request, server))
      assertCalendarDates(from, to)
      const schedule = await findEnabledSchedule(scheduleId)

      const horizon = bookingHorizon(schedule)
      const first = from ?? horizon.first
      const last = to ?? addDays(first, MAX_AVAILABLE_DATES_RANGE - 1)
      const dates = daysBetween(first, last) + 1
      if (dates < 1) throw new BadRequestError('The range must not end before it starts')
      if (dates > MAX_AVAILABLE_DATES_RANGE) {
        throw new BadRequestError(`At most ${MAX_AVAILABLE_DATES_RANGE} dates per request`)
      }

      // Throws GoogleCalendarNotConnectedError (409) when the owner disconnected
      const calendar = await getCalendarClient(schedule.user)
      const slotsByDate = await getAvailableSlotsByDate(calendar, schedule, first, last, horizon)
      return {
        horizon,
        dates: [...slotsByDate].filter(([, slots]) => slots.length > 0).map(([date]) => date)
      }
    },
    {
      query: availableDatesQuery
    }
  )
  .post(
    '/appointments/book',
    async ({ body, request, server }) => {
      const { scheduleId, startTime, name, email, notes } = body

      // Before anything else: every request counts, whatever its outcome
      await limitBookingRequestsFromIp(clientAddress(request, server))

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

      // Only now: a request for a taken slot or an unknown schedule must not
      // use up the quota of the address it names
      await limitBookingRequestsForEmail(email)

      // Held from here: a concurrent request for the same slot gets a 409
      const bookingId = await reserveSlot({
        calendar,
        schedule,
        start: new Date(slot.start),
        end: new Date(slot.end),
        email
      })

      const description = [
        `Booked via portfolio by ${name} (${email})`,
        notes ? `\nNotes:\n${notes}` : ''
      ].join('')
      let event: calendar_v3.Schema$Event
      try {
        event = await createEvent(calendar, schedule.calendarId ?? 'primary', {
          id: bookingEventId(bookingId),
          summary: `${schedule.title} — ${name}`,
          description,
          startTime: slot.start,
          endTime: slot.end,
          timezone: schedule.timezone,
          attendeeEmail: email,
          addGoogleMeet: schedule.locationType === 'google_meet'
        })
      } catch (error) {
        // Refused: no event. Otherwise (timeout, network, 5xx) Google may have
        // created it: the booking stays, and the next request for the slot
        // asks Google for the event by its id before taking it over
        if (isRejectedInsert(error)) await releaseBooking(bookingId)
        throw error
      }
      await confirmBooking(bookingId, event.id)

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
