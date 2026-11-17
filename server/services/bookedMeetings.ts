import { Types } from 'mongoose'
import { AppointmentBooking, AppointmentSchedule, Domain } from '../models/database'
import { dropIfStale } from './appointmentBookings'
import type { Booking } from './appointmentBookings'
import { getCalendarClient } from './googleCalendar'
import { logger } from './logger'
import { consumeRateLimit, rateLimitKey } from './rateLimit'
import type { RateLimit } from './rateLimit'

// The meetings an account booked on other people's portfolios, signed in
// (POST /appointments/book records the visitor): what GET /appointments/booked
// lists so a recruiter finds them, and joins them, from their space. A booking
// is removed by MongoDB once its slot is over, so every one listed is upcoming
// or under way.

/** The most meetings listed: an account holds few (each email at most 2 per schedule) */
export const MAX_BOOKED_MEETINGS = 20

/**
 * Lists asked of Google per account: each one checks every meeting with its
 * owner's calendar (one request per meeting, on the owner's Google quota).
 * Beyond it, the list is answered from what the bookings recorded
 */
export const BOOKED_MEETING_CHECKS_PER_ACCOUNT: RateLimit = { limit: 60, windowMs: 60 * 60_000 }

export type BookedMeetingLocation = 'google_meet' | 'phone' | 'in_person' | 'custom'

/** What the visitor sees of a meeting they booked: never the owner's account, calendar or event */
export interface BookedMeeting {
  id: string
  start: Date
  end: Date
  /** The schedule's title ("Intro call"), null when the owner deleted the schedule */
  title: string | null
  /** The owner's portfolio: its address name and header title; null when they have none anymore */
  portfolio: { name: string; title: string | null } | null
  location: BookedMeetingLocation
  /** The owner's phone number, address or instructions, for a meeting outside Google Meet */
  locationDetails: string | null
  meetLink: string | null
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error)

/**
 * The bookings Google says are gone, cancelled or moved, removed as a
 * booking of the slot would remove them (dropIfStale). A meeting is kept when
 * Google could not be asked (owner's calendar disconnected, no answer): its
 * invitation is the reference, and the next list asks again
 */
async function droppedBookings(bookings: Booking[]) {
  const byOwner = new Map<string, Booking[]>()
  for (const booking of bookings) {
    const owner = booking.user.toHexString()
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), booking])
  }
  const dropped = new Set<string>()
  await Promise.all(
    [...byOwner].map(async ([owner, ownerBookings]) => {
      let calendar
      try {
        calendar = await getCalendarClient(owner)
      } catch {
        return
      }
      await Promise.all(
        ownerBookings.map(async (booking) => {
          try {
            if (await dropIfStale(calendar, booking)) dropped.add(booking._id.toHexString())
          } catch (error) {
            logger.warn('Could not check a booked meeting with Google', { errorName: errorName(error) })
          }
        })
      )
    })
  )
  return dropped
}

/** The upcoming meetings `visitorId` booked, the soonest first */
export async function listBookedMeetings(visitorId: string): Promise<BookedMeeting[]> {
  const visitor = new Types.ObjectId(visitorId)
  const bookings = await AppointmentBooking.find({
    visitor,
    // Confirmed only: a pending one may still be refused by Google
    eventId: { $ne: null },
    end: { $gt: new Date() }
  })
    .sort({ start: 1 })
    .limit(MAX_BOOKED_MEETINGS)
    .lean<Booking[]>()
  if (bookings.length === 0) return []

  const overLimit = await consumeRateLimit(rateLimitKey('booked-meetings', visitorId), BOOKED_MEETING_CHECKS_PER_ACCOUNT)
  const dropped = overLimit === null ? await droppedBookings(bookings) : new Set<string>()
  const listed = bookings.filter((booking) => !dropped.has(booking._id.toHexString()))
  if (listed.length === 0) return []

  const owners = [...new Set(listed.map((booking) => booking.user.toHexString()))]
  const [schedules, domains] = await Promise.all([
    AppointmentSchedule.find(
      { _id: { $in: listed.map((booking) => booking.schedule) } },
      { title: 1, locationType: 1, locationDetails: 1 }
    ).lean(),
    Domain.find({ admin: { $in: owners } }, { name: 1, admin: 1, headerTitle: 1 })
      .sort({ name: 1 })
      .lean()
  ])
  const scheduleOf = new Map(schedules.map((schedule) => [schedule._id.toHexString(), schedule]))
  const portfolioOf = new Map<string, BookedMeeting['portfolio']>()
  for (const domain of domains) {
    const owner = String(domain.admin)
    // An owner with several domains: the first by name, as on every read
    if (!portfolioOf.has(owner)) {
      portfolioOf.set(owner, { name: domain.name, title: domain.headerTitle?.trim() || null })
    }
  }

  return listed.map((booking) => {
    const schedule = scheduleOf.get(booking.schedule.toHexString())
    return {
      id: booking._id.toHexString(),
      start: booking.start,
      end: booking.end,
      title: schedule?.title ?? null,
      portfolio: portfolioOf.get(booking.user.toHexString()) ?? null,
      location: (schedule?.locationType ?? 'google_meet') as BookedMeetingLocation,
      locationDetails: schedule?.locationDetails?.trim() || null,
      meetLink: booking.meetLink ?? null
    }
  })
}
