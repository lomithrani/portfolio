import type { calendar_v3 } from '@googleapis/calendar'
import type { Types } from 'mongoose'
import { AppointmentBooking } from '../models/database'
import { SlotUnavailableError, TooManyRequestsError } from '../errors'
import { rateLimitAddress } from './clientAddress'
import { EVENT_INSERT_TIMEOUT_MS, getEvent, isAppointmentEvent } from './googleCalendar'
import { logger } from './logger'
import { isDuplicateKeyError } from './mongoErrors'
import { consumeRateLimit, hashValue, rateLimitKey } from './rateLimit'
import type { RateLimit } from './rateLimit'

// Protection of the public POST /appointments/book. A booking makes Google send
// an invitation from the owner's calendar to any address the visitor types, so
// requests are limited per IP and per email, and an email can only hold a few
// upcoming bookings of a schedule.

/** Booking requests per IP address (IPv6: per /64), whatever their outcome */
export const BOOKING_REQUESTS_PER_IP: RateLimit = { limit: 10, windowMs: 60 * 60_000 }
/** Booking requests per visitor email address, whatever their outcome */
export const BOOKING_REQUESTS_PER_EMAIL: RateLimit = { limit: 5, windowMs: 24 * 60 * 60_000 }
/** Upcoming bookings one email address may hold on one schedule */
export const MAX_UPCOMING_BOOKINGS_PER_EMAIL = 2

/**
 * A booking still without event id after this long was abandoned (the API
 * stopped between the reservation and Google's answer). Well above
 * EVENT_INSERT_TIMEOUT_MS, so a booking in progress is never taken for one.
 */
const PENDING_BOOKING_TIMEOUT_MS = 4 * EVENT_INSERT_TIMEOUT_MS

const SLOT_TAKEN = 'This slot is no longer available'

/**
 * One key per mailbox: case, a `+tag` suffix and, for Gmail, dots do not
 * change where the invitation is delivered
 */
export function normalizeEmail(email: string) {
  const address = email.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  let local = address.slice(0, at).split('+')[0]
  let domain = address.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replaceAll('.', '')
  return `${local}@${domain}`
}

const waitText = (seconds: number) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  return `${Math.round(minutes / 60)} hours`
}

/** Counts a booking request; throws TooManyRequestsError (429) over a limit */
export async function limitBookingRequests(ip: string | null, email: string) {
  // Unknown without a server or proxy header (tests): the email limit still applies
  if (ip) {
    const key = rateLimitKey('book:ip', rateLimitAddress(ip))
    const retryAfter = await consumeRateLimit(key, BOOKING_REQUESTS_PER_IP)
    if (retryAfter !== null) {
      throw new TooManyRequestsError(
        `Too many booking requests from your network. Try again in ${waitText(retryAfter)}`,
        retryAfter
      )
    }
  }

  const key = rateLimitKey('book:email', normalizeEmail(email))
  const retryAfter = await consumeRateLimit(key, BOOKING_REQUESTS_PER_EMAIL)
  if (retryAfter !== null) {
    throw new TooManyRequestsError(
      `Too many booking requests for this email address. Try again in ${waitText(retryAfter)}`,
      retryAfter
    )
  }
}

type Booking = AppointmentBooking & { _id: Types.ObjectId }

/**
 * Whether a booking no longer holds its slot: abandoned while pending, or its
 * event was cancelled, deleted or moved in Google Calendar directly
 */
async function isStale(calendar: calendar_v3.Calendar, booking: Booking) {
  if (!booking.eventId) return booking.createdAt.getTime() < Date.now() - PENDING_BOOKING_TIMEOUT_MS
  const event = await getEvent(calendar, booking.calendarId, booking.eventId)
  if (!isAppointmentEvent(event)) return true
  return (
    Date.parse(event?.start?.dateTime ?? '') !== booking.start.getTime() ||
    Date.parse(event?.end?.dateTime ?? '') !== booking.end.getTime()
  )
}

/** Deletes a stale booking; throws SlotUnavailableError (409) while it holds its slot */
async function removeIfStale(calendar: calendar_v3.Calendar, booking: Booking) {
  if (!(await isStale(calendar, booking))) throw new SlotUnavailableError(SLOT_TAKEN)
  // Unless it changed meanwhile (confirmed since it was read)
  await AppointmentBooking.deleteOne({ _id: booking._id, eventId: booking.eventId ?? null })
}

type BookingFields = Pick<Booking, 'schedule' | 'user' | 'calendarId' | 'start' | 'end' | 'emailHash'>

async function insertBooking(calendar: calendar_v3.Calendar, fields: BookingFields) {
  // A second try only after removing a stale booking of the same slot
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return (await AppointmentBooking.create(fields))._id
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error
    }
    const holder = await AppointmentBooking.findOne({ schedule: fields.schedule, start: fields.start })
      .lean<Booking>()
    // None: released since the insert failed
    if (holder) await removeIfStale(calendar, holder)
  }
  throw new SlotUnavailableError(SLOT_TAKEN)
}

/**
 * Reserves a slot for a visitor before its Google event is created, so two
 * requests that both found the slot free in Google FreeBusy cannot both book
 * it. Throws SlotUnavailableError (409) when a booking holds the slot or
 * overlaps it on the same calendar, TooManyRequestsError (429) when the email
 * already holds MAX_UPCOMING_BOOKINGS_PER_EMAIL upcoming bookings of the
 * schedule. Returns the booking's id: confirm it with the event id, or
 * release it if the event could not be created.
 */
export async function reserveSlot({
  calendar,
  schedule,
  start,
  end,
  email
}: {
  calendar: calendar_v3.Calendar
  schedule: { _id: Types.ObjectId; user: Types.ObjectId; calendarId?: string | null }
  start: Date
  end: Date
  email: string
}) {
  const fields: BookingFields = {
    schedule: schedule._id,
    user: schedule.user,
    calendarId: schedule.calendarId ?? 'primary',
    start,
    end,
    emailHash: hashValue(normalizeEmail(email))
  }
  const id = await insertBooking(calendar, fields)

  // Checked after the insert: of two concurrent requests, the one that looks
  // last sees the other's booking, so they cannot both pass
  try {
    const upcoming = await AppointmentBooking.countDocuments({
      schedule: fields.schedule,
      emailHash: fields.emailHash,
      end: { $gt: new Date() }
    })
    if (upcoming > MAX_UPCOMING_BOOKINGS_PER_EMAIL) {
      throw new TooManyRequestsError(
        'This email address already has the maximum number of upcoming bookings for this meeting'
      )
    }

    // Another schedule on the same calendar, or a slot grid shifted by a schedule edit
    const overlapping = await AppointmentBooking.find({
      _id: { $ne: id },
      user: fields.user,
      calendarId: fields.calendarId,
      start: { $lt: end },
      end: { $gt: start }
    }).lean<Booking[]>()
    for (const booking of overlapping) await removeIfStale(calendar, booking)
  } catch (error) {
    await releaseBooking(id)
    throw error
  }
  return id
}

/** Records the Google event of a reserved booking */
export async function confirmBooking(id: Types.ObjectId, eventId: string | null | undefined) {
  if (!eventId) return
  try {
    await AppointmentBooking.updateOne({ _id: id }, { $set: { eventId } })
  } catch (error) {
    // The event exists and Google FreeBusy reports it: only the cleanup on cancellation is lost
    logger.error('Could not record the event of a booking', {
      errorName: error instanceof Error ? error.name : typeof error
    })
  }
}

/** Frees a reserved slot whose event could not be created */
export async function releaseBooking(id: Types.ObjectId) {
  try {
    await AppointmentBooking.deleteOne({ _id: id })
  } catch (error) {
    // Still pending: taken for abandoned after PENDING_BOOKING_TIMEOUT_MS
    logger.error('Could not release a booking', {
      errorName: error instanceof Error ? error.name : typeof error
    })
  }
}

/** Frees the slot of a booking cancelled from the admin panel */
export async function releaseEventBooking(userId: string | Types.ObjectId, eventId: string) {
  try {
    await AppointmentBooking.deleteOne({ user: userId, eventId })
  } catch (error) {
    // The next booking of the slot finds the event gone in Google and removes it
    logger.error('Could not release a cancelled booking', {
      errorName: error instanceof Error ? error.name : typeof error
    })
  }
}
