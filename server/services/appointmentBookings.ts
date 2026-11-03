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
/**
 * Booking requests per visitor email address that reach a free slot, whatever
 * their outcome. Invalid requests do not count: they would let anyone use up
 * someone else's quota for free
 */
export const BOOKING_REQUESTS_PER_EMAIL: RateLimit = { limit: 5, windowMs: 24 * 60 * 60_000 }
/**
 * Availability lookups (available-slots and available-dates together) per IP
 * address: each one asks Google's FreeBusy for the owner's calendar.
 * Generous: a visit takes one per meeting type looked at (a few for a booking
 * horizon past 62 days) and one per date picked
 */
export const AVAILABILITY_REQUESTS_PER_IP: RateLimit = { limit: 300, windowMs: 60 * 60_000 }
/** Upcoming bookings one email address may hold on one schedule */
export const MAX_UPCOMING_BOOKINGS_PER_EMAIL = 2

/**
 * A pending booking (no event id recorded) whose hold is older than this was
 * abandoned, unless Google has its event. The hold is renewed just before the
 * event insert, which times out well within this
 */
const PENDING_BOOKING_TIMEOUT_MS = 4 * EVENT_INSERT_TIMEOUT_MS

/** Pending bookings held since this instant hold their slot without asking Google */
const liveHoldsSince = () => new Date(Date.now() - PENDING_BOOKING_TIMEOUT_MS)

const SLOT_TAKEN = 'This slot is no longer available'

/**
 * Id of the Google event of a booking: the booking's id, in Google's base32hex
 * alphabet (hex digits are a subset). Google can then be asked whether a
 * booking's event exists even when the API never got its response
 */
export const bookingEventId = (id: Types.ObjectId) => id.toHexString()

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

/** Counts a booking request from an IP; throws TooManyRequestsError (429) over the limit */
export async function limitBookingRequestsFromIp(ip: string | null) {
  // Unknown without a server or proxy header (tests)
  if (!ip) return
  const retryAfter = await consumeRateLimit(rateLimitKey('book:ip', rateLimitAddress(ip)), BOOKING_REQUESTS_PER_IP)
  if (retryAfter !== null) {
    throw new TooManyRequestsError(
      `Too many booking requests from your network. Try again in ${waitText(retryAfter)}`,
      retryAfter
    )
  }
}

/** Counts an availability lookup from an IP; throws TooManyRequestsError (429) over the limit */
export async function limitAvailabilityRequestsFromIp(ip: string | null) {
  // Unknown without a server or proxy header (tests)
  if (!ip) return
  const key = rateLimitKey('availability:ip', rateLimitAddress(ip))
  const retryAfter = await consumeRateLimit(key, AVAILABILITY_REQUESTS_PER_IP)
  if (retryAfter !== null) {
    throw new TooManyRequestsError(
      `Too many requests from your network. Try again in ${waitText(retryAfter)}`,
      retryAfter
    )
  }
}

/**
 * Counts a booking request for an email, once its slot is known to be free;
 * throws TooManyRequestsError (429) over the limit
 */
export async function limitBookingRequestsForEmail(email: string) {
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
 * Whether a booking still holds its slot: pending and recently held (its
 * request may be creating the event), or its event exists in Google at the
 * booked time. False once the event was cancelled, deleted or moved in Google
 * Calendar directly, or when an abandoned booking's event was never created.
 */
async function holdsSlot(calendar: calendar_v3.Calendar, booking: Booking) {
  if (!booking.eventId && booking.heldAt > liveHoldsSince()) return true

  const eventId = booking.eventId ?? bookingEventId(booking._id)
  const event = await getEvent(calendar, booking.calendarId, eventId)
  const holds =
    isAppointmentEvent(event) &&
    Date.parse(event?.start?.dateTime ?? '') === booking.start.getTime() &&
    Date.parse(event?.end?.dateTime ?? '') === booking.end.getTime()
  // Created, but the API stopped before recording it: record it now
  if (holds && !booking.eventId) {
    await AppointmentBooking.updateOne({ _id: booking._id, eventId: null }, { $set: { eventId } })
  }
  return holds
}

/**
 * Busy blocks of the owner's bookings between two instants that hold their
 * slot whatever Google says: pending ones whose request may be creating the
 * event right now (FreeBusy does not show it yet). Not confirmed bookings:
 * their event is on the calendar, where FreeBusy sees it, and one the owner
 * deleted in Google Calendar must free its slot (reserveSlot then takes the
 * booking over)
 */
export async function heldBookingBlocks(userId: Types.ObjectId, from: Date, to: Date) {
  const held = await AppointmentBooking.find(
    {
      user: userId,
      eventId: null,
      heldAt: { $gt: liveHoldsSince() },
      start: { $lt: to },
      end: { $gt: from }
    },
    { start: 1, end: 1 }
  ).lean<Pick<Booking, 'start' | 'end'>[]>()
  return held.map(({ start, end }) => ({ start: start.toISOString(), end: end.toISOString() }))
}

/** Deletes a booking that no longer holds its slot; false when it still does */
async function dropIfStale(calendar: calendar_v3.Calendar, booking: Booking) {
  if (await holdsSlot(calendar, booking)) return false
  // Unless it changed since it was read: confirmed, or its request renewed the hold
  await AppointmentBooking.deleteOne({
    _id: booking._id,
    eventId: booking.eventId ?? null,
    heldAt: booking.heldAt
  })
  return true
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
    if (holder && !(await dropIfStale(calendar, holder))) throw new SlotUnavailableError(SLOT_TAKEN)
  }
  throw new SlotUnavailableError(SLOT_TAKEN)
}

/**
 * Reserves a slot for a visitor before its Google event is created, so two
 * requests that both found the slot free in Google FreeBusy cannot both book
 * it. Throws SlotUnavailableError (409) when a booking holds the slot or
 * overlaps it (any of the owner's calendars), TooManyRequestsError (429) when
 * the email already holds MAX_UPCOMING_BOOKINGS_PER_EMAIL upcoming bookings of
 * the schedule. Returns the booking's id: create the event with
 * bookingEventId(id) right away, then confirm or release the booking.
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
    const others = await AppointmentBooking.find({
      _id: { $ne: id },
      schedule: fields.schedule,
      emailHash: fields.emailHash,
      end: { $gt: new Date() }
    }).lean<Booking[]>()
    let held = others.length
    // At the cap: only bookings that still hold their slot count
    if (held >= MAX_UPCOMING_BOOKINGS_PER_EMAIL) {
      held = 0
      for (const booking of others) if (!(await dropIfStale(calendar, booking))) held++
    }
    if (held >= MAX_UPCOMING_BOOKINGS_PER_EMAIL) {
      throw new TooManyRequestsError(
        'This email address already has the maximum number of upcoming bookings for this meeting'
      )
    }

    // Another schedule (whatever its calendar, or the alias it names it by:
    // the owner is one person), or a slot grid shifted by a schedule edit
    const overlapping = await AppointmentBooking.find({
      _id: { $ne: id },
      user: fields.user,
      start: { $lt: end },
      end: { $gt: start }
    }).lean<Booking[]>()
    for (const booking of overlapping) {
      if (!(await dropIfStale(calendar, booking))) throw new SlotUnavailableError(SLOT_TAKEN)
    }
  } catch (error) {
    await releaseBooking(id)
    throw error
  }

  // The checks above may have waited on Google: renew the hold for the event
  // insert. Fails when another request took this booking for abandoned meanwhile
  const renewed = await AppointmentBooking.updateOne(
    { _id: id, eventId: null },
    { $set: { heldAt: new Date() } }
  )
  if (renewed.matchedCount === 0) throw new SlotUnavailableError(SLOT_TAKEN)
  return id
}

/** Records the Google event of a reserved booking */
export async function confirmBooking(id: Types.ObjectId, eventId: string | null | undefined) {
  if (!eventId) return
  try {
    await AppointmentBooking.updateOne({ _id: id }, { $set: { eventId } })
  } catch (error) {
    // Still pending: the next booking of the slot finds the event by its id and records it
    logger.error('Could not record the event of a booking', {
      errorName: error instanceof Error ? error.name : typeof error
    })
  }
}

/** Frees a reserved slot whose event Google refused */
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
