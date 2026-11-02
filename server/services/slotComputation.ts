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

/**
 * Convert a wall-clock date + time in a given IANA timezone to a UTC Date.
 * Uses Intl to derive the UTC offset without locale-dependent parsing.
 */
export function wallClockToUTC(dateStr: string, time: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)

  // Build an approximate UTC date, then use Intl to find the real offset
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))

  // Get the wall-clock parts as they'd appear in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(approxUtc)

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  const wallH = get('hour') === 24 ? 0 : get('hour')
  const wallM = get('minute')

  // Offset = (what the clock shows at approxUtc) - (what we want the clock to show),
  // compared as full timestamps so a shown time that crosses midnight (e.g. 23:59
  // Paris -> 01:59 next day) yields the true UTC offset instead of ~-22h
  const shownUtc = Date.UTC(get('year'), get('month') - 1, get('day'), wallH, wallM)
  const wantedUtc = Date.UTC(year, month - 1, day, hour, minute)
  const offsetMs = shownUtc - wantedUtc

  return new Date(approxUtc.getTime() - offsetMs)
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
