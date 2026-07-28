import type { AppointmentSchedule } from '../models/database/appointmentSchedule'

interface BusyBlock {
  start: string
  end: string
}

interface Slot {
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

/** The YYYY-MM-DD wall-clock date of an instant in a given IANA timezone. */
export function wallDateInTimezone(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(instant)
}

export function computeAvailableSlots(
  schedule: AppointmentSchedule,
  date: string,
  busyBlocks: BusyBlock[]
): Slot[] {
  const dayOfWeek = getDayOfWeek(date, schedule.timezone)
  const windows = getWindowsForDate(schedule, date, dayOfWeek)

  if (windows.length === 0) return []

  const slotDuration = (schedule.durationMinutes ?? 30) + (schedule.bufferMinutes ?? 0)
  const minNoticeMs = (schedule.minNoticeHours ?? 24) * 60 * 60 * 1000
  const now = Date.now()
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

function getDayOfWeek(dateStr: string, timezone: string): number {
  const date = new Date(dateStr + 'T12:00:00Z')
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: timezone
  })
  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  }
  return dayMap[formatted] ?? 0
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
