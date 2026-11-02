import { addDays } from 'portfolio-common'
import type { AppointmentSchedule } from '../models/database/appointmentSchedule'

export interface BusyBlock {
  start: string
  end: string
}

export interface Slot {
  start: string
  end: string
}

interface TimeWindow {
  startTime: string
  endTime: string
}

const DAY_MS = 24 * 60 * 60 * 1000

// One formatter per time zone: building one costs far more than using it.
// Schedules name few zones; the cap only bounds what odd spellings could add
const wallClockFormatters = new Map<string, Intl.DateTimeFormat>()
const MAX_CACHED_FORMATTERS = 64

const wallClockFormatter = (timezone: string) => {
  let formatter = wallClockFormatters.get(timezone)
  if (!formatter) {
    if (wallClockFormatters.size >= MAX_CACHED_FORMATTERS) wallClockFormatters.clear()
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
    wallClockFormatters.set(timezone, formatter)
  }
  return formatter
}

/** Offset of an IANA time zone from UTC at an instant, in ms (Paris in summer: +2 hours) */
function utcOffsetAt(instant: number, timezone: string): number {
  const parts = wallClockFormatter(timezone).formatToParts(new Date(instant))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  // What the clock shows, read as if it were UTC
  const shown = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  )
  return shown - (instant - (instant % 1000))
}

/**
 * The instant a wall-clock date + time (YYYY-MM-DD, HH:mm) of an IANA time
 * zone happens. On a DST change day the offset is the one in force at that
 * instant, not the one of the wall time read as UTC (Los Angeles, 14 March
 * 2027: 09:00 is 16:00 UTC, though 09:00 UTC is still winter time there). A
 * time the clocks go through twice (they go back) is the first one; a time
 * they skip (02:30 when they jump from 02:00 to 03:00) is read with the offset
 * before the change, which lands as far past it (03:30), unless that is on the
 * next date (Nuuk, 28 March 2026: 23:00 -> 00:00): the instant is always on
 * the date asked, where the slots of that date are looked for.
 */
export function wallClockToUTC(dateStr: string, time: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)

  // The instant is within 14 hours of the wall time read as UTC: a DST change
  // near it shows as different offsets a day either side
  const before = utcOffsetAt(wall - DAY_MS, timezone)
  const after = utcOffsetAt(wall + DAY_MS, timezone)
  if (before === after) return new Date(wall - before)

  // The instants that show the wall time: two, one, or none (skipped)
  const showingWall = [wall - before, wall - after].filter(
    (instant) => utcOffsetAt(instant, timezone) === wall - instant
  )
  if (showingWall.length > 0) return new Date(Math.min(...showingWall))
  const later = wall - before
  const laterDate = new Date(later + utcOffsetAt(later, timezone)).toISOString().slice(0, 10)
  return new Date(laterDate === dateStr ? later : wall - after)
}

/** Whether Intl knows this IANA time zone (e.g. 'Europe/Paris') */
export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * The free slots of a date (YYYY-MM-DD in the schedule's time zone): its
 * availability windows (a date override, else the weekly windows of its day),
 * cut into slots, without those starting within the minimum notice of `now`
 * or overlapping a busy block
 */
export function computeAvailableSlots(
  schedule: AppointmentSchedule,
  date: string,
  busyBlocks: BusyBlock[],
  now: number = Date.now()
): Slot[] {
  const dayOfWeek = getDayOfWeek(date)
  const windows = getWindowsForDate(schedule, date, dayOfWeek)

  if (windows.length === 0) return []

  const slotDuration = (schedule.durationMinutes ?? 30) + (schedule.bufferMinutes ?? 0)
  const minNoticeMs = (schedule.minNoticeHours ?? 24) * 60 * 60 * 1000
  const slots: Slot[] = []

  for (const window of windows) {
    const windowStart = wallClockToUTC(date, window.startTime, schedule.timezone)
    const windowEnd = wallClockToUTC(date, window.endTime, schedule.timezone)

    let cursor = windowStart.getTime()

    while (cursor + (schedule.durationMinutes ?? 30) * 60_000 <= windowEnd.getTime()) {
      const slotStart = new Date(cursor)
      const slotEnd = new Date(cursor + (schedule.durationMinutes ?? 30) * 60_000)

      if (slotStart.getTime() - now < minNoticeMs) {
        cursor += slotDuration * 60_000
        continue
      }

      const startIso = slotStart.toISOString()
      const endIso = slotEnd.toISOString()

      if (!overlapsWithBusy(startIso, endIso, busyBlocks)) {
        slots.push({ start: startIso, end: endIso })
      }

      cursor += slotDuration * 60_000
    }
  }

  return slots
}

/**
 * computeAvailableSlots for every date from `from` to `to` (YYYY-MM-DD in the
 * schedule's time zone), against the busy blocks of the whole range. Each date
 * only gets the blocks that overlap it: its slots cannot overlap the others
 */
export function computeAvailableSlotsByDate(
  schedule: AppointmentSchedule,
  from: string,
  to: string,
  busyBlocks: BusyBlock[],
  now: number = Date.now()
): Map<string, Slot[]> {
  const blocks = busyBlocks.map((block) => ({
    block,
    start: new Date(block.start).getTime(),
    end: new Date(block.end).getTime()
  }))
  const slotsByDate = new Map<string, Slot[]>()

  let dayStart = wallClockToUTC(from, '00:00', schedule.timezone).getTime()
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const dayEnd = wallClockToUTC(addDays(date, 1), '00:00', schedule.timezone).getTime()
    const busy = blocks
      .filter(({ start, end }) => start < dayEnd && end > dayStart)
      .map(({ block }) => block)
    slotsByDate.set(date, computeAvailableSlots(schedule, date, busy, now))
    dayStart = dayEnd
  }
  return slotsByDate
}

/**
 * Day of the week of a calendar date (0 = Sunday). The date is already the
 * one of the schedule's time zone: its weekday is the same everywhere. (Read
 * from 12:00 UTC in that zone, it was the next day from UTC+12 on: Auckland)
 */
function getDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

function getWindowsForDate(
  schedule: AppointmentSchedule,
  date: string,
  dayOfWeek: number
): TimeWindow[] {
  const override = schedule.dateOverrides?.find((o) => o.date === date)
  if (override) {
    if (!override.available) return []
    if (override.windows && override.windows.length > 0) {
      return override.windows
    }
  }

  return (schedule.availability ?? [])
    .filter((a) => a.dayOfWeek === dayOfWeek)
    .map((a) => ({ startTime: a.startTime, endTime: a.endTime }))
}

function overlapsWithBusy(start: string, end: string, busyBlocks: BusyBlock[]): boolean {
  const slotStart = new Date(start).getTime()
  const slotEnd = new Date(end).getTime()

  return busyBlocks.some((block) => {
    const busyStart = new Date(block.start).getTime()
    const busyEnd = new Date(block.end).getTime()
    return slotStart < busyEnd && slotEnd > busyStart
  })
}
