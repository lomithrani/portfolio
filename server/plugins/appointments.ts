import Elysia, { t } from 'elysia'
import type { calendar_v3 } from '@googleapis/calendar'
import { Types } from 'mongoose'
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
import { AppointmentSchedule, Domain, User } from '../models/database'
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
  bookingReminders,
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
import { bookableScheduleFilter } from '../services/appointmentSchedules'
import { listBookedMeetings } from '../services/bookedMeetings'
import { clientAddress } from '../services/clientAddress'
import { logger } from '../services/logger'
import { sessionUserId } from '../services/session'
import { journeySteps, openStepOfType, recordStepData } from '../services/workflows'
import {
  computeAvailableSlotsByDate,
  isValidTimeZone,
  wallClockToUTC
} from '../services/slotComputation'
import type { Slot } from '../services/slotComputation'
import { DOMAIN_NOT_FOUND, SLOT_UNAVAILABLE } from '../protocol'
import { m } from './appointments.messages'

type ScheduleRequest = typeof appointmentScheduleRequest.static
type ScheduleDocument = AppointmentSchedule & { _id: Types.ObjectId }

// Checks TypeBox cannot express: a real IANA zone, windows that end after they start
const assertValidSchedule = (body: ScheduleRequest) => {
  if (!isValidTimeZone(body.timezone)) throw new BadRequestError(() => m.unknownTimeZone)
  const windows = [
    ...body.availability,
    ...(body.dateOverrides ?? []).flatMap((override) => override.windows ?? [])
  ]
  if (windows.some((window) => window.startTime >= window.endTime)) {
    throw new BadRequestError(() => m.windowsEndAfterStart)
  }
}

/** The email address an account signs in with, invited to the meetings booked with it */
const accountEmail = async (userId: Types.ObjectId | string) =>
  (await User.findById(userId, { email: 1 }).lean())?.email

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
      if (!schedule) throw new AppointmentScheduleNotFoundError(() => m.scheduleNotFound)

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
      if (!schedule) throw new AppointmentScheduleNotFoundError(() => m.scheduleNotFound)
      return { deleted: true }
    },
    {
      params: objectIdParams
    }
  )
  // The meetings this account booked on other portfolios, signed in: its own
  // side of /appointments/upcoming (services/bookedMeetings.ts)
  .get('/appointments/booked', async ({ userId }) => ({ meetings: await listBookedMeetings(userId) }))
  .get('/appointments/upcoming', async ({ userId }) => {
    const calendar = await getCalendarClient(userId)
    const [schedules, ownerEmail] = await Promise.all([
      AppointmentSchedule.find({ user: userId }),
      accountEmail(userId)
    ])
    // The owner is a guest of every booking: the list says who booked
    const isOwner = (email: string) => email.toLowerCase() === ownerEmail?.toLowerCase()
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
          .filter((email): email is string => Boolean(email))
          .filter((email) => !isOwner(email)),
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
        throw new AppointmentEventNotFoundError(() => m.appointmentNotFound)
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

type LocationType = 'google_meet' | 'phone' | 'in_person' | 'custom'

/**
 * Where a meeting outside Google Meet takes place, for the event's location (Google shows it,
 * a number or an address a phone can open) and the first line of its description: what the
 * owner wrote in the schedule, as they wrote it, after its kind (the visitor's language)
 */
const meetingPlace = (locationType: LocationType, details: string | null | undefined) => {
  if (locationType === 'google_meet') return { location: undefined, line: '' }
  const written = details?.trim()
  if (!written) {
    return { location: undefined, line: locationType === 'custom' ? '' : m.invitation.place[locationType] }
  }
  return { location: written, line: `${m.invitation.placeLabel[locationType]} ${written}` }
}

const scheduleNotFound = () => new AppointmentScheduleNotFoundError(() => m.scheduleNotFound)

const findEnabledSchedule = async (id: string) => {
  const schedule = await AppointmentSchedule.findById(id)
  if (!schedule || !schedule.enabled) throw scheduleNotFound()
  return schedule
}

/** The step type of the hiring journey these routes are behind (portfolio-common's meeting manifest) */
const MEETING_STEP = 'meeting'

/**
 * The meeting step of the owner's hiring journey (services/workflows.ts),
 * for the caller of an availability or booking route: 404 like a paused
 * schedule when the journey has no meeting step, 401/403 while the steps
 * before it did not succeed. Returns the step, with what the steps before
 * it say for the invitation
 */
const openMeetingStep = async (schedule: ScheduleDocument, request: Request) => {
  const visitorId = await sessionUserId(request)
  const step = await openStepOfType(schedule.user, visitorId, MEETING_STEP, scheduleNotFound)
  return { visitorId, step }
}

/** The web app the booking came from, when it is an allowed CORS origin: the only one the invitation links */
const webOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  return origin && env.ALLOWED_DOMAINS.includes(origin) ? origin : undefined
}

// The YYYY-MM-DD pattern lets 2026-02-30 through
const assertCalendarDates = (...dates: (string | undefined)[]) => {
  if (!dates.every((date) => date === undefined || isCalendarDate(date))) {
    throw new BadRequestError(() => m.invalidDate)
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
    if (!domain) throw new DomainDoesNotExistError(DOMAIN_NOT_FOUND)
    const ownerId = domain.admin.toString()

    // Nothing is bookable while the owner's calendar is not connected
    if (!env.googleCalendarEnabled || !(await getCalendarConnection(ownerId)).connected) {
      return []
    }

    // Nor when the owner's hiring journey has no meeting step
    if (!(await journeySteps(ownerId)).some((step) => step.type === MEETING_STEP)) return []

    // Only those that offer slots (hours of their own): what the readiness checklist counts
    const schedules = await AppointmentSchedule.find(bookableScheduleFilter(ownerId))
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
      await openMeetingStep(schedule, request)
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
      await openMeetingStep(schedule, request)

      const horizon = bookingHorizon(schedule)
      const first = from ?? horizon.first
      const last = to ?? addDays(first, MAX_AVAILABLE_DATES_RANGE - 1)
      const dates = daysBetween(first, last) + 1
      if (dates < 1) throw new BadRequestError(() => m.rangeEndsBeforeStart)
      if (dates > MAX_AVAILABLE_DATES_RANGE) {
        throw new BadRequestError(() => m.tooManyDates(MAX_AVAILABLE_DATES_RANGE))
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
      // Before Google is asked anything: the steps before the meeting succeeded
      const { visitorId, step } = await openMeetingStep(schedule, request)

      const slotStart = new Date(startTime)
      if (isNaN(slotStart.getTime())) {
        throw new BadRequestError(() => m.invalidStartTime)
      }
      const locationType = (schedule.locationType ?? 'google_meet') as LocationType

      // Recompute availability server-side: the slot must still be free, within
      // the booking horizon and respect the minimum notice
      const calendar = await getCalendarClient(schedule.user)
      const date = wallDateInTimezone(slotStart, schedule.timezone)
      const slots = await getAvailableSlotsForDate(calendar, schedule, date)
      const slot = slots.find((s) => new Date(s.start).getTime() === slotStart.getTime())
      if (!slot) {
        throw new SlotUnavailableError(SLOT_UNAVAILABLE)
      }

      // What the visitor did on the steps before the meeting (the job they
      // picked): what the meeting is about. Before the slot is held, so a
      // failure here leaves nothing behind
      const journeyLines = await step.invitationLines(webOrigin(request))
      // The owner is a guest too: Google never emails an event's organizer, so
      // this is how they get the invitation when the schedule books into a
      // calendar other than their sign-in account's own (on that one, the
      // event's email reminder tells them)
      const ownerEmail = await accountEmail(schedule.user)

      // Only now: a request for a taken slot or an unknown schedule must not
      // use up the quota of the address it names
      await limitBookingRequestsForEmail(email)

      // Held from here: a concurrent request for the same slot gets a 409
      const bookingId = await reserveSlot({
        calendar,
        schedule,
        start: new Date(slot.start),
        end: new Date(slot.end),
        email,
        // Signed in: the meeting is listed in the visitor's space (GET /appointments/booked)
        visitor: visitorId ? new Types.ObjectId(visitorId) : null
      })

      // Read by the owner and by the person who books: in the language of this request
      const place = meetingPlace(locationType, schedule.locationDetails)
      const description = [
        m.invitation.bookedBy(name, email),
        place.line ? `\n${place.line}` : '',
        ...journeyLines.map((line) => `\n${line}`),
        notes ? `\n${m.invitation.notesLabel}\n${notes}` : ''
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
          location: place.location,
          attendees: [
            { email },
            ...(ownerEmail ? [{ email: ownerEmail, responseStatus: 'accepted' as const }] : [])
          ],
          // Google never emails the organizer: an email reminder right after the booking does
          reminders: bookingReminders(new Date(slot.start)),
          addGoogleMeet: locationType === 'google_meet'
        })
      } catch (error) {
        // Refused: no event. Otherwise (timeout, network, 5xx) Google may have
        // created it: the booking stays, and the next request for the slot
        // asks Google for the event by its id before taking it over
        if (isRejectedInsert(error)) await releaseBooking(bookingId)
        throw error
      }
      await confirmBooking(bookingId, event.id, event.hangoutLink)
      // The meeting is booked whatever happens to this record: never answered as a failure
      await recordStepData(schedule.user, visitorId, step.stepId, { bookedAt: new Date() }).catch((error: unknown) => {
        logger.error('Could not record a booking in the hiring journey', {
          errorName: error instanceof Error ? error.name : typeof error
        })
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
